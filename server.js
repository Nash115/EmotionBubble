import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

import * as database from './modules/database.js';
import { ERROR_MESSAGES } from './modules/errors.js';
import { tosha256, getTodaysDate, dateDelta, log, logError } from './modules/tools.js';

const PORT = process.env.PORT || 3000;
const IP = '0.0.0.0'
const app = express();
// Gestion du chemin pour ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check and create directories if they don't exist
const directories = ['db', 'logs'];
directories.forEach(dir => {
    if (!fs.existsSync(path.join(__dirname, dir))) {
        fs.mkdirSync(path.join(__dirname, dir));
    }
});

// Configuration d'EJS comme moteur de rendu
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: crypto.randomBytes(12).toString('hex'),
    resave: false,
    saveUninitialized: true,
}));

app.use(express.static(path.join(__dirname, 'public')));





async function registrationUser(user) {

    let user_get = await database.getUser(user.username);

    if (user_get) {
        return false;
    } else {
        database.insertUser(user);
        return true;
    }
}

async function getTodayRecord(username) {
    let record = await database.getRecords(username, 1);
    if (record.length == 0 || record[0].date != getTodaysDate()) {
        return {
            mood: null,
            weather: null,
        };
    }
    return record[0];
}

async function getLastRecords(username) {
    let records = await database.getRecords(username, 31);
    let days = [];
    for (let i = 1; i < 31; i++) {
        let date = dateDelta(getTodaysDate(), -i);
        let record = records.find((r) => r.date == date);
        if (record) {
            days.push(record);
        } else {
            days.push({
                mood: null,
                weather: null,
                date: date,
                visibility: 0,
                title: null,
                content: null
            });
        }
    }
    return days;
}

async function getAllRecords(username) {
    let records = await database.getRecords(username);
    if (records.length == 0) {
        return [];
    }
    return records;
}

async function getRecordsByMonth(username, month) {
    // month is a string in the format 'YYYY-MM'
    let records = await database.getRecordsByMonth(username, month);
    return records;
}

async function getFriends(user) {
    const uid = user.uid;
    const realFriends = [];
    for (let fid of user.friends) {
        const friend = await database.getUserById(fid);
        if (!friend) {
            user.friends = user.friends.filter((f) => f != fid);
        }
        if (friend.friends.includes(uid)) {
            realFriends.push({
                uid: fid,
                name: friend.name,
                username: friend.username
            });
        }
    }
    return realFriends;
}

async function getFriendRequests(user) {
    const uid = user.uid;
    const friendRequests = [];
    for (let fid of user.friends) {
        const friend = await database.getUserById(fid);
        if (!friend) {
            user.friends = user.friends.filter((f) => f != fid);
        }
        if (!friend.friends.includes(uid)) {
            friendRequests.push({
                uid: fid,
                username: friend.username
            });
        }
    }
    return friendRequests;
}

async function getFriendsRecords(friendsArray, date) {
    const friendsRecords = [];
    for (let f of friendsArray) {
        const idOfFriend = f.uid;
        const friend = await database.getUserById(idOfFriend);
        if (!friend) {
            user.friends = user.friends.filter((f) => f != idOfFriend);
        }
        const record = await database.getRecordByDate(friend.username, date);
        if (record && record.visibility == 1) {
            friendsRecords.push({
                uid: idOfFriend,
                name: friend.name,
                username: friend.username,
                record: record
            });
        }
    }
    return friendsRecords;
}

function getLogsByDate(date) {
    const logFilePath = path.join(__dirname, 'logs', `${date}.log`);
    if (fs.existsSync(logFilePath)) {
        const logData = fs.readFileSync(logFilePath, 'utf-8');
        return logData.split('\n').filter(line => line.trim() !== '');
    } else {
        return [];
    }
}

function getExistingLogs() {
    const logFiles = fs.readdirSync(path.join(__dirname, 'logs'));
    return logFiles;
}

function isSecurePassword(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*(),-.?":{}|<>]/.test(password);
    const hasNoSpaces = !/\s/.test(password);
    const isLongEnough = password.length >= minLength;
    return hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChars && hasNoSpaces && isLongEnough;
}


// Page d'accueil
app.get('/', (req, res) => {
    res.render('index', {user: req.session});
});

