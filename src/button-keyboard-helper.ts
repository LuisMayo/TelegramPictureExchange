import * as Telegraf from 'telegraf';
import { CallbackButton, Button } from 'telegraf/typings/markup';

export class ButtonKeyBoardHelper {
    buttons: (CallbackButton | Button)[][] = [];
    lastArr = [];
    charactersInCurrentLine = 0;

    constructor() {
        this.buttons.push(this.lastArr);
    }
    addNewButton(text: string, data?: string | boolean) {
        const callback = !(data == null || typeof data === 'boolean');
        if (this.charactersInCurrentLine + text.length >= (callback ? 30 : 50)) {
            this.newLine();
        }
        this.lastArr.push(callback ? Telegraf.Markup.callbackButton(text, data as string) : Telegraf.Markup.button(text, data as boolean));
        this.charactersInCurrentLine+=text.length;
    }

    private newLine() {
        this.lastArr = [];
        this.buttons.push(this.lastArr);
        this.charactersInCurrentLine = 0;
    }
}