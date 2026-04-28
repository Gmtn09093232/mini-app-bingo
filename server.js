const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const session = require('express-session');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// =====================
// MIDDLEWARE (FIXED)
// =====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sharedSession = session({
    secret: 'bingo_super_secret_key_change_me',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
});

app.use(sharedSession);

// SOCKET SESSION BRIDGE (FIXED)
io.use((socket, next) => {
    sharedSession(socket.request, {}, next);
});

// =====================
// FRONTEND
// =====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// =====================
// USERS DB
// =====================
const USERS_FILE = './users.json';
fs.ensureFileSync(USERS_FILE);

let users = {};
try {
    users = fs.readJsonSync(USERS_FILE);
} catch {
    users = {};
}

function saveUsers() {
    fs.writeJsonSync(USERS_FILE, users, { spaces: 2 });
}

function getUser(req) {
    if (!req.session.userId) return null;
    return users[req.session.userId];
}

// =====================
// TELEGRAM VERIFY
// =====================
function verifyTelegramInitData(initData) {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

    const secretKey = crypto
        .createHash('sha256')
        .update(process.env.TELEGRAM_BOT_TOKEN)
        .digest();

    const hmac = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    return hmac === hash;
}

// =====================
// AUTH (Telegram Mini App)
// =====================
app.post('/api/telegram-miniapp-auth', (req, res) => {
    const { initData } = req.body;

    if (!verifyTelegramInitData(initData)) {
        return res.status(403).json({ error: 'Invalid Telegram data' });
    }

    const params = new URLSearchParams(initData);
    const userData = JSON.parse(params.get('user'));

    const telegramId = String(userData.id);
    const username = userData.username || userData.first_name;

    if (!users[telegramId]) {
        users[telegramId] = {
            userId: telegramId,
            username,
            telegramId,
            balance: 10,
            createdAt: new Date().toISOString()
        };
        saveUsers();
    }

    req.session.userId = telegramId;

    res.json({
        success: true,
        userId: telegramId,
        username,
        balance: users[telegramId].balance
    });
});

// =====================
// LOGOUT
// =====================
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// =====================
// REQUESTS DB
// =====================
const REQUESTS_FILE = './requests.json';
fs.ensureFileSync(REQUESTS_FILE);

let pendingRequests = [];
try {
    pendingRequests = fs.readJsonSync(REQUESTS_FILE);
} catch {
    pendingRequests = [];
}

function saveRequests() {
    fs.writeJsonSync(REQUESTS_FILE, pendingRequests, { spaces: 2 });
}

// =====================
// DEPOSIT / WITHDRAW
// =====================
app.post('/api/request-deposit', (req, res) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Not logged in' });

    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    pendingRequests.push({
        id: uuidv4(),
        userId: user.userId,
        username: user.username,
        type: 'deposit',
        amount,
        status: 'pending',
        createdAt: new Date().toISOString()
    });

    saveRequests();
    res.json({ success: true });
});

app.post('/api/request-withdraw', (req, res) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Not logged in' });

    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    pendingRequests.push({
        id: uuidv4(),
        userId: user.userId,
        username: user.username,
        type: 'withdraw',
        amount,
        status: 'pending',
        createdAt: new Date().toISOString()
    });

    saveRequests();
    res.json({ success: true });
});

// =====================
// GAME STATE
// =====================
let players = {};
let takenCards = new Set();
let gameActive = false;
let isLobbyOpen = true;

const GAME_COST = 10;
const HOUSE_PERCENT = 0.2;

// =====================
// CARD GENERATOR
// =====================
function generateCardFromNumber(cardNum) {
    function seededRandom(seed) {
        let x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    function column(min, max, seedOffset) {
        let col = [];
        let seed = cardNum * 131 + seedOffset;

        while (col.length < 5) {
            let n = Math.floor(seededRandom(seed++) * (max - min + 1)) + min;
            if (!col.includes(n)) col.push(n);
        }
        return col;
    }

    let B = column(1, 15, 1);
    let I = column(16, 30, 2);
    let N = column(31, 45, 3);
    let G = column(46, 60, 4);
    let O = column(61, 75, 5);

    let card = [];
    for (let i = 0; i < 5; i++) {
        card.push(B[i], I[i], N[i], G[i], O[i]);
    }

    card[12] = "FREE";
    return card;
}

// =====================
// SOCKET AUTH (FIXED)
// =====================
io.use((socket, next) => {
    const session = socket.request.session;

    if (!session || !session.userId) {
        return next(new Error("Unauthorized"));
    }

    socket.userId = session.userId;
    socket.username = users[session.userId]?.username;

    next();
});

// =====================
// SOCKET EVENTS
// =====================
io.on('connection', (socket) => {

    socket.on('selectCard', ({ name, cardNumber }) => {

        if (!isLobbyOpen) return;

        const num = parseInt(cardNumber);
        if (takenCards.has(num)) return;

        takenCards.add(num);

        players[socket.id] = {
            id: socket.id,
            name,
            cardNumber: num,
            card: generateCardFromNumber(num),
            marked: new Array(25).fill(false),
            userId: socket.userId,
            username: socket.username
        };

        players[socket.id].marked[12] = true;

        socket.emit('cardAssigned', {
            playerId: socket.id,
            card: players[socket.id].card,
            gameActive: false
        });
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            takenCards.delete(players[socket.id].cardNumber);
            delete players[socket.id];
        }
    });
});

// =====================
// SERVER START
// =====================
const PORT = process.env.PORT || 13926;
server.listen(PORT, () =>
    console.log(`✅ Server running on http://localhost:${PORT}`)
);