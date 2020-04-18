import { Utils } from "./utils";
import { User } from "telegraf/typings/telegram-types";
import Telegraf, { ContextMessageUpdate } from "telegraf";

export class ReportInfo {
    constructor(private caption: string, private fileId: string, private reporter: User, private reportedUserName: string, private reportedUserId: string, private bot: Telegraf<ContextMessageUpdate>, private adminChat: string) { }
    sendReport(reason: string) {
        return this.bot.telegram.sendPhoto(this.adminChat, this.fileId,
            {
                caption: `User ${Utils.makeUserLink(this.reporter)} has reported [${this.reportedUserName}](tg://user?id=${this.reportedUserId}) \`${this.reportedUserId}\` because ${reason}. Original Caption: ${this.caption || ''}`
                , parse_mode: "Markdown"
            });
    }
}
