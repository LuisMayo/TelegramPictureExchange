import * as Telegraf from 'telegraf';

export class ButtonKeyBoardHelper {
    buttons: Telegraf.CallbackButton[][] = [];
    lastArr = [];
    charactersInCurrentLine = 0;

    constructor() {
        this.buttons.push(this.lastArr);
    }
    addNewButton(text: string) {
        if (this.charactersInCurrentLine + text.length >= 40) {
            this.newLine();
        }
        this.lastArr.push(Telegraf.Markup.button(text));
        this.charactersInCurrentLine+=text.length;
    }

    private newLine() {
        this.lastArr = [];
        this.buttons.push(this.lastArr);
        this.charactersInCurrentLine = 0;
    }
}
