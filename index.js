const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const fs = require('fs');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Load database
let db = JSON.parse(fs.readFileSync('database.json'));

// In-memory stores
let onlineUsers = {};

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport Configuration
passport.use(new LocalStrategy(
    { usernameField: 'loginIdentifier' },
    async (loginIdentifier, password, done) => {
        const userId = Object.keys(db.users).find(key => db.users[key].username === loginIdentifier || key === loginIdentifier);
        const user = userId ? db.users[userId] : null;
        if (user && user.password && await bcrypt.compare(password, user.password)) {
            return done(null, { ...user, id: userId });
        }
        return done(null, false, { message: 'Invalid credentials' });
    }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const user = db.users[id];
    done(null, user ? { ...user, id } : null);
});

// Routes
const authRoutes = require('./routes/auth')(db, fs, passport);
app.use(authRoutes);

app.get('/', (req, res) => res.render('index', { user: req.user, page: 'home' }));
app.get('/login', (req, res) => res.render('login', { user: req.user, page: 'login', error: req.session.messages ? req.session.messages.pop() : null }));
app.get('/register', (req, res) => res.render('register', { user: req.user, page: 'register', error: null }));
app.get('/chat', (req, res) => req.user ? res.render('chat', { user: req.user, page: 'chat' }) : res.redirect('/login'));

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    let currentUserId = null;

    const emitOnlineUsers = () => {
        io.emit('online users', Object.keys(onlineUsers).map(id => ({ id, username: onlineUsers[id].username })));
    };

    socket.on('new user', (userId) => {
        if (userId && db.users[userId]) {
            currentUserId = userId;
            onlineUsers[userId] = { socketId: socket.id, username: db.users[userId].username };
            emitOnlineUsers();
        }
    });

    socket.on('load user data', (userId) => {
        const user = db.users[userId];
        if (!user) return;
        const friends = (user.friends || []).map(id => ({ id, username: db.users[id]?.username || 'Unknown' }));
        const friendRequests = (user.friendRequests || []).map(id => ({ senderId: id, senderUsername: db.users[id]?.username || 'Unknown' }));
        socket.emit('user data', { friends, friendRequests });
    });

    socket.on('friend request', ({ senderId, recipientId }) => {
        const recipient = db.users[recipientId];
        if (recipient && !(recipient.friendRequests || []).includes(senderId) && !(recipient.friends || []).includes(senderId)) {
            recipient.friendRequests = recipient.friendRequests || [];
            recipient.friendRequests.push(senderId);
            fs.writeFileSync('database.json', JSON.stringify(db, null, 2));

            const recipientSocketId = onlineUsers[recipientId]?.socketId;
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('new friend request', { senderId, senderUsername: db.users[senderId]?.username });
            }
        }
    });

    socket.on('accept friend request', ({ userId, requesterId }) => {
        const user = db.users[userId];
        const requester = db.users[requesterId];
        if (user && requester) {
            user.friends = user.friends || [];
            user.friends.push(requesterId);
            requester.friends = requester.friends || [];
            requester.friends.push(userId);
            user.friendRequests = (user.friendRequests || []).filter(id => id !== requesterId);
            fs.writeFileSync('database.json', JSON.stringify(db, null, 2));

            const newFriendForUser = { id: requesterId, username: requester.username };
            socket.emit('friend request accepted', newFriendForUser);

            const requesterSocketId = onlineUsers[requesterId]?.socketId;
            if (requesterSocketId) {
                const newFriendForRequester = { id: userId, username: user.username };
                io.to(requesterSocketId).emit('friend request accepted', newFriendForRequester);
            }
        }
    });

    socket.on('decline friend request', ({ userId, requesterId }) => {
        const user = db.users[userId];
        if (user && user.friendRequests) {
            user.friendRequests = user.friendRequests.filter(id => id !== requesterId);
            fs.writeFileSync('database.json', JSON.stringify(db, null, 2));
        }
    });

    socket.on('chat message', (msg) => {
        const chatKey = [msg.sender, msg.receiver].sort().join('-');
        db.messages[chatKey] = db.messages[chatKey] || [];
        db.messages[chatKey].push(msg);
        fs.writeFileSync('database.json', JSON.stringify(db, null, 2));

        const receiverSocketId = onlineUsers[msg.receiver]?.socketId;
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('chat message', msg);
        }
    });

    socket.on('load history', (data) => {
        const chatKey = [data.sender, data.receiver].sort().join('-');
        socket.emit('history', db.messages[chatKey] || []);
    });
    
    socket.on('request online friends', () => {
         emitOnlineUsers();
    });

    socket.on('disconnect', () => {
        if (currentUserId) {
            delete onlineUsers[currentUserId];
            emitOnlineUsers();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is already in use. You may need to stop the existing process.`);
    } else {
        console.error(err);
    }
});