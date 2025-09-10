const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const saltRounds = 10;

module.exports = function(db, fs, passport) {

    router.post('/register', async (req, res) => {
        const { phoneNumber, username, password } = req.body;

        // Basic validation
        if (!phoneNumber || !username || !password) {
            return res.render('register', { error: 'All fields are required', user: null, page: 'register' });
        }

        if (db.users[phoneNumber]) {
            return res.render('register', { error: 'User with this phone number already exists', user: null, page: 'register' });
        }

        const usernameExists = Object.values(db.users).some(u => u.username === username);
        if (usernameExists) {
            return res.render('register', { error: 'Username is already taken', user: null, page: 'register' });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        db.users[phoneNumber] = {
            id: phoneNumber,
            username: username,
            password: hashedPassword,
            friends: [],
            friendRequests: []
        };

        fs.writeFileSync('database.json', JSON.stringify(db, null, 2));
        res.redirect('/login');
    });

    router.post('/login', passport.authenticate('local', {
        successRedirect: '/chat',
        failureRedirect: '/login',
        failureMessage: true
    }));

    router.get('/logout', (req, res, next) => {
        req.logout(function(err) {
            if (err) { return next(err); }
            res.redirect('/login');
        });
    });

    return router;
};