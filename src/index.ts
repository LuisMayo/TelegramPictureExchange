import * as fs from 'fs';
import { PhotoSize, Message, User } from 'telegraf/typings/telegram-types';
import * as Telegraf from 'telegraf';

type Conf = {
    token: string;
    adminChat: string;
    resendAll: boolean;
    extendedLog: boolean;
}

let lastChat: number;
let lastPic: { id: string, caption: string, user: number, messID: number, userName: string };

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
        bot.telegram.sendMessage(args[1], 'You\'ve been warned: ' + args.slice(2).join(' '));
        saveWarning(args[1]);
    }
});

bot.command('ban', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        bot.telegram.sendMessage(args[1], 'You\'ve been banned: ' + args.slice(2).join(' '));
        saveBan(args[1]);
    }
});

bot.command('unban', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        bot.telegram.sendMessage(args[1], 'You\'ve been un-banned: ' + args.slice(2).join(' '));
        unban(args[1]);
    }
});

bot.use(ctx => {
    if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('report:')) {
        checkPermissionsAndExecute(ctx, report);
    }
})

async function report(ctx: Telegraf.ContextMessageUpdate) {
    const userID = ctx.callbackQuery.data.substring(7);
    const reportedName = await getUserByIDAndExecute(userID)
    bot.telegram.sendPhoto(conf.adminChat, getBestPhoto(ctx.callbackQuery.message).file_id,
        {
            caption: `User [${makeUserLink(ctx.from)} has reported [${reportedName}](tg://user?id=${userID}). Original Caption: ${ctx.callbackQuery.message.caption || ''}`
            , parse_mode: "Markdown"
        });
    ctx.answerCbQuery('User has been reported');
}

function resendPic(ctx: Telegraf.ContextMessageUpdate) {
    let bestPhoto: PhotoSize;
    db.select({ table: 'users', where: { id: ctx.from.id } }, (err, users) => {
        if (!users || users.length <= 0) {
            db.insert('users', { id: ctx.from.id, username: ctx.from.first_name });
        }
    });
    bestPhoto = getBestPhoto(ctx.message);

    if (!lastChat) {
        lastChat = ctx.chat.id;
        lastPic = { id: bestPhoto.file_id, caption: ctx.message.caption, user: ctx.from.id, messID: ctx.message.message_id, userName: ctx.from.first_name };
        ctx.reply('Waiting for another user to upload their photo');
        if (conf.extendedLog) {
            bot.telegram.sendMessage(conf.adminChat, `User ${makeUserLink(ctx.from)} has sent a picture`,
                { parse_mode: 'Markdown' });
        }
    } else if (lastChat === ctx.chat.id) {
        lastPic = { id: bestPhoto.file_id, caption: ctx.message.caption, user: ctx.from.id, messID: ctx.message.message_id, userName: ctx.from.first_name };
        ctx.reply('You already uploaded a photo before. I\'ll send this one instead of the previous');
        if (conf.extendedLog) {
            bot.telegram.sendMessage(conf.adminChat, `User ${makeUserLink(ctx.from)} has overwritten a sent picture`,
                { parse_mode: 'Markdown' });
        }
    } else {
        // Envíamos la foto B al usuario A
        // @ts-ignore
        bot.telegram.sendPhoto(lastChat, bestPhoto.file_id, Telegraf.Extra.load({ caption: ctx.message.caption }).markup(makeKeyboard(ctx.from.id)));
        // Envíamos la foto A al usuario B
        // @ts-ignore
        bot.telegram.sendPhoto(ctx.chat.id, lastPic.id, Telegraf.Extra.load({ caption: lastPic.caption }).markup(makeKeyboard(lastPic.user)));
        if (conf.extendedLog) {
            bot.telegram.sendMessage(conf.adminChat, `User ${makeUserLink(ctx.from)} has exchanged pictures with [${lastPic.userName}](tg://user?id=${lastPic.user})`,
                { parse_mode: 'Markdown' });
        }
        lastChat = lastPic = null;
    }
    if (conf.resendAll) {
        bot.telegram.sendPhoto(conf.adminChat, bestPhoto.file_id,
            {
                caption: `User ${ctx.from.id} ${makeUserLink(ctx.from)}. Original Caption: ${ctx.message.caption || ''}`,
                parse_mode: "Markdown"
            });
    }
}

function makeUserLink(usr: User) {
    return `[${usr.first_name}](tg://user?id=${usr.id})`
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
            db.update('users', { id: +id }, { warnings: users[0].warnings + 1, lastWarningDate: new Date().toString() });
            bot.telegram.sendMessage(conf.adminChat, 'User warned correctly');
        }
    });
}

function saveBan(id: string) {
    try {
        db.update('users', { id: +id }, { banned: 1, banDate: new Date().toString() });
        bot.telegram.sendMessage(conf.adminChat, 'User banned correctly');
    } catch (e) {
        console.log(e);
    }
}

function unban(id: string) {
    try {
        db.update('users', { id: +id }, { banned: 0 });
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

function getUserByIDAndExecute(id: string) {
    return new Promise(resolve => {
        db.select({ table: 'users', where: { id: id } }, (err, users) => {
            if (!users || users.length <= 0) {
                resolve(null);
            } else {
                resolve(users[0].username);
            }
        });
    });
}



bot.launch();