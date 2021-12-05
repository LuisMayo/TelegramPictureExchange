import { User } from "telegram-typings";

export class BotUser {
    spyPass = 0;
    forbidden = false;

    constructor(public id: number) {
    }

    makeUserLink() {
        return `[${this.id}](tg://user?id=${this.id}) \`${this.id}\``
    }
}