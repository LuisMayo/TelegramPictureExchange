import * as fs from 'fs';
import { PhotoSize, Message } from 'telegraf/typings/telegram-types';
import * as Telegraf from 'telegraf';

type Conf = {
    token: string;
    adminChat: string;
}

let lastChat: number;
let lastPic: { id: string, caption: string, user: number };

const confPath = process.argv[2] || './conf';
// const Telegraf = require('telegraf');
const conf: Conf = JSON.parse(fs.readFileSync(confPath + '/conf.json', { encoding: 'UTF-8' }));
const db = require('sqlite3-wrapper').open(confPath + './exchangeBotDB.db');
const bot = new Telegraf.default(conf.token);

bot.start(ctx => {
    ctx.reply('Hi! This bot can be used for exchanging pictures with random users!\nTo start just sent me a picture, caption can be provided')
});
bot.on('photo', (ctx) => {
    console.log('New photo! at ' + new Date().toString());
    checkPermissionsAndExecute(ctx, resendPic);
});

bot.command('warn', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        bot.telegram.sendMessage(args[1], 'You\'ve been warned: '+ args.slice(2).join(' '));
        saveWarning(args[1]);
    }
});

bot.command('ban', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        bot.telegram.sendMessage(args[1], 'You\'ve been banned: '+ args.slice(2).join(' '));
        saveBan(args[1]);
    }
});

bot.command('unban', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        bot.telegram.sendMessage(args[1], 'You\'ve been un-banned: '+ args.slice(2).join(' '));
        unban(args[1]);
    }
});

bot.use(ctx => {
    if(ctx.callbackQuery && ctx.callbackQuery.data.startsWith('report:')) {
        checkPermissionsAndExecute(ctx, report);
    }
})

function report(ctx: Telegraf.ContextMessageUpdate) {
    bot.telegram.sendPhoto(conf.adminChat, getBestPhoto(ctx.callbackQuery.message).file_id, { caption: `User ${ctx.callbackQuery.data.substring(7)} has been reported. Original Caption: ${ctx.callbackQuery.message.caption || ''}` });
    ctx.answerCbQuery('User has been reported');
}

function resendPic(ctx: Telegraf.ContextMessageUpdate) {
    let bestPhoto: PhotoSize;
    db.select({ table: 'users', where: { id: ctx.from.id } }, (err, users) => {
        if (!users || users.length <= 0) {
            db.insert('users', { id: ctx.from.id, username: ctx.from.username });
        }
    });
    bestPhoto = getBestPhoto(ctx.message);

    if (!lastChat) {
        lastChat = ctx.chat.id;
        lastPic = { id: bestPhoto.file_id, caption: ctx.message.caption, user: ctx.from.id };
        ctx.reply('Waiting for another user to upload their photo');
    } else if (lastChat === ctx.chat.id) {
        lastPic = { id: bestPhoto.file_id, caption: ctx.message.caption, user: ctx.from.id };
        ctx.reply('You already uploaded a photo before. I\'ll send this one instead of the previous');
    } else {
        // Envíamos la foto B al usuario A
        // @ts-ignore
        bot.telegram.sendPhoto(lastChat, bestPhoto.file_id, Telegraf.Extra.load({ caption: ctx.message.caption}).markup(makeKeyboard(ctx.from.id)));
        // Envíamos la foto A al usuario B
        // @ts-ignore
        bot.telegram.sendPhoto(ctx.chat.id, lastPic.id, Telegraf.Extra.load({ caption: lastPic.caption}).markup(makeKeyboard(lastPic.user)));
        lastChat = lastPic = null;
    }
}

function getBestPhoto(ctx: Message) {
    let bestPhoto: PhotoSize;
    for (const photo of ctx.photo) {
        if (!bestPhoto || bestPhoto.file_size < photo.file_size) {
            bestPhoto = photo;
        }
    }
    return bestPhoto;
}

function makeKeyboard(id: Telegraf.ContextMessageUpdate) {
    const keyboard = Telegraf.Markup.inlineKeyboard([
        Telegraf.Markup.callbackButton("Report", "report:" + id)
    ]);
    return keyboard
}

function saveWarning(id: string) {
    db.select({ table: 'users', where: { id: id } }, (err, users) => {
    if (users && users.length > 0) {
            db.update('users', {id: +id}, { warnings: users[0].warnings + 1, lastWarningDate: new Date().toString() });
        }
    });
}

function saveBan(id: string) {
    try {
        db.update('users', {id: +id}, { banned: 1, banDate: new Date().toString() });
    } catch (e) {
        console.log(e);
    }
}

function unban(id: string) {
    try {
    db.update('users', {id: +id}, { banned: 0 });
    } catch (e) {
        console.log(e);
    }
}


function checkPermissionsAndExecute(ctx: Telegraf.ContextMessageUpdate, fn: ((ctx: Telegraf.ContextMessageUpdate) => any)) {
    db.select({ table: 'users', where: { id: ctx.from.id } }, (err, users) => {
        if (!users || users.length <= 0) {
            db.insert('users', { id: ctx.from.id, username: ctx.from.username });
            fn(ctx);
        } else {
            if (users[0].banned === 1) {
                ctx.reply('You have banned from further use of this bot');
            } else {
                fn(ctx);
            }
        }
    });
}



bot.launch();