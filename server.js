require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');

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

// Hoofdpagina
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🎹 PianoPlanner draait op http://localhost:${PORT}`);
});