// Page de login
app.get('/login', (req, res) => {
    const error = req.session.error;
    req.session.error = null;
    res.render('login', { error : error });
});

// Page de register
app.get('/register', (req, res) => {
    const error = req.session.error;
    req.session.error = null;
    res.render('register', { error : error });
});

// Dashboard
app.get('/dashboard', async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    res.render('dashboard', {
        user: req.session,
        todaysDate : getTodaysDate(),
        today : await getTodayRecord(req.session.username),
        jours : await getLastRecords(req.session.username)
    });
});

// Historique
app.get('/historique', async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    res.render('history', {
        user: req.session,
        friend : null,
        jours : await getAllRecords(req.session.username)
    });
});

// Gestion du logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Page de nouvel enregistrement
app.get('/new', (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    const error = req.session.error;
    req.session.error = null;

    const dateR = req.query.date;
    res.render('formrecord', {
        error : error,
        record : {
            date : dateR,
            mood : null,
            weather : null,
            visibility : 0,
            title : null,
            content : null
        },
    });
});

// Page de consultation
app.get('/consulter', async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    const dateR = req.query.date;
    const recordR = await database.getRecordByDate(req.session.username, dateR);
    const friendsRecords = await getFriendsRecords( await getFriends(req.session), dateR);
    if (recordR) {
        res.render('consultrecord', {
            error : null,
            record : recordR,
            friendsRecords : friendsRecords
        });
    } else {
        res.render('consultrecord', {
            error : ERROR_MESSAGES.NO_RECORD_FOR_DATE,
            record : {
                date : dateR,
                mood : null,
                weather : null,
                visibility : 0,
                title : null,
                content : null
            },
            friendsRecords : friendsRecords
        });
    }
});

// Modification d'enregistrement
app.get('/modif-record', async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    const dateR = req.query.date;
    const recordR = await database.getRecordByDate(req.session.username, dateR);
    if (recordR) {
        res.render('formrecord', {
            error : null,
            record : recordR,
        });
    } else {
        if (dateR) {
            res.redirect('/new?date=' + dateR);
        } else {
            res.redirect('/new');
        }
    }
});

// Suppression d'enregistrement
app.get('/delete-record', async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    const dateR = req.query.date;
    const recordR = await database.getRecordByDate(req.session.username, dateR);
    if (recordR) {
        database.deleteRecord(recordR.id);
        res.redirect('/dashboard');
    } else {
        if (dateR) {
            res.redirect('/new?date=' + dateR);
        } else {
            res.redirect('/new');
        }
    }
});

// Profil
app.get('/profil', async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    const error = req.session.error;
    req.session.error = null;
    
    res.render('profile', {
        error : error,
        user: req.session
    });
});

// Administration
app.get('/admin', async (req, res) => {

    if (!req.session.admin) {
        req.session.error = ERROR_MESSAGES.ADMIN_ONLY;
        res.redirect('/login');
        return;
    }

    const dateLogs = req.query.dateLogs ? req.query.dateLogs : getTodaysDate();

    const logsArray = getLogsByDate(dateLogs);

    res.render('admin', {
        user: req.session,
        error: null,
        logs: logsArray,
        logFiles: getExistingLogs(),
        logDisplayed: dateLogs + '.log'
    });
});

app.get('/amis', async (req, res) => {
    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    const error = req.session.error;
    req.session.error = null;
    
    res.render('friends', {
        error : error,
        user: req.session,
        friends : await getFriends(req.session),
        friendRequests : await getFriendRequests(req.session)
    });
});

// Page d'ami
app.get('/ami', async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    if (! req.query.username ) {
        req.session.error = ERROR_MESSAGES.MISSING_FIELDS;
        res.redirect('/profil');
        return;
    }

    const friendsArray = await getFriends(req.session);
    const friendsUsernamesArray = friendsArray.map((f) => f.username);

    if (!friendsUsernamesArray.includes(req.query.username)) {
        req.session.error = ERROR_MESSAGES.FRIEND_NOT_FOUND;
        res.redirect('/profil');
        return;
    }

    const friend = await database.getUser(req.query.username);

    res.render('history', {
        user: req.session,
        friend : friend,
        jours : (await getAllRecords(req.query.username)).filter((r) => r.visibility == 1)
    });
});

