import * as fs from 'fs';
import { PhotoSize, Message, User } from 'telegraf/typings/telegram-types';
import * as Telegraf from 'telegraf';
import { Status } from './Status';
import { Conf } from './Conf';
import { ReplyInfo } from './ReplyInfo';
import { MessageTypes } from './MessageTypes';
import { UserStatus } from './UserStatus';

const version = '1.2.0';

let lastPic: { id: string, caption: string, user: number, messID: number, userName: string, chat: number };
const userStatusMap = new Map<number, UserStatus>();

const confPath = process.argv[2] || './conf';
// const Telegraf = require('telegraf');
const conf: Conf = JSON.parse(fs.readFileSync(confPath + '/conf.json', { encoding: 'UTF-8' }));
const db = require('sqlite3-wrapper').open(confPath + '/exchangeBotDB.db');
const bot = new Telegraf.default(conf.token);

bot.start(ctx => {
    ctx.reply('Hi! This bot can be used for exchanging pictures with random users!\nTo start just sent me a picture, caption can be provided')
});

bot.command('send', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        bot.telegram.sendMessage(args[1], 'Message from bot admin: ' + args.slice(2).join(' ') + '\nYou can answer to them using /admin your message').then(mess => {
            ctx.reply('Message sent proprerly');
        });
    }
});

bot.on('photo', (ctx) => {
    console.log('New photo! at ' + new Date().toString());
    if (!userStatusMap.has(ctx.from.id)) {
        checkPermissionsAndExecute(ctx, resendPic);
    } else {
        checkPermissionsAndExecute(ctx, processImageReply)
    }
});

bot.command('version', ctx => {
    ctx.reply(version);
});

bot.command('cancel', ctx => {
    userStatusMap.delete(ctx.from.id);
    ctx.reply('Operation cancelled')
});

bot.command('admin', ctx => {
    const text = ctx.message.text.split('admin').pop();
    if (!text || text.trim() === '') {
        ctx.reply('You must specify the message. For example: `/admin I love you`', { parse_mode: 'Markdown' })
    } else {
        bot.telegram.sendMessage(conf.adminChat, `User ${makeUserLink(ctx.from)} has sent you the following message:
${text.trim()}`, { parse_mode: "Markdown" });
        ctx.reply('Message to the admin has been sent');
    }
});

bot.command('warn', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        Promise.all([bot.telegram.sendMessage(args[1], 'You\'ve been warned: ' + args.slice(2).join(' ')), saveWarning(args[1])]).then(() => 
            bot.telegram.sendMessage(conf.adminChat, 'User warned correctly')
        );
    }
});

bot.command('ban', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        Promise.all([bot.telegram.sendMessage(args[1], 'You\'ve been banned: ' + args.slice(2).join(' ')), saveBan(args[1])]).then(() => 
            bot.telegram.sendMessage(conf.adminChat, 'User banned correctly')
        )
    }
});

bot.command('unban', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        bot.telegram.sendMessage(args[1], 'You\'ve been un-banned: ' + args.slice(2).join(' '));
        unban(args[1]);
    }
});

bot.on('text', ctx => {
    checkPermissionsAndExecute(ctx, processTextReply);
});

bot.use(ctx => {
    if (ctx.callbackQuery) {
        if (ctx.callbackQuery.data.startsWith('report:')) {
            checkPermissionsAndExecute(ctx, report);
        } else if (ctx.callbackQuery.data.startsWith('reply:')) {
            userStatusMap.set(ctx.from.id, {
                status: Status.REPLY,
                extraInfo: new ReplyInfo(bot.telegram, ctx.callbackQuery.data.substring(ctx.callbackQuery.data.indexOf(':') + 1)),
            });
            ctx.reply('Please send your reply. You can use text or an image. You can use /cancel to abort the text');
        }
    }
})

process.on('SIGINT', function () {
    saveState();
    process.exit(0);
});

function processTextReply(ctx: Telegraf.ContextMessageUpdate) {
    processReply(ctx, (ctx, userStatus) => {
        userStatus.extraInfo.Reply(ctx.message.text, MessageTypes.TEXT);
    });
}

function processImageReply(ctx: Telegraf.ContextMessageUpdate) {
    processReply(ctx, (ctx, userStatus) => {
        userStatus.extraInfo.Reply(ctx.message.caption, MessageTypes.IMAGE, getBestPhoto(ctx.message).file_id);
        if (conf.resendAll) {
            bot.telegram.sendPhoto(conf.adminChat, getBestPhoto(ctx.message).file_id,
            {caption: `User ${ctx.from.id} ${makeUserLink(ctx.from)}, original caption: ${ctx.message.caption || ''}`, parse_mode: 'Markdown'})
        }
    });
}

