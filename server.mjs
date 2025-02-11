import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

import * as database from './database.mjs';

const PORT = 80;
const IP = '127.0.0.1'
const app = express();
// Gestion du chemin pour ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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




const ERROR_MESSAGES = {
    ADMIN_ONLY : {
        type : 'info',
        content : 'Vous devez être administrateur pour accéder à cette page.'
    },

    NO_RECORD_FOR_DATE : {
        type : 'warning',
        content : 'Aucun enregistrement pour cette date.'
    },

    NOT_LOGGED : {
        type : 'danger',
        content : 'Vous devez être connecté pour accéder à cette page.'
    },
    PWDS_NOT_MATCH : {
        type : 'danger',
        content : 'Les mots de passes ne correspondent pas.'
    },
    AUTH_FAILED : {
        type : 'danger',
        content : 'Les informations saisies sont incorrectes.'
    },
    MISSING_FIELDS : {
        type : 'danger',
        content : 'Veuillez remplir tous les champs.'
    },
    USERNAME_USED : {
        type : 'danger',
        content : 'Ce nom d\'utilisateur est déjà utilisé.'
    }
}




function tosha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function getTodaysDate() {
    let date = new Date();
    let day = date.getDate();
    let month = date.getMonth() + 1;
    let year = date.getFullYear();
    if (month < 10) {
        month = `0${month}`;
    }
    if (day < 10) {
        day = `0${day}`;
    }
    return `${year}-${month}-${day}`;
}

function dateDelta(date, deltaJours) {
    let dateObj = new Date(date);
    dateObj.setDate(dateObj.getDate() + deltaJours);
    let day = dateObj.getDate();
    let month = dateObj.getMonth() + 1;
    let year = dateObj.getFullYear();
    if (month < 10) {
        month = `0${month}`;
    }
    if (day < 10) {
        day = `0${day}`;
    }
    return `${year}-${month}-${day}`;
}

async function authenticateUser(username, passwordHash) {
    let user = await database.chechAuth(username, passwordHash);
    return user;
}

async function getUser(username) {
    let user = await database.getUser(username);
    return user;
}

async function registrationUser(user) {

    let user_get = await getUser(user.username);

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

    const dateR = req.query.date;
    res.render('formrecord', {
        error : null,
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
    if (recordR) {
        res.render('consultrecord', {
            error : null,
            record : recordR,
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
        res.redirect('/new?date=' + dateR);
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
        res.redirect('/consulter?date=' + dateR);
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

    res.render('admin', {
        error: null,
    });
});





// Login POST
app.post('/login-post', async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const hash = tosha256(password);

    const auth = await authenticateUser(username, hash);

    if (auth) {
        req.session.username = auth.username;
        req.session.admin = auth.admin;
        req.session.name = auth.name;
        req.session.friends = auth.friends;
        req.session.uid = auth.id;
        res.redirect('/dashboard');
    } else {
        req.session.error = ERROR_MESSAGES.AUTH_FAILED;
        res.redirect('/login');
    }
});

// Register POST
app.post('/register-post', async (req, res) => {
    const username = req.body.username;
    const name = req.body.name;
    const password = req.body.password;
    const password2 = req.body.passwordrepeat;
    const hash = tosha256(password);

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

    const username = req.body.username;
    const name = req.body.name;

    if (username && username != req.session.username) {
        const u = await getUser(username);
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

    res.redirect('/profil');
});

// Modification du mdp POST
app.post('/update-profile-password-post', (req, res) => {

    if (!req.session.username) {
        req.session.error = ERROR_MESSAGES.NOT_LOGGED;
        res.redirect('/login');
        return;
    }

    const password = req.body.password;
    const password2 = req.body.passwordrepeat;

    if (password != password2) {
        req.session.error = ERROR_MESSAGES.PWDS_NOT_MATCH;
        res.redirect('/profil');
        return;
    }

    const hash = tosha256(password);

    database.updateUserPwd(req.session.uid, hash);
});


app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'views/404.html'));
});

app.listen(PORT, IP, () => {
    console.log(`Serveur lancé sur http://${IP}:${PORT}`);
});