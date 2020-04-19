import { User } from "telegraf/typings/telegram-types";
import { ContextMessageUpdate } from "telegraf";

export class DatabaseHelper {
    private db: any;
    constructor(confPath: string) {
        this.db = require('sqlite3-wrapper').open(confPath + '/exchangeBotDB.db');
    }

    checkPermissionsAndExecute(ctx: ContextMessageUpdate, fn: ((ctx: ContextMessageUpdate) => any)) {
        this.db.select({ table: 'users', where: { id: ctx.from.id } }, (err, users) => {
            if (!users || users.length <= 0) {
                this.db.insert('users', { id: ctx.from.id, username: ctx.from.first_name });
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

    getUserByID(id: string) {
        return new Promise(resolve => {
            this.db.select({ table: 'users', where: { id: id } }, (err, users) => {
                if (!users || users.length <= 0) {
                    resolve(null);
                } else {
                    resolve(users[0]);
                }
            });
        });
    }

    async getUserNameByID(id: string) {
        return (await this.getUserByID(id) as any).username;
    }

    async getWarningsNumber(id: string) {
        const user: any = await this.getUserByID(id);
        return user? user.warnings : null;
    }

    insertUserIntoDB(user: User) {
        this.db.select({ table: 'users', where: { id: user.id } }, (err, users) => {
            if (!users || users.length <= 0) {
                this.db.insert('users', { id: user.id, username: user.first_name });
            }
        });
    }

    saveBan(id: string) {
        return new Promise((resolve, reject) => {
            try {
                this.db.update('users', { id: +id }, { banned: 1, banDate: new Date().toString() }, () => resolve());
            } catch (e) {
                console.log(e);
                reject();
            }
        });
    }

    saveWarning(id: string) {
        return new Promise((resolve, reject) => {
            this.db.select({ table: 'users', where: { id: id } }, (err, users) => {
                if (users && users.length > 0) {
                    this.db.update('users', { id: +id }, { warnings: users[0].warnings + 1, lastWarningDate: new Date().toString() }, () => resolve());
                }
            });
        });
    }

    unban(id: string) {
        try {
            this.db.update('users', { id: +id }, { banned: 0 });
        } catch (e) {
            console.log(e);
        }
    }
}