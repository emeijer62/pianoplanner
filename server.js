require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');
const userStore = require('./utils/userStore');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuratie
app.use(session({
    secret: process.env.SESSION_SECRET || 'pianoplanner-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Zet op true in productie met HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 uur
    }
}));

// Routes
app.use('/auth', authRoutes);
app.use('/api/calendar', calendarRoutes);

// API route om ingelogde gebruiker te checken
app.get('/api/user', (req, res) => {
    if (req.session.user) {
        res.json({ 
            loggedIn: true, 
            user: req.session.user 
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Admin: bekijk alle geregistreerde gebruikers (alleen emails, geen tokens)
app.get('/api/admin/users', (req, res) => {
    // Optioneel: voeg authenticatie toe voor admin
    const users = userStore.getAllUsers();
    const safeUsers = Object.values(users).map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    }));
    res.json({
        total: safeUsers.length,
        users: safeUsers
    });
});

// Hoofdpagina
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🎹 PianoPlanner draait op http://localhost:${PORT}`);
});
