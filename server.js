require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

// ======================
// OPTIONAL NEON DB (SAFE)
// ======================
let neon = null;
if (process.env.DATABASE_URL) {
    const { Pool } = require('@neondatabase/serverless');
    neon = new Pool({ connectionString: process.env.DATABASE_URL });
}

// ======================
// APP INIT
// ======================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ======================
// MIDDLEWARE
// ======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
});

app.use(sessionMiddleware);
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

// ======================
// FRONTEND
// ======================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ======================
// MEMORY DB (fallback)
// ======================
let users = {};
let requests = [];

// ======================
// TELEGRAM VERIFY
// ======================
function verifyTelegram(initData) {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const dataCheck = [...urlParams.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

    const secret = crypto
        .createHash('sha256')
        .update(process.env.TELEGRAM_BOT_TOKEN)
        .digest();

    const hmac = crypto
        .createHmac('sha256', secret)
        .update(dataCheck)
        .digest('hex');

    return hmac === hash;
}

// ======================
// AUTH API
// ======================
app.post('/api/telegram-auth', (req, res) => {
    const { initData } = req.body;

    if (!verifyTelegram(initData)) {
        return res.status(403).json({ error: 'Invalid Telegram data' });
    }

    const params = new URLSearchParams(initData);
    const userData = JSON.parse(params.get('user'));

    const id = String(userData.id);
    const username = userData.username || userData.first_name;

    if (!users[id]) {
        users[id] = {
            id,
            username,
            balance: 100, // casino starter bonus
            createdAt: Date.now()
        };
    }

    req.session.userId = id;

    res.json({
        success: true,
        userId: id,
        username,
        balance: users[id].balance
    });
});

// ======================
// LOGOUT
// ======================
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {});
    res.json({ success: true });
});

// ======================
// GAME ENGINE (CASINO BINGO)
// ======================
let players = {};
let takenCards = new Set();
let gameActive = false;
let lobbyOpen = true;

const CARD_COST = 10;
const HOUSE_EDGE = 0.2;

// ======================
// CARD GENERATOR
// ======================
function generateCard(seed) {
    const rand = (s) => Math.abs(Math.sin(s++) * 10000) % 1;

    const col = (min, max, off) => {
        let arr = [];
        let s = seed + off;
        while (arr.length < 5) {
            let n = Math.floor(rand(s++) * (max - min + 1)) + min;
            if (!arr.includes(n)) arr.push(n);
        }
        return arr;
    };

    const card = [];
    const B = col(1, 15, 1);
    const I = col(16, 30, 2);
    const N = col(31, 45, 3);
    const G = col(46, 60, 4);
    const O = col(61, 75, 5);

    for (let i = 0; i < 5; i++) {
        card.push(B[i], I[i], N[i], G[i], O[i]);
    }

    card[12] = "FREE";
    return card;
}

// ======================
// SOCKET AUTH FIX
// ======================
io.use((socket, next) => {
    const sess = socket.request.session;

    if (!sess?.userId) return next(new Error("Unauthorized"));

    socket.userId = sess.userId;
    socket.username = users[sess.userId]?.username;

    next();
});

// ======================
// SOCKET GAME
// ======================
io.on('connection', (socket) => {

    socket.on('selectCard', ({ cardNumber }) => {
        if (!lobbyOpen) return;
        if (takenCards.has(cardNumber)) return;

        const user = users[socket.userId];
        if (!user || user.balance < CARD_COST) return;

        user.balance -= CARD_COST;

        takenCards.add(cardNumber);

        players[socket.id] = {
            socketId: socket.id,
            userId: socket.userId,
            username: socket.username,
            cardNumber,
            card: generateCard(cardNumber),
            marked: Array(25).fill(false)
        };

        players[socket.id].marked[12] = true;

        socket.emit('cardAssigned', players[socket.id]);
        io.to(socket.id).emit('balanceUpdate', user.balance);
    });

    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p) {
            takenCards.delete(p.cardNumber);
            delete players[socket.id];
        }
    });
});

// ======================
// START GAME (AUTO)
// ======================
function startGame() {
    if (gameActive) return;
    gameActive = true;
    lobbyOpen = false;

    io.emit('gameStarted');
}

// ======================
// SERVER
// ======================
const PORT = process.env.PORT || 13926;
server.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
