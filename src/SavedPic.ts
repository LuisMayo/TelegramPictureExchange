import { PhotoSize } from 'telegraf/typings/telegram-types';

export interface SavedPic {
    id: string;
    caption: string;
    user: number;
    messID: number;
    userName: string;
    chat: number;
    originalPhoto: PhotoSize;
}
