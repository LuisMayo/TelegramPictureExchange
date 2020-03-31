import { Telegram } from "telegraf";
import { MessageTypes } from "./MessageTypes";

export class ReplyInfo {
    private chatID: number;
    private messID: number;
    constructor(private bot: Telegram, private infoString: string) {
        const arr = infoString.split(':');
        this.chatID = +arr[0];
        this.messID = +arr[1];
    }

    Reply(text: string, type: MessageTypes, imageID?: string) {
        switch (type) {
            case MessageTypes.IMAGE:
                const additionalText = text ? ': ' + text : '';
                this.bot.sendPhoto(this.chatID, imageID, { caption: 'User has made a reply' + additionalText, reply_to_message_id: this.messID });
                break;
            case MessageTypes.TEXT:
                this.bot.sendMessage(this.chatID, 'User has made a reply: ' + text, { reply_to_message_id: this.messID });
                break;
        }
    }

    public getRecipentText() {
        return `[Other user](tg://user?id=${this.chatID}) \`${this.chatID}\``
    }
}
