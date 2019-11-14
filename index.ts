import * as fs from 'fs';
import { PhotoSize } from 'telegraf/typings/telegram-types';
import * as Telegraf from 'telegraf';

type Conf = {
    token: string;
}

let lastChat: number;
let lastPic: string;

// const Telegraf = require('telegraf');
const conf: Conf = JSON.parse(fs.readFileSync('./conf.json', {encoding: 'UTF-8'}));
const bot = new Telegraf.default(conf.token);

bot.start(ctx => {
    ctx.reply('Hi! This bot can be used for exchanging pictures with random users!\nTo start just sent me a picture, caption can be provided')
});
bot.on('photo', (ctx) => {
    let bestPhoto: PhotoSize;
    for (const photo of ctx.message.photo) {
        if(!bestPhoto || bestPhoto.file_size < photo.file_size) {
            bestPhoto = photo;
        }
    }

    if(!lastChat) {
        lastChat = ctx.chat.id;
        lastPic = bestPhoto.file_id;
        ctx.reply('Waiting for another user to upload their photo');
    } else if(lastChat === ctx.chat.id){
        lastPic = bestPhoto.file_id;
        ctx.reply('You already uploaded a photo before. I\'ll send this one instead of the previous');
    } else {
        bot.telegram.sendPhoto(lastChat, bestPhoto.file_id);
        bot.telegram.sendPhoto(ctx.chat.id, lastPic);
        lastChat = lastPic = null;
    }
});

bot.launch();