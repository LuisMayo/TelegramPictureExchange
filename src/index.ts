import * as fs from 'fs';
import { PhotoSize, Message, User } from 'telegraf/typings/telegram-types';
import * as Telegraf from 'telegraf';
import { Status } from './Status';
import { Conf } from './Conf';
import { ReplyInfo } from './ReplyInfo';
import { MessageTypes } from './MessageTypes';
import { UserStatus } from './UserStatus';
import { ReportInfo } from './reportInfo';
import { Utils } from './utils';
import { DatabaseHelper } from './db-helper';

const version = '1.2.1';

let lastPic: { id: string, caption: string, user: number, messID: number, userName: string, chat: number };
const userStatusMap = new Map<number, UserStatus>();

const confPath = process.argv[2] || './conf';
const dbHelper = new DatabaseHelper(confPath);
const conf: Conf = JSON.parse(fs.readFileSync(confPath + '/conf.json', { encoding: 'UTF-8' }));
const bot = new Telegraf.default(conf.token);

bot.start(ctx => {
    ctx.reply('Hi! This bot can be used for exchanging pictures with random users!\nTo start just sent me a picture, caption can be provided')
});

// Bot commands
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

bot.command('ban', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        Promise.all([bot.telegram.sendMessage(args[1], 'You\'ve been banned: ' + args.slice(2).join(' ')), saveBan(args[1])]).then(() =>
            bot.telegram.sendMessage(conf.adminChat, 'User banned correctly')
        )
    }
});

bot.command('cancel', ctx => {
    if (userStatusMap.has(ctx.from.id)) {
        userStatusMap.delete(ctx.from.id);
        ctx.reply('Operation cancelled')
    } else {
        checkAndRemoveLastPic(ctx);
    }
});

bot.command(['remove', 'delete'], checkAndRemoveLastPic);

bot.command('send', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        bot.telegram.sendMessage(args[1], 'Message from bot admin: ' + args.slice(2).join(' ') + '\nYou can answer to them using /admin your message').then(mess => {
            ctx.reply('Message sent proprerly');
        });
    }
});

bot.command('unban', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        bot.telegram.sendMessage(args[1], 'You\'ve been un-banned: ' + args.slice(2).join(' '));
        unban(args[1]);
    }
});

bot.command('version', ctx => {
    ctx.reply(version);
});

bot.command('warn', (ctx) => {
    if (ctx.chat.id === +conf.adminChat) {
        let args = ctx.message.text.split(' ');
        Promise.all([bot.telegram.sendMessage(args[1], 'You\'ve been warned: ' + args.slice(2).join(' ')), saveWarning(args[1])]).then(() =>
            bot.telegram.sendMessage(conf.adminChat, 'User warned correctly')
        );
    }
});
// Bot commands end

// Bot handlers
bot.on('photo', (ctx) => {
    console.log('New photo! at ' + new Date().toString());
    if (!userStatusMap.has(ctx.from.id)) {
        checkPermissionsAndExecute(ctx, resendPic);
    } else if (userStatusMap.get(ctx.from.id).status === Status.REPLY) {
        checkPermissionsAndExecute(ctx, processImageReply)
    } else {
        ctx.reply('Finish or /cancel the current operation before sending a pic');
    }
});

bot.on('text', ctx => {
    if (userStatusMap.has(ctx.from.id)) {
        const status = userStatusMap.get(ctx.from.id);
        switch (status.status) {
            case Status.REPLY:
                checkPermissionsAndExecute(ctx, processTextReply);
                break;
            case Status.REPORT:
                checkPermissionsAndExecute(ctx, processReport);
                break;
        }
    }
});

bot.use(ctx => {
    if (ctx.callbackQuery) {
        if (ctx.callbackQuery.data.startsWith('report:')) {
            checkPermissionsAndExecute(ctx, saveReportState);
        } else if (ctx.callbackQuery.data.startsWith('reply:')) {
            userStatusMap.set(ctx.from.id, {
                status: Status.REPLY,
                extraInfo: new ReplyInfo(bot.telegram, ctx.callbackQuery.data.substring(ctx.callbackQuery.data.indexOf(':') + 1)),
            });
            ctx.reply('Please send your reply. You can use text or an image. You can use /cancel to abort the text');
        }
    }
})

// Bot handlers end

process.on('SIGINT', function () {
    saveState();
    process.exit(0);
});

/// Process Reply
function processImageReply(ctx: Telegraf.ContextMessageUpdate) {
    processReply(ctx, (ctx, userStatus) => {
        userStatus.extraInfo.Reply(ctx.message.caption, MessageTypes.IMAGE, getBestPhoto(ctx.message).file_id);
        if (conf.resendAll) {
            bot.telegram.sendPhoto(conf.adminChat, getBestPhoto(ctx.message).file_id,
                { caption: `User ${ctx.from.id} ${makeUserLink(ctx.from)}, original caption: ${ctx.message.caption || ''}`, parse_mode: 'Markdown' })
        }
    });
}

