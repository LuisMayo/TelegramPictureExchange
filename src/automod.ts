import { DatabaseHelper } from "./db-helper";
import { Context } from "telegraf";
import { PhotoSize } from "telegraf/typings/telegram-types";
import { saveWarning } from "./warning-ban-manager";
import { conf } from "./index";
import * as fs from 'fs';

export class AutoMod {
    knownPhotos: string[] = [];

    static instance: AutoMod;
    static getInstance(db: DatabaseHelper) {
        if (!this.instance) {
            this.instance = new AutoMod(db);
        }
        return this.instance;
    }
    private constructor(private db: DatabaseHelper) {

    }

    async checkIfDuplicatedPhoto(photo: PhotoSize, ctx: Context): Promise<boolean> {
        if (conf.automod.enabled) {
            ///@ts-ignore
            const duplicated = this.knownPhotos.find(id => id === photo.file_unique_id);
            if (duplicated) {
                await saveWarning(ctx.from.id.toString(), this.db);
                ctx.reply('[AUTOMOD] You have been warned: Do not send the same picture twice');
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }

    loadFromDisk(confPath: string) {
        try {
            const load = fs.readFileSync(confPath + '/automod.json', { encoding: 'UTF-8' });
            const obj = JSON.parse(load) || {};
            this.knownPhotos = obj.knownPhotos || [];
        } catch (e) {
        }
    }

    registerPhoto(photo: PhotoSize) {
        ///@ts-ignore
        this.knownPhotos.push(photo.file_unique_id);
        if (this.knownPhotos.length > conf.automod.maxPhotoBuffer) {
            this.knownPhotos.splice(conf.automod.maxPhotoBuffer);
        }
    }

    saveToDisk(confPath: string) {
        const save = JSON.stringify({knownPhotos: this.knownPhotos});
        fs.writeFileSync(confPath + '/automod.json', save, { encoding: 'UTF-8' });
    }
}