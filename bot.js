const { Telegraf, Markup } = require('telegraf');
const fs = require('fs-extra');

const BOT_TOKEN = "8761020127:AAERE7_Od3JRMba00m0ER22rCE4Vz00clCg";
const ADMIN_ID = 5423314276;
const FRONTEND_URL = "https://mini-app-bingo.onrender.com";

const bot = new Telegraf(BOT_TOKEN);

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

/* =========================
   TELEGRAM AUTO LOGIN USER
========================= */
bot.start((ctx) => {

  const tgId = ctx.from.id;
  const username = ctx.from.username || "player";

  if (!users[tgId]) {
    users[tgId] = {
      telegramId: tgId,
      username,
      balance: 0
    };
    saveUsers();
  }

  ctx.reply(`Welcome ${username}\nBalance: ${users[tgId].balance}`, {
    reply_markup: {
      keyboard: [
        ["🎮 Play"],
        ["💰 Balance"],
        ["➕ Deposit", "➖ Withdraw"]
      ],
      resize_keyboard: true
    }
  });
});

/* =========================
   PLAY BUTTON (SECURE LOGIN)
========================= */
bot.hears("🎮 Play", (ctx) => {

  // IMPORTANT: use Telegram WebApp login (NO manual params)
  ctx.reply("🚀 Open Bingo Game:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "▶️ Play Now",
            web_app: { url: FRONTEND_URL }
          }
        ]
      ]
    }
  });
});

/* =========================
   BALANCE
========================= */
bot.hears("💰 Balance", (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return ctx.reply("User not found");

  ctx.reply(`💰 Balance: ${user.balance}`);
});

/* =========================
   DEPOSIT / WITHDRAW
========================= */
const userStates = new Map();

bot.hears("➕ Deposit", (ctx) => {
  userStates.set(ctx.from.id, "deposit");
  ctx.reply("Enter deposit amount:");
});

bot.hears("➖ Withdraw", (ctx) => {
  userStates.set(ctx.from.id, "withdraw");
  ctx.reply("Enter withdraw amount:");
});

/* =========================
   HANDLE AMOUNT INPUT
========================= */
bot.on("text", (ctx) => {

  const action = userStates.get(ctx.from.id);
  if (!action) return;

  const amount = parseFloat(ctx.message.text);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("❌ Invalid amount");
  }

  const user = users[ctx.from.id];
  if (!user) return;

  if (action === "withdraw" && user.balance < amount) {
    return ctx.reply("❌ Not enough balance");
  }

  const request = {
    id: Date.now(),
    userId: ctx.from.id,
    username: user.username,
    type: action,
    amount,
    status: "pending"
  };

  requests.push(request);
  saveRequests();

  ctx.reply(`✅ Request sent for ${action}: ${amount}`);

  bot.telegram.sendMessage(
    ADMIN_ID,
    `📥 New Request
User: ${user.username}
Type: ${action}
Amount: ${amount}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Approve", `approve_${request.id}`),
        Markup.button.callback("❌ Reject", `reject_${request.id}`)
      ]
    ])
  );

  userStates.delete(ctx.from.id);
});

/* =========================
   ADMIN APPROVE
========================= */
bot.action(/approve_(\d+)/, (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery("Not allowed");

  const id = Number(ctx.match[1]);
  const req = requests.find(r => r.id === id);

  if (!req) return ctx.answerCbQuery("Not found");
  if (req.status !== "pending") return ctx.answerCbQuery("Already processed");

  const user = users[req.userId];
  if (!user) return ctx.answerCbQuery("User missing");

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

/* =========================
   ADMIN REJECT
========================= */
bot.action(/reject_(\d+)/, (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery("Not allowed");

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

/* =========================
   START BOT
========================= */
bot.launch();
console.log("🤖 Bot running...");