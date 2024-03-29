import { User } from "telegram-typings";

export class BotUser {
    id: number;
    fastPass = 0;
    forbidden = false;
    spyModeExpiration = new Date();

    constructor(tgUser: User) {
        this.id = tgUser.id;
    }
}