const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const usersByTelegramId = {}; // 
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

require('dotenv').config();

/* =======================
   MIDDLEWARE
======================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'bingo_super_secret_key_change_me',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

/* =======================
   FRONTEND
======================= */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/* =======================
   USERS (JSON DB)
======================= */
const USERS_FILE = './users.json';
fs.ensureFileSync(USERS_FILE);

let users = {};
try { users = fs.readJsonSync(USERS_FILE); } catch { users = {}; }

function saveUsers() {
    fs.writeJsonSync(USERS_FILE, users, { spaces: 2 });
}

/* =======================
   REQUESTS
======================= */
const REQUESTS_FILE = './requests.json';
fs.ensureFileSync(REQUESTS_FILE);

let pendingRequests = [];
try { pendingRequests = fs.readJsonSync(REQUESTS_FILE); } catch { pendingRequests = []; }

function saveRequests() {
    fs.writeJsonSync(REQUESTS_FILE, pendingRequests, { spaces: 2 });
}

/* =======================
   SOCKET USERS MAP
======================= */
const socketUsers = new Map();

/* =======================
   GAME STATE
======================= */
let players = {};
let takenCards = new Set();
let gameActive = false;
let calledNumbers = [];
let autoInterval = null;
let countdownTimeout = null;
let countdownSeconds = 30;
let isLobbyOpen = true;

const GAME_COST = 10;
const HOUSE_PERCENT = 0.2;

/* =======================
   HELPERS
======================= */
function getUserById(userId) {
    return users[userId];
}

function updateBalance(userId, amount) {
    if (!users[userId]) return;

    users[userId].balance += amount;
    saveUsers();

    io.emit("balanceUpdateGlobal", {
        userId,
        balance: users[userId].balance
    });
}

/* =======================
   SOCKET.IO
======================= */
io.on('connection', (socket) => {

    console.log("Client connected:", socket.id);

    /* ---------- AUTH ---------- */
    socket.on("auth", ({ telegramId }) => {
    socket.telegramId = telegramId;

    const user = usersByTelegramId[telegramId];

    if (user) {
        socket.emit("balanceUpdate", user.balance);
    }
});

    /* ---------- SELECT CARD ---------- */
    socket.on('selectCard', ({ name, cardNumber }) => {

        if (!isLobbyOpen) {
            socket.emit('joinError', 'Game already started');
            return;
        }

        const num = parseInt(cardNumber);
        if (isNaN(num) || num < 1 || num > 100) return;

        if (takenCards.has(num)) {
            socket.emit('joinError', 'Card already taken');
            return;
        }

        if (players[socket.id]) {
            takenCards.delete(players[socket.id].cardNumber);
        }

        takenCards.add(num);

        players[socket.id] = {
            id: socket.id,
            name: name || socket.username,
            cardNumber: num,
            marked: new Array(25).fill(false),
            userId: socket.userId,
            username: socket.username
        };

        players[socket.id].marked[12] = true;

        socket.emit('cardAssigned', {
            playerId: socket.id,
            cardNumber: num,
            gameActive
        });

        io.emit('playersList',
            Object.values(players).map(p => ({
                id: p.id,
                name: p.name,
                cardNumber: p.cardNumber
            }))
        );
    });

    /* ---------- MARK NUMBER ---------- */
    socket.on('markNumber', ({ cellIndex, number }) => {

        const player = players[socket.id];
        if (!player || !gameActive) return;

        if (!calledNumbers.includes(number)) return;

        if (player.marked[cellIndex]) return;

        player.marked[cellIndex] = true;

        socket.emit('markConfirmed', { cellIndex, number });
    });

    /* ---------- DISCONNECT ---------- */
    socket.on('disconnect', () => {

        if (players[socket.id]) {
            takenCards.delete(players[socket.id].cardNumber);
            delete players[socket.id];
        }

        socketUsers.delete(socket.id);

        io.emit('playersList',
            Object.values(players).map(p => ({
                id: p.id,
                name: p.name,
                cardNumber: p.cardNumber
            }))
        );
    });
});

/* =======================
   AUTH API (OPTIONAL)
======================= */
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (users[username]) {
        return res.status(400).json({ error: "User exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    users[username] = {
        userId: uuidv4(),
        username,
        password: hashed,
        balance: 10
    };

    saveUsers();

    res.json({ success: true });
});

/* =======================
   SERVER START
======================= */
const PORT = process.env.PORT || 13926;
server.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});