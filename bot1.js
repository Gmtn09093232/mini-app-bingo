const { Telegraf } = require('telegraf');
const { Pool } = require('pg');

/* =======================
   CONFIG (REPLACE THESE)
======================= */
const BOT_TOKEN = "8728360769:AAHhvEWPqQ39d88v3rSa7dYWYrL5bqFKZrw";
const FRONTEND_URL = "https://mini-app-bingo.onrender.com";

/* =======================
   SUPABASE DB (PostgreSQL)
======================= */
const pool = new Pool({
    connectionString: "postgresql://postgres:yA6Hy3ZiRHbIMhoh@db.rmzourfcjodclcowbuhs.supabase.co:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

/* =======================
   BOT INIT
======================= */
const bot = new Telegraf(BOT_TOKEN);
const userStates = new Map();

/* =======================
   START
======================= */
bot.start(async (ctx) => {
    const tgId = ctx.from.id;
    const username = ctx.from.username || "player";

    try {
        await pool.query(
            `INSERT INTO users (telegram_id, username)
             VALUES ($1, $2)
             ON CONFLICT (telegram_id) DO NOTHING`,
            [tgId, username]
        );

        ctx.reply("🎮 Welcome to Bingo!", {
            reply_markup: {
                keyboard: [
                    ["🎮 Play"],
                    ["💰 Balance"],
                    ["➕ Deposit", "➖ Withdraw"]
                ],
                resize_keyboard: true
            }
        });

    } catch (err) {
        console.error("DB ERROR:", err.message);
        ctx.reply("❌ Database error");
    }
});

/* =======================
   PLAY BUTTON
======================= */
bot.hears("🎮 Play", (ctx) => {
    const url = `${FRONTEND_URL}?tgId=${ctx.from.id}&username=${ctx.from.username}`;

    ctx.reply("🚀 Open game:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "▶️ Play Now", web_app: { url } }]
            ]
        }
    });
});

/* =======================
   BALANCE
======================= */
bot.hears("💰 Balance", async (ctx) => {
    try {
        const result = await pool.query(
            "SELECT balance FROM users WHERE telegram_id=$1",
            [ctx.from.id]
        );

        if (!result.rows.length)
            return ctx.reply("❌ User not found");

        ctx.reply(`💰 Balance: ${result.rows[0].balance}`);

    } catch (err) {
        console.error(err.message);
        ctx.reply("❌ Error getting balance");
    }
});

/* =======================
   DEPOSIT
======================= */
bot.hears("➕ Deposit", (ctx) => {
    userStates.set(ctx.from.id, { action: "deposit" });
    ctx.reply("Enter deposit amount:");
});

/* =======================
   WITHDRAW
======================= */
bot.hears("➖ Withdraw", (ctx) => {
    userStates.set(ctx.from.id, { action: "withdraw" });
    ctx.reply("Enter withdraw amount:");
});

/* =======================
   INPUT HANDLER
======================= */
bot.on("text", async (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;

    const amount = parseFloat(ctx.message.text);
    if (isNaN(amount) || amount <= 0)
        return ctx.reply("❌ Invalid amount");

    try {
        const result = await pool.query(
            "SELECT id, balance FROM users WHERE telegram_id=$1",
            [ctx.from.id]
        );

        if (!result.rows.length)
            return ctx.reply("❌ User not found");

        const user = result.rows[0];

        /* =======================
           DEPOSIT
        ======================= */
        if (state.action === "deposit") {
            await pool.query(
                "UPDATE users SET balance = balance + $1 WHERE id=$2",
                [amount, user.id]
            );

            ctx.reply(`✅ Deposited ${amount}`);
        }

        /* =======================
           WITHDRAW
        ======================= */
        if (state.action === "withdraw") {

            if (user.balance < amount)
                return ctx.reply("❌ Not enough balance");

            await pool.query(
                "UPDATE users SET balance = balance - $1 WHERE id=$2",
                [amount, user.id]
            );

            ctx.reply(`✅ Withdrawn ${amount}`);
        }

    } catch (err) {
        console.error(err.message);
        ctx.reply("❌ Transaction error");
    }

    userStates.delete(ctx.from.id);
});

/* =======================
   ERROR HANDLER
======================= */
bot.catch((err) => {
    console.error("BOT ERROR:", err);
});

/* =======================
   START BOT
======================= */
bot.launch();
console.log("🤖 Bot running...");