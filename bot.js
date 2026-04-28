const { Telegraf, Markup } = require('telegraf');
const fs = require('fs-extra');

const BOT_TOKEN = "8687947415:AAEnyvS8LMx3QYWsEaMhX6kB8phSWS4a550"; // 🔴 DO NOT expose real token
const ADMIN_ID = 5423314276;
const FRONTEND_URL = "https://mini-app-bingo.onrender.com";

const bot = new Telegraf(BOT_TOKEN);

// =========================
// FILES
// =========================
const USERS_FILE = './users.json';
const REQUESTS_FILE = './requests.json';

fs.ensureFileSync(USERS_FILE);
fs.ensureFileSync(REQUESTS_FILE);

let users = {};
let requests = [];

try { users = fs.readJsonSync(USERS_FILE); } catch { users = {}; }
try { requests = fs.readJsonSync(REQUESTS_FILE); } catch { requests = []; }

function saveUsers() {
  fs.writeJsonSync(USERS_FILE, users, { spaces: 2 });
}

function saveRequests() {
  fs.writeJsonSync(REQUESTS_FILE, requests, { spaces: 2 });
}

// =========================
// SAFE USER GETTER (FIXED BUG)
// =========================
function getUser(id) {
  const key = String(id);
  if (!users[key]) {
    users[key] = {
      telegramId: key,
      username: "player",
      balance: 0
    };
    saveUsers();
  }
  return users[key];
}

// =========================
// START
// =========================
bot.start((ctx) => {
  const tgId = String(ctx.from.id);
  const username = ctx.from.username || "player";

  const user = getUser(tgId);
  user.username = username;
  saveUsers();

  ctx.reply(
    `Welcome ${username}\nBalance: ${user.balance}`,
    {
      reply_markup: {
        keyboard: [
          ["🎮 Play"],
          ["💰 Balance"],
          ["➕ Deposit", "➖ Withdraw"]
        ],
        resize_keyboard: true
      }
    }
  );
});

// =========================
// PLAY
// =========================
bot.hears("🎮 Play", (ctx) => {
  ctx.reply("🚀 Open Bingo Game:", {
    reply_markup: {
      inline_keyboard: [[
        {
          text: "▶️ Play Now",
          web_app: {
            url: `${FRONTEND_URL}`
          }
        }
      ]]
    }
  });
});

// =========================
// BALANCE
// =========================
bot.hears("💰 Balance", (ctx) => {
  const user = getUser(ctx.from.id);
  ctx.reply(`💰 Balance: ${user.balance}`);
});

// =========================
// STATES
// =========================
const userStates = new Map();

// =========================
// DEPOSIT
// =========================
bot.hears("➕ Deposit", (ctx) => {
  userStates.set(ctx.from.id, "deposit");
  ctx.reply("Enter deposit amount:");
});

// =========================
// WITHDRAW
// =========================
bot.hears("➖ Withdraw", (ctx) => {
  userStates.set(ctx.from.id, "withdraw");
  ctx.reply("Enter withdraw amount:");
});

// =========================
// HANDLE AMOUNT INPUT (FIXED)
// =========================
bot.on("text", (ctx) => {
  const action = userStates.get(ctx.from.id);
  if (!action) return;

  const amount = Number(ctx.message.text);
  if (!Number.isFinite(amount) || amount <= 0) {
    return ctx.reply("❌ Invalid amount");
  }

  const user = getUser(ctx.from.id);

  if (action === "withdraw" && user.balance < amount) {
    return ctx.reply("❌ Not enough balance");
  }

  const request = {
    id: Date.now(),
    userId: String(ctx.from.id),
    username: user.username,
    type: action,
    amount,
    status: "pending"
  };

  requests.push(request);
  saveRequests();

  ctx.reply(`✅ Request sent: ${action} ${amount}`);

  userStates.delete(ctx.from.id);
});

// =========================
// ADMIN APPROVE
// =========================
bot.action(/approve_(\d+)/, (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.answerCbQuery("Not allowed");
  }

  const id = Number(ctx.match[1]);
  const req = requests.find(r => r.id === id);

  if (!req) return ctx.answerCbQuery("Not found");
  if (req.status !== "pending") return ctx.answerCbQuery("Already processed");

  const user = getUser(req.userId);

  if (req.type === "deposit") {
    user.balance += req.amount;
  } else if (req.type === "withdraw") {
    user.balance -= req.amount;
  }

  req.status = "approved";

  saveUsers();
  saveRequests();

  ctx.editMessageText("✅ Approved");

  bot.telegram.sendMessage(
    req.userId,
    `✅ ${req.type} of ${req.amount} approved`
  );
});

// =========================
// ADMIN REJECT
// =========================
bot.action(/reject_(\d+)/, (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.answerCbQuery("Not allowed");
  }

  const id = Number(ctx.match[1]);
  const req = requests.find(r => r.id === id);

  if (!req) return ctx.answerCbQuery("Not found");

  req.status = "rejected";
  saveRequests();

  ctx.editMessageText("❌ Rejected");

  bot.telegram.sendMessage(
    req.userId,
    `❌ ${req.type} rejected`
  );
});

// =========================
// START BOT
// =========================
bot.launch();
console.log("🤖 Bot running...");