function processReply(ctx: Telegraf.ContextMessageUpdate, fn:(ctx: Telegraf.ContextMessageUpdate, userStatus: UserStatus) => void) {
    if (userStatusMap.has(ctx.from.id)) {
        const userStatus = userStatusMap.get(ctx.from.id);
        if (userStatus.status === Status.REPLY) {
            if (conf.extendedLog) {
                const additionalText = conf.resendAll && ctx.message.text ? ': '+ ctx.message.text : '';
                bot.telegram.sendMessage(conf.adminChat, `User ${makeUserLink(ctx.from)} has made a response to ${userStatus.extraInfo.getRecipentText()}: ${additionalText}`,
                {parse_mode: 'Markdown'})
            }
            fn(ctx, userStatus);
            ctx.reply('Answer sent');
            userStatusMap.delete(ctx.from.id);
        }
    }
}

async function report(ctx: Telegraf.ContextMessageUpdate) {
    const userID = ctx.callbackQuery.data.substring(7);
    const reportedName = await getUserByID(userID)
    bot.telegram.sendPhoto(conf.adminChat, getBestPhoto(ctx.callbackQuery.message).file_id,
        {
            caption: `User ${makeUserLink(ctx.from)} has reported [${reportedName}](tg://user?id=${userID}) \`${userID}\`. Original Caption: ${ctx.callbackQuery.message.caption || ''}`
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

    if (!lastPic) {
        lastPic = { id: bestPhoto.file_id, caption: ctx.message.caption, user: ctx.from.id, messID: ctx.message.message_id, userName: ctx.from.first_name, chat: ctx.chat.id };
        ctx.reply('Waiting for another user to upload their photo');
        if (conf.extendedLog) {
            bot.telegram.sendMessage(conf.adminChat, `User ${makeUserLink(ctx.from)} has sent a picture`,
                { parse_mode: 'Markdown' });
        }
    } else if (lastPic.chat === ctx.chat.id) {
        lastPic = { id: bestPhoto.file_id, caption: ctx.message.caption, user: ctx.from.id, messID: ctx.message.message_id, userName: ctx.from.first_name, chat: ctx.chat.id };
        ctx.reply('You already uploaded a photo before. I\'ll send this one instead of the previous');
        if (conf.extendedLog) {
            bot.telegram.sendMessage(conf.adminChat, `User ${makeUserLink(ctx.from)} has overwritten a sent picture`,
                { parse_mode: 'Markdown' });
        }
    } else {
        // Envíamos la foto B al usuario A
        // @ts-ignore
        bot.telegram.sendPhoto(lastPic.chat, bestPhoto.file_id, Telegraf.Extra.load({ caption: ctx.message.caption })
            .markup(makeKeyboard(ctx.from.id, { messID: ctx.message.message_id, chatID: ctx.chat.id })));
        // Envíamos la foto A al usuario B
        // @ts-ignore
        bot.telegram.sendPhoto(ctx.chat.id, lastPic.id, Telegraf.Extra.load({ caption: lastPic.caption })
            .markup(makeKeyboard(lastPic.user, { messID: lastPic.messID, chatID: lastPic.chat })));
        if (conf.extendedLog) {
            bot.telegram.sendMessage(conf.adminChat, `User ${makeUserLink(ctx.from)} has exchanged pictures with [${lastPic.userName}](tg://user?id=${lastPic.user}) \`${lastPic.user}\``,
                { parse_mode: 'Markdown' });
        }
        lastPic = null;
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
    return `[${usr.first_name}](tg://user?id=${usr.id}) \`${usr.id}\``
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

function makeKeyboard(userID: number, messInfo: { chatID: number, messID: number }) {
    const keyboard = Telegraf.Markup.inlineKeyboard([
        Telegraf.Markup.callbackButton("Report", "report:" + userID),
        Telegraf.Markup.callbackButton("Reply", "reply:" + messInfo.chatID + ':' + messInfo.messID)
    ]);
    return keyboard;
}

function saveWarning(id: string) {
    return new Promise((resolve, reject) => {
        db.select({ table: 'users', where: { id: id } }, (err, users) => {
            if (users && users.length > 0) {
                db.update('users', { id: +id }, { warnings: users[0].warnings + 1, lastWarningDate: new Date().toString() }, () => resolve());
            }
        });
    });
}

function saveBan(id: string) {
    return new Promise((resolve, reject) => {
        try {
            db.update('users', { id: +id }, { banned: 1, banDate: new Date().toString() }, () => resolve());
        } catch (e) {
            console.log(e);
            reject();
        }
    });
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

function getUserByID(id: string) {
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

function saveState() {
    const save = JSON.stringify(lastPic);
    fs.writeFileSync(confPath + '/lastPic.json', save, { encoding: 'UTF-8' });
}

function loadState() {
    try {
        const load = fs.readFileSync(confPath + '/lastPic.json', { encoding: 'UTF-8' });
        lastPic = JSON.parse(load)
    } catch (e) {
        lastPic = null;
    }
}

setInterval(saveState, conf.backupInterval * 1000);

loadState();
bot.launch();
