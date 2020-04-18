import { Status } from './Status';
import { ReplyInfo } from './ReplyInfo';
import { ReportInfo } from './reportInfo';
export type UserStatus = {
    status: Status;
    extraInfo?: ReplyInfo;
    extraReportInfo?: ReportInfo;
};