function processReply(ctx: Telegraf.ContextMessageUpdate, fn: (ctx: Telegraf.ContextMessageUpdate, userStatus: UserStatus) => void) {
    if (userStatusMap.has(ctx.from.id)) {
        const userStatus = userStatusMap.get(ctx.from.id);
        if (userStatus.status === Status.REPLY) {
            if (conf.extendedLog) {
                const additionalText = conf.resendAll && ctx.message.text ? ': ' + ctx.message.text : '';
                bot.telegram.sendMessage(conf.adminChat, `User ${makeUserLink(ctx.from)} has made a response to ${userStatus.extraInfo.getRecipentText()}: ${additionalText}`,
                    { parse_mode: 'Markdown' })
            }
            fn(ctx, userStatus);
            ctx.reply('Answer sent');
            userStatusMap.delete(ctx.from.id);
        }
    }
}

function processTextReply(ctx: Telegraf.ContextMessageUpdate) {
    processReply(ctx, (ctx, userStatus) => {
        userStatus.extraInfo.Reply(ctx.message.text, MessageTypes.TEXT);
    });
}
// Process Reply end
async function saveReportState(ctx: Telegraf.ContextMessageUpdate) {
    const userID = ctx.callbackQuery.data.substring(7);
    const reportedName = await getUserByID(userID);
    const reportInfo = new ReportInfo(ctx.callbackQuery.message.caption, getBestPhoto(ctx.callbackQuery.message).file_id, ctx.from, <string | null>reportedName, userID, bot, conf.adminChat);
    ctx.reply('Please specify the report reason. You can use /cancel to abort the operation');
    ctx.answerCbQuery();
    userStatusMap.set(ctx.from.id, { status: Status.REPORT, extraReportInfo: reportInfo });
}

function processReport(ctx: Telegraf.ContextMessageUpdate) {
    const status = userStatusMap.get(ctx.from.id);
    status.extraReportInfo.sendReport(ctx.message.text).then(value => ctx.reply('Report sent'), error => ctx.reply('Report couldn\'t ve sent'));
    userStatusMap.delete(ctx.from.id);
}
// Process report


// Warning and ban zone
function saveWarning(id: string) {
    return dbHelper.saveWarning(id);
}

function saveBan(id: string) {
    return dbHelper.saveWarning(id);
}

function unban(id: string) {
    return dbHelper.saveBan(id);
}
// End

// State zone
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
// End

function checkAndRemoveLastPic(ctx: Telegraf.ContextMessageUpdate) {
    if (lastPic && lastPic.chat === ctx.chat.id) {
        lastPic = null;
        ctx.reply('Image removed properly');
        if (conf.extendedLog) {
            bot.telegram.sendMessage(conf.adminChat, `User ${makeUserLink(ctx.from)} has deleted the picture`,
                { parse_mode: 'Markdown' });
        }
    }
}

function checkPermissionsAndExecute(ctx: Telegraf.ContextMessageUpdate, fn: ((ctx: Telegraf.ContextMessageUpdate) => any)) {
    dbHelper.checkPermissionsAndExecute(ctx, fn);
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

function getUserByID(id: string) {
    return dbHelper.getUserByID(id);
}

function makeKeyboard(userID: number, messInfo: { chatID: number, messID: number }) {
    const keyboard = Telegraf.Markup.inlineKeyboard([
        Telegraf.Markup.callbackButton("Report", "report:" + userID),
        Telegraf.Markup.callbackButton("Reply", "reply:" + messInfo.chatID + ':' + messInfo.messID)
    ]);
    return keyboard;
}

function makeUserLink(usr: User) {
    return Utils.makeUserLink(usr);
}

function resendPic(ctx: Telegraf.ContextMessageUpdate) {
    let bestPhoto: PhotoSize;
    dbHelper.insertUserIntoDB(ctx.from);
    bestPhoto = getBestPhoto(ctx.message);

    if (!lastPic) {
        lastPic = { id: bestPhoto.file_id, caption: ctx.message.caption, user: ctx.from.id, messID: ctx.message.message_id, userName: ctx.from.first_name, chat: ctx.chat.id };
        ctx.reply('Waiting for another user to upload their photo. Having second thoughts? Use /cancel to delete the image');
        if (conf.extendedLog) {
            bot.telegram.sendMessage(conf.adminChat, `User ${makeUserLink(ctx.from)} has sent a picture`,
                { parse_mode: 'Markdown' });
        }
    } else if (lastPic.chat === ctx.chat.id) {
        lastPic = { id: bestPhoto.file_id, caption: ctx.message.caption, user: ctx.from.id, messID: ctx.message.message_id, userName: ctx.from.first_name, chat: ctx.chat.id };
        ctx.reply('You already uploaded a photo before. I\'ll send this one instead of the previous. Having second thoughts? Use /cancel to delete the image');
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
                caption: `User ${makeUserLink(ctx.from)}. Original Caption: ${ctx.message.caption || ''}`,
                parse_mode: "Markdown"
            });
    }
}

setInterval(saveState, conf.backupInterval * 1000);
loadState();
bot.launch();
