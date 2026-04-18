const { Telegraf } = require('telegraf');
const fs = require('fs-extra');
const path = require('path');

const BOT_TOKEN = '8769563158:AAGppuyU95d2qUiZSX3-5qFCVpqaG83bbA4'; // Your token
const FRONTEND_URL = 'https://mini-app-bingo.onrender.com'; // Your frontend URL

// Admin Telegram user IDs – replace with your own ID(s)
const ADMINS = [5423314276]; // <-- CHANGE THIS TO YOUR TELEGRAM USER ID

const bot = new Telegraf(BOT_TOKEN);

// Paths to JSON files (same as server.js)
const USERS_FILE = './users.json';
const REQUESTS_FILE = './requests.json';
function loadUsers() {
    try { return fs.readJsonSync(USERS_FILE); } catch(e) { return {}; }
}
function saveUsers(users) {
    fs.writeJsonSync(USERS_FILE, users, { spaces: 2 });
}
function loadRequests() {
    try { return fs.readJsonSync(REQUESTS_FILE); } catch(e) { return []; }
}
function saveRequests(requests) {
    fs.writeJsonSync(REQUESTS_FILE, requests, { spaces: 2 });
}

// Helper: find user by username (since users object key is username)
function getUserByUsername(username, users) {
    return users[username];
}

// ---------- Admin Commands ----------
bot.command('pending', async (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) return ctx.reply('⛔ Unauthorized.');
    const requests = loadRequests();
    const pending = requests.filter(r => r.status === 'pending');
    if (pending.length === 0) return ctx.reply('No pending requests.');
    let msg = '📋 *Pending Requests:*\n';
    pending.forEach(r => {
        msg += `\`${r.id}\` | ${r.username} | ${r.type} | ${r.amount} credits\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('approve', async (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) return ctx.reply('⛔ Unauthorized.');
    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) return ctx.reply('Usage: /approve <requestId>');
    const requestId = parts[1];

    let requests = loadRequests();
    const reqIndex = requests.findIndex(r => r.id === requestId);
    if (reqIndex === -1) return ctx.reply('Request not found.');
    const req = requests[reqIndex];
    if (req.status !== 'pending') return ctx.reply('Request already processed.');

    let users = loadUsers();
    const user = getUserByUsername(req.username, users);
    if (!user) return ctx.reply('User not found.');

    if (req.type === 'deposit') {
        user.balance += req.amount;
    } else if (req.type === 'withdraw') {
        if (user.balance >= req.amount) {
            user.balance -= req.amount;
        } else {
            return ctx.reply('Insufficient balance for this withdrawal.');
        }
    }
    saveUsers(users);

    req.status = 'approved';
    saveRequests(requests);

    ctx.reply(`✅ Approved ${req.type} of ${req.amount} credits for ${req.username}`);
    // Notify the user via Telegram
    try {
        await bot.telegram.sendMessage(user.telegramId || user.userId, 
            `✅ Your ${req.type} request of ${req.amount} credits has been APPROVED.\nNew balance: ${user.balance}`);
    } catch (err) {
        console.log('Could not notify user (maybe no telegramId stored).');
    }
});

bot.command('reject', async (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) return ctx.reply('⛔ Unauthorized.');
    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) return ctx.reply('Usage: /reject <requestId>');
    const requestId = parts[1];

    let requests = loadRequests();
    const reqIndex = requests.findIndex(r => r.id === requestId);
    if (reqIndex === -1) return ctx.reply('Request not found.');
    const req = requests[reqIndex];
    if (req.status !== 'pending') return ctx.reply('Request already processed.');

    req.status = 'rejected';
    saveRequests(requests);

    ctx.reply(`❌ Rejected ${req.type} request for ${req.username}`);
    // Notify the user
    const users = loadUsers();
    const user = getUserByUsername(req.username, users);
    if (user) {
        try {
            await bot.telegram.sendMessage(user.telegramId || user.userId,
                `❌ Your ${req.type} request of ${req.amount} credits has been REJECTED.`);
        } catch (err) {}
    }
});

// ---------- Start command (inline button with tgId) ----------
bot.start((ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const url = `${FRONTEND_URL}?tgId=${userId}&username=${encodeURIComponent(username)}`;
    ctx.reply(`🎲 Welcome ${username}! Click below to play Bingo:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎮 OPEN BINGO', web_app: { url } }]
            ]
        }
    });
});

bot.launch();
console.log('Bot is running with admin approval commands.');