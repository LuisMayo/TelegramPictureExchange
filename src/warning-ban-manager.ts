import { DatabaseHelper } from './db-helper';
// Process report
// Warning and ban zone
export function saveWarning(id: string, dbHelper: DatabaseHelper) {
    return dbHelper.saveWarning(id);
}
export function saveBan(id: string, dbHelper: DatabaseHelper) {
    return dbHelper.saveWarning(id);
}
export function unban(id: string, dbHelper: DatabaseHelper) {
    return dbHelper.saveBan(id);
}