// Suppression d'ami
app.get('/delete-friend', async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    if (! req.query.username ) {
        req.session.error = ERROR_MESSAGES.MISSING_FIELDS;
        res.redirect('/profil');
        return;
    }

    const friend_username = req.query.username;
    const friend = await database.getUser(friend_username);
    if (!friend) {
        req.session.error = ERROR_MESSAGES.USER_NOT_FOUND;
        res.redirect('/profil');
        return;
    }
    const friend_id = friend.id;
    await database.deleteFriend(req.session.uid, friend_id);

    req.session.friends = req.session.friends.filter((f) => f != friend_id);
    req.session.error = ERROR_MESSAGES.FRIEND_DELETED;
    res.redirect('/profil');
});

// Page de statistiques

app.get('/statistiques', async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    const mois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

    const oldestRecord = await database.getOldestRecord(req.session.username);
    const oldestYear = oldestRecord ? oldestRecord.date.substring(0, 4) : getTodaysDate().substring(0, 4);

    const years = [];
    for (let i = parseInt(oldestYear); i <= parseInt(getTodaysDate().substring(0, 4)); i++) {
        years.push(i);
    }

    const annee = req.query.annee ? req.query.annee : getTodaysDate().substring(0, 4);
    const dataAnnee = [];

    for (let i = 0; i < 12; i++) {
        let moyenneMood = 0;
        let moyenneWeather = 0;
        let nbRecords = 0;
        const month = (i + 1).toString().padStart(2, '0');
        const firstDayOfMonth = new Date(`${annee}-${month}-01`);
        const iFirstWeekDay = firstDayOfMonth.getDay();
        const nomDuMois = mois[firstDayOfMonth.getMonth()] + ' ' + firstDayOfMonth.getFullYear();
        const records = await getRecordsByMonth(req.session.username, `${annee}-${month}`);
        const nbOfDays = new Date(firstDayOfMonth.getFullYear(), firstDayOfMonth.getMonth() + 1, 0).getDate();

        for (let r of records) {
            if (r.mood) {
                nbRecords++;
                moyenneMood += r.mood;
                moyenneWeather += r.weather;
            }
        }
        moyenneMood = nbRecords > 0 ? moyenneMood / nbRecords : 0;
        moyenneMood = Math.round(moyenneMood);
        moyenneWeather = nbRecords > 0 ? moyenneWeather / nbRecords : 0;
        moyenneWeather = Math.round(moyenneWeather);

        dataAnnee.push({
            records: records,
            iFirstWeekDay: iFirstWeekDay,
            nomDuMois: nomDuMois,
            nbOfDays: nbOfDays,
            moyenneMood: moyenneMood,
            moyenneWeather: moyenneWeather,
            mois: `${annee}-${month}`
        });
    }
    res.render('stats', {
        user: req.session,
        dataAnnee: dataAnnee,
        years : years,
        annee: annee,
        todaysDate : getTodaysDate()
    });
});





// Login POST
app.post('/login-post', async (req, res) => {

    if (! req.body.username || ! req.body.password) {
        req.session.error = ERROR_MESSAGES.MISSING_FIELDS;
        res.redirect('/login');
        return;
    }

    const username = req.body.username;
    const password = req.body.password;
    const hash = tosha256(password);

    const auth = await database.chechAuth(username, hash);

    if (auth) {
        req.session.username = auth.username;
        req.session.admin = auth.admin;
        req.session.name = auth.name;
        req.session.friends = auth.friends;
        req.session.uid = auth.id;

       log(req.session.username + " logged in from IP: " + req.ip);

        res.redirect('/dashboard');
    } else {
        req.session.error = ERROR_MESSAGES.AUTH_FAILED;
        res.redirect('/login');
    }
});

