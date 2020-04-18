import { User } from "telegraf/typings/telegram-types";

export class Utils {
    static makeUserLink(usr: User) {
        return `[${usr.first_name}](tg://user?id=${usr.id}) \`${usr.id}\``
    }
}