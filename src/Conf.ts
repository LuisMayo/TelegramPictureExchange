export type Conf = {
    token: string;
    adminChat: string;
    resendAll: boolean;
    extendedLog: boolean;
    backupInterval: number;
    modAnswers: string[];
    automod: {
        enabled: boolean;
        maxPhotoBuffer: number;
    }
};
