const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

require('dotenv').config();

/* =======================
   MIDDLEWARE
======================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =======================
   FRONTEND
======================= */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/* =======================
   USERS DB (JSON)
   KEY = Telegram ID
======================= */
const USERS_FILE = './users.json';
fs.ensureFileSync(USERS_FILE);

let users = {};
try { users = fs.readJsonSync(USERS_FILE); } catch { users = {}; }

function saveUsers() {
    fs.writeJsonSync(USERS_FILE, users, { spaces: 2 });
}

/* =======================
   SOCKET USER AUTH MAP
======================= */
const socketUsers = new Map();

/* =======================
   GAME STATE
======================= */
let players = {};
let takenCards = new Set();
let gameActive = false;
let calledNumbers = [];
let isLobbyOpen = true;

/* =======================
   SOCKET.IO
======================= */
io.on('connection', (socket) => {

    console.log("Client connected:", socket.id);

    /* =======================
       AUTH (Telegram Login)
    ======================= */
    socket.on("auth", ({ telegramId }) => {

        if (!telegramId) return;

        socket.telegramId = telegramId;

        // CREATE USER IF NOT EXISTS
        if (!users[telegramId]) {
            users[telegramId] = {
                userId: telegramId,
                balance: 0
            };
            saveUsers();
        }

        socketUsers.set(socket.id, telegramId);

        // SEND BALANCE TO USER
        socket.emit("balanceUpdate", users[telegramId].balance);
    });

    /* =======================
       SELECT CARD
    ======================= */
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

        const telegramId = socket.telegramId;
        if (!telegramId) {
            socket.emit('joinError', 'Not authenticated');
            return;
        }

        takenCards.add(num);

        players[socket.id] = {
            id: socket.id,
            name: name || "Player",
            cardNumber: num,
            marked: new Array(25).fill(false),
            telegramId: telegramId
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

    /* =======================
       MARK NUMBER
    ======================= */
    socket.on('markNumber', ({ cellIndex, number }) => {

        const player = players[socket.id];
        if (!player || !gameActive) return;

        if (!calledNumbers.includes(number)) return;

        if (player.marked[cellIndex]) return;

        player.marked[cellIndex] = true;

        socket.emit('markConfirmed', { cellIndex, number });
    });

    /* =======================
       DISCONNECT
    ======================= */
    socket.on('disconnect', () => {

        const telegramId = socketUsers.get(socket.id);

        socketUsers.delete(socket.id);

        if (players[socket.id]) {
            takenCards.delete(players[socket.id].cardNumber);
            delete players[socket.id];
        }

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
   API (Optional login/register)
======================= */
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password)
        return res.status(400).json({ error: "Missing fields" });

    const hashed = await bcrypt.hash(password, 10);

    users[username] = {
        userId: username,
        password: hashed,
        balance: 10
    };

    saveUsers();

    res.json({ success: true });
});

/* =======================
   BALANCE UPDATE FUNCTION
======================= */
function updateBalance(telegramId, amount) {

    if (!users[telegramId]) return;

    users[telegramId].balance += amount;
    saveUsers();

    io.emit("balanceUpdateGlobal", {
        telegramId,
        balance: users[telegramId].balance
    });
}

/* =======================
   SERVER START
======================= */
const PORT = process.env.PORT || 13926;
server.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});