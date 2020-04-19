import { Utils } from "./utils";
import { User } from "telegraf/typings/telegram-types";
import Telegraf, { ContextMessageUpdate } from "telegraf";
import { DatabaseHelper } from "./db-helper";

export class ReportInfo {
    constructor(private caption: string, private fileId: string, private reporter: User, private reportedUserName: string, private reportedUserId: string, private bot: Telegraf<ContextMessageUpdate>, private adminChat: string, private dbHelper: DatabaseHelper) { }
    sendReport(reason: string) {
        return new Promise((resolve, reject) => {
            this.dbHelper.getWarningsNumber(this.reportedUserId).then((warning) => {
                this.sendFinalReport(reason, warning, resolve);
            },
            (onfail) =>  this.sendFinalReport(reason, null, resolve));
        })
    }

    private sendFinalReport(reason: string, warning: number,resolve: (value?: unknown) => void) {
        this.bot.telegram.sendPhoto(this.adminChat, this.fileId, {
            caption: `User ${Utils.makeUserLink(this.reporter)} has reported [${this.reportedUserName}](tg://user?id=${this.reportedUserId}) \`${this.reportedUserId}\` because ${reason}. This user has been warned ${warning} time(s). Original Caption: ${this.caption || ''}`,
            parse_mode: "Markdown"
        }).then(data => resolve(data), error => resolve(error));
    }
}
