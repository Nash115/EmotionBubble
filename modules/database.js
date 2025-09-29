import sqlite3 from 'sqlite3';
import { log, logError } from './tools.js';
import fs from 'fs';

if (!fs.existsSync('./db')) {
    fs.mkdirSync('./db');
}
if (!fs.existsSync('./db/database.db')) {
    fs.writeFileSync('./db/database.db', '');
}

const db = new sqlite3.Database('./db/database.db', (err) => {
    if (err) {
        logError('Database opening error: ' + err);
    } else {
        log('Database opened');
        db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, name TEXT, password TEXT, admin INTEGER, friends TEXT)');
        db.run('CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY, userid INTEGER, date TEXT, visibility INTEGER, title TEXT, content TEXT, mood INTEGER, weather INTEGER, FOREIGN KEY(userid) REFERENCES users(id))');
    }
});

// Table users

export function getUsers() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM users', (err, rows) => {
            if (err) {
                logError('Get users error: ' + err);
                reject(err);
            } else {
                rows.forEach(element => {
                    element.friends = JSON.parse(element.friends);
                });
                resolve(rows);
            }
        });
    })
}

export function insertUser(user) {
    const query = `
        INSERT INTO users (username, name, password, admin, friends)
        VALUES (?, ?, ?, ?, ?)
    `;
    const params = [
        user.username,
        user.name,
        user.password,
        user.admin,
        JSON.stringify(user.friends)
    ];
    db.run(query, params, (err) => {
        if (err) {
            logError('Insert user error: ' + err);
            return false;
        } else {
            return true;
        }
    });
}

export function getUser(username) {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM users WHERE username = ?`;
        db.get(query, [username], (err, row) => {
            if (err) {
                logError('Get user error: ' + err);
                reject(err);
            } else {
                if (row) {
                    row.friends = JSON.parse(row.friends);
                }
                resolve(row);
            }
        });
    });
}

export function getUserById(uid) {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM users WHERE id = ?`;
        db.get(query, [uid], (err, row) => {
            if (err) {
                logError('Get user by id error: ' + err);
                reject(err);
            } else {
                if (row) {
                    row.friends = JSON.parse(row.friends);
                }
                resolve(row);
            }
        });
    });
}

export function chechAuth(username, password) {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM users WHERE username = ? AND password = ?`;
        db.get(query, [username, password], (err, row) => {
            if (err) {
                logError('Check auth error: ' + err);
                reject(err);
            } else {
                if (row) {
                    row.friends = JSON.parse(row.friends);
                }
                resolve(row);
            }
        });
    });
}

export function deleteUser(userId) {
    return new Promise((resolve, reject) => {
        const query = `DELETE FROM users WHERE id = ?`;
        db.run(query, [userId], (err) => {
            if (err) {
                logError('Delete user error: ' + err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export function updateUser(uid, new_username, new_name) {
    return new Promise((resolve, reject) => {
        const query = `UPDATE users SET username = ?, name = ? WHERE id = ?`;
        db.run(query, [new_username, new_name, uid], (err) => {
            if (err) {
                logError('Update user error: ' + err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export function updateUserPwd(uid, new_pwd) {
    return new Promise((resolve, reject) => {
        const query = `UPDATE users SET password = ? WHERE id = ?`;
        db.run(query, [new_pwd, uid], (err) => {
            if (err) {
                logError('Update user password error: ' + err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export async function addFriend(uid, friendId) {
    const user = await getUserById(uid);
    const userFriends = user.friends;

    if (userFriends.includes(friendId)) {
        logError('Add friend error: friend already in list');
        return false;
    } else {
        userFriends.push(friendId);
        const query = `UPDATE users SET friends = ? WHERE id = ?`;
        db.run(query, [JSON.stringify(userFriends), uid], (err) => {
            if (err) {
                logError('Add friend error: ' + err);
                return false;
            } else {
                return true;
            }
        });
    }
}

export async function deleteFriend(uid, friendId) {
    const user = await getUserById(uid);
    const userFriends = user.friends;

    if (userFriends.includes(friendId)) {
        userFriends.splice(userFriends.indexOf(friendId), 1);
        const query = `UPDATE users SET friends = ? WHERE id = ?`;
        db.run(query, [JSON.stringify(userFriends), uid], (err) => {
            if (err) {
                logError('Delete friend error:' + err);
                return false;
            } else {
                return true;
            }
        });
    } else {
        logError('Delete friend error: friend not found');
        return false;
    }
}

// Table records

export function insertRecord(record) {
    const query = `
        INSERT INTO records (userid, date, visibility, title, content, mood, weather)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
        record.userid,
        record.date,
        record.visibility,
        record.title,
        record.content,
        record.mood,
        record.weather
    ];
    db.run(query, params, function(err) {
        if (err) {
            logError('Insert record error:' + err);
            return false;
        } else {
            return true;
        }
    });
}

export function updateRecord(record) {
    const query = `
        UPDATE records
        SET visibility = ?, title = ?, content = ?, mood = ?, weather = ?
        WHERE userid = ? AND date = ?
    `;
    const params = [
        record.visibility,
        record.title,
        record.content,
        record.mood,
        record.weather,
        record.userid,
        record.date
    ];
    db.run(query, params, function(err) {
        if (err) {
            logError('Update record error:' + err);
            return false;
        } else {
            return true;
        }
    });
}

export function getRecords(username, limit = undefined) {
    const baseQuery = `SELECT * FROM records WHERE userid = (SELECT id FROM users WHERE username = ?) ORDER BY date DESC`;
    if (limit === undefined) {
        return new Promise((resolve, reject) => {
            db.all(baseQuery, [username], (err, rows) => {
                if (err) {
                    logError('Get records error:' + err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    } else {
        return new Promise((resolve, reject) => {
            const query = `${baseQuery} LIMIT ?`;
            db.all(query, [username, limit], (err, rows) => {
                if (err) {
                    logError('Get records error:' + err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
}

export function getRecordByDate(username, date) {
    const query = `SELECT * FROM records WHERE userid = (SELECT id FROM users WHERE username = ?) AND date = ?`;
    return new Promise((resolve, reject) => {
        db.get(query, [username, date], (err, row) => {
            if (err) {
                logError('Get record by date error:' + err);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

export function deleteRecord(recordId) {
    return new Promise((resolve, reject) => {
        const query = `DELETE FROM records WHERE id = ?`;
        db.run(query, [recordId], (err) => {
            if (err) {
                logError('Delete record error:' + err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export function getRecordsByMonth(username, month) {
    const query = `SELECT * FROM records WHERE userid = (SELECT id FROM users WHERE username = ?) AND date LIKE ? ORDER BY date DESC`;
    return new Promise((resolve, reject) => {
        db.all(query, [username, month + '%'], (err, rows) => {
            if (err) {
                logError('Get records by month error:' + err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

export function getOldestRecord(username) {
    const query = `SELECT * FROM records WHERE userid = (SELECT id FROM users WHERE username = ?) ORDER BY date ASC LIMIT 1`;
    return new Promise((resolve, reject) => {
        db.get(query, [username], (err, row) => {
            if (err) {
                logError('Get oldest record error:' + err);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}