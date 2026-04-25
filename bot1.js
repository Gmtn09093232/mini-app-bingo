
const { Telegraf } = require('telegraf');
const fs = require('fs-extra');

/* ========= CONFIG ========= */
const BOT_TOKEN = "8728360769:AAHhvEWPqQ39d88v3rSa7dYWYrL5bqFKZrw"; // <-- change this
const FRONTEND_URL = "https://mini-app-bingo.onrender.com";

/* ========= INIT ========= */
const bot = new Telegraf(BOT_TOKEN);
const USERS_FILE = './users.json';
const userStates = new Map();

/* ========= LOAD USERS ========= */
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

/* ========= START ========= */
bot.start((ctx) => {
  const id = ctx.from.id;
  const username = ctx.from.username || "player";

  if (!users[id]) {
    users[id] = {
      id: id,
      username: username,
      balance: 0
    };
    saveUsers();
  }

  ctx.reply(`Welcome ${username}\nBalance: ${users[id].balance}`, {
    reply_markup: {
      keyboard: [
        ["Play"],
        ["Balance"],
        ["Deposit", "Withdraw"]
      ],
      resize_keyboard: true
    }
  });
});

/* ========= PLAY ========= */
bot.hears("Play", (ctx) => {
  const url = `${FRONTEND_URL}?tgId=${ctx.from.id}&username=${ctx.from.username}`;

  ctx.reply("Open game:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Play Now", web_app: { url } }]
      ]
    }
  });
});

/* ========= BALANCE ========= */
bot.hears("Balance", (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return ctx.reply("User not found");

  ctx.reply(`Balance: ${user.balance}`);
});

/* ========= DEPOSIT ========= */
bot.hears("Deposit", (ctx) => {
  userStates.set(ctx.from.id, "deposit");
  ctx.reply("Enter amount:");
});

/* ========= WITHDRAW ========= */
bot.hears("Withdraw", (ctx) => {
  userStates.set(ctx.from.id, "withdraw");
  ctx.reply("Enter amount:");
});

/* ========= INPUT ========= */
bot.on("text", (ctx) => {
  const action = userStates.get(ctx.from.id);
  if (!action) return;

  const amount = parseFloat(ctx.message.text);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("Invalid amount");
  }

  const user = users[ctx.from.id];
  if (!user) return ctx.reply("User not found");

  if (action === "deposit") {
    user.balance += amount;
    saveUsers();
    ctx.reply(`Deposited ${amount}`);
  }

  if (action === "withdraw") {
    if (user.balance < amount) {
      return ctx.reply("Not enough balance");
    }
    user.balance -= amount;
    saveUsers();
    ctx.reply(`Withdrawn ${amount}`);
  }

  userStates.delete(ctx.from.id);
});

/* ========= START BOT ========= */
bot.launch();
console.log("Bot running...");