// Register POST
app.post('/register-post', async (req, res) => {

    if (! req.body.username || ! req.body.name || ! req.body.password || ! req.body.passwordrepeat) {
        req.session.error = ERROR_MESSAGES.MISSING_FIELDS;
        res.redirect('/register');
        return;
    }

    const username = req.body.username.trim();
    const name = req.body.name;
    const password = req.body.password.trim();
    const password2 = req.body.passwordrepeat.trim();
    const hash = tosha256(password);

    if (!isSecurePassword(password)) {
        req.session.error = ERROR_MESSAGES.PASSWORD_NOT_SECURE;
        res.redirect('/register');
        return;
    }

    if (password != password2) {
        req.session.error = ERROR_MESSAGES.PWDS_NOT_MATCH;
        res.redirect('/register');
        return;
    }

    if (username == '' || name == '' || password == '') {
        req.session.error = ERROR_MESSAGES.MISSING_FIELDS;
        res.redirect('/register');
        return;
    }

    const reg = await registrationUser({
        username: username,
        name: name,
        password: hash,
        admin: 0,
        friends: [],
    });

    if (reg) {

        log(username + " registered from IP: " + req.ip);

        res.redirect('/login');
    } else {
        req.session.error = ERROR_MESSAGES.USERNAME_USED;
        res.redirect('/register');
    }
});

// Modification / Création POST
app.post('/modification-post',  async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    if (! req.body.date || ! req.body.mood || ! req.body.weather) {
        req.session.error = ERROR_MESSAGES.MISSING_FIELDS;
        res.redirect('/new');
        return;
    }

    const date = req.body.date;
    const mood = req.body.mood;
    const weather = req.body.weather;
    let visibility = req.body.visibility;
    const title = req.body.title;
    const content = req.body.content;
    if (!visibility) {
        visibility = 0;
    } else {
        visibility = 1;
    }

    const dateRecord = await database.getRecordByDate(req.session.username, req.body.date);

    const record = {
        userid : req.session.uid,
        date : date,
        mood : mood,
        weather : weather,
        visibility : visibility,
        title : title,
        content : content
    }

    if (dateRecord) {
        database.updateRecord(record);
    } else {
        database.insertRecord(record);
    }

    res.redirect('/dashboard');
});

// Modification du profil POST
app.post('/update-profile-post', async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    if (! req.body.username && ! req.body.name) {
        req.session.error = ERROR_MESSAGES.MISSING_FIELDS;
        res.redirect('/profil');
        return;
    }

    const username = req.body.username;
    const name = req.body.name;

    if (username && username != req.session.username) {
        const u = await database.getUser(username);
        if (u) {
            req.session.error = ERROR_MESSAGES.USERNAME_USED;
            res.redirect('/profil');
            return;
        } else {
            req.session.username = username;
        }
    }
    if (name && name != req.session.name) {
        req.session.name = name;
    }

    database.updateUser(req.session.uid, req.session.username, req.session.name);

    req.session.error = ERROR_MESSAGES.PROFILE_UPDATED;
    res.redirect('/profil');
});

// Modification du mdp POST
app.post('/update-profile-password-post', (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    if (! req.body.password && ! req.body.passwordrepeat) {
        req.session.error = ERROR_MESSAGES.MISSING_FIELDS;
        res.redirect('/profil');
        return;
    }

    const password = req.body.password;
    const password2 = req.body.passwordrepeat;

    if (!isSecurePassword(password)) {
        req.session.error = ERROR_MESSAGES.PASSWORD_NOT_SECURE;
        res.redirect('/profil');
        return;
    }

    if (password != password2) {
        req.session.error = ERROR_MESSAGES.PWDS_NOT_MATCH;
        res.redirect('/profil');
        return;
    }

    const hash = tosha256(password);

    database.updateUserPwd(req.session.uid, hash);

    req.session.error = ERROR_MESSAGES.PASSWORD_UPDATED;
    res.redirect('/profil');
});

// Ajout d'ami POST
app.post('/add-friend-post', async (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    if (! req.body.username) {
        req.session.error = ERROR_MESSAGES.MISSING_FIELDS;
        res.redirect('/amis');
        return;
    }

    const friend_username = req.body.username;
    const friend = await database.getUser(friend_username);
    if (!friend) {
        req.session.error = ERROR_MESSAGES.USER_NOT_FOUND;
        res.redirect('/amis');
        return;
    }
    const friend_id = friend.id;
    await database.addFriend(req.session.uid, friend_id);

    req.session.friends.push(friend_id);
    req.session.error = ERROR_MESSAGES.FRIEND_ADDED;
    res.redirect('/amis');
});


app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'views/404.html'));
});

app.listen(PORT, IP, () => {
    log(`Server running at http://${IP}:${PORT}`);
});