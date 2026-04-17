const { Telegraf } = require('telegraf');
const BOT_TOKEN = '8650975160:AAHcBuG5UqhYpv7Iat1SufhERrBayussbZk'; // Your token
const APP_URL = 'https://mini-app-bingo.onrender.com';
const FRONTEND_URL = `${APP_URL}/frontend`; // URL of your frontend app
const bot = new Telegraf(BOT_TOKEN);

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
console.log('Bot is running...');