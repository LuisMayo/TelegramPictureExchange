import * as fs from 'fs';
import { Context } from 'telegraf';
import { BotUser } from './user';

export class PaymentDB {
    users: BotUser[];
    constructor(private confPath: string) {
        fs.readFile(confPath + '/payment.json', {encoding: 'utf-8'}, (err, data) => {
            if (err != null) {
                this.users = [];
            } else {
                this.users = JSON.parse(data);
            }
        });
    }

    checkUserAbilityToBuy(id: number) {
        return !this.getOrCreateUser(id).forbidden;
    }

    getSpyUsers() {
        return this.users.filter(user => user.spyPass > 0);
    }

    processPayment(ctx: Context) {
        if (ctx.update.message.successful_payment.invoice_payload === 'spy') {
            const spy = this.giveSpyMode(ctx.from.id);
            ctx.reply(`Recieved, now you will see the next ${spy} photos sent.`)
        }
    }

    spy(id: number) {
        const user = this.getOrCreateUser(id);
        user.spyPass--;
        this.saveData();
        return user.spyPass;
    }
    
    getOrCreateUser(id: number) {
        let user = this.users.find(user => user.id === id);
        if (user == null) {
            user = new BotUser(id);
            this.users.push(user);
        }
        return user;
    }

    private giveSpyMode(id: number) {
        const user = this.getOrCreateUser(id);
        user.spyPass += 20;
        this.saveData();
        return user.spyPass;
    }

    private saveData() {
        fs.writeFile(this.confPath + '/payment.json', JSON.stringify(this.users), () => {});
    }

    
}