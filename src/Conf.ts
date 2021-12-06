export type Conf = {
    token: string;
    paymentToken: string;
    allowSpy: boolean;
    adminChat: string;
    resendAll: boolean;
    extendedLog: boolean;
    backupInterval: number;
    modAnswers: string[];
    startMessage: string,
    automod: {
        enabled: boolean;
        maxPhotoBuffer: number;
    }
};
