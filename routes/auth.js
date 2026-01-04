const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const userStore = require('../utils/userStore');

// Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Admin credentials (uit environment of defaults)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'PianoAdmin2026!';

// Scopes voor Google Calendar
const SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
];

// Start Google OAuth flow
router.get('/google', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });
    res.redirect(authUrl);
});

// Google OAuth callback
router.get('/google/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.redirect('/?error=no_code');
    }

    try {
        // Verkrijg tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Haal gebruikersinfo op
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data: userInfo } = await oauth2.userinfo.get();

        // Check of dit een nieuwe gebruiker is
        const existingUser = userStore.getUser(userInfo.id);
        const isNewUser = !existingUser;

        // Sla gebruiker op (of update)
        const user = userStore.saveUser({
            id: userInfo.id,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            tokens: tokens
        });

        // Start trial voor nieuwe gebruikers
        if (isNewUser) {
            userStore.startTrial(user.id);
            console.log(`🎁 Nieuwe gebruiker, trial gestart: ${user.email}`);
        }

        // Zet sessie
        req.session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture
        };
        req.session.tokens = tokens;

        console.log(`✅ Gebruiker ingelogd: ${user.email}`);
        res.redirect('/dashboard.html');

    } catch (error) {
        console.error('OAuth error:', error);
        res.redirect('/?error=oauth_failed');
    }
});

// Uitloggen
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// ==================== ADMIN LOGIN ====================

// Admin login met username/password
router.post('/admin/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn verplicht' });
    }

    // Check credentials
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        // Zet admin sessie
        req.session.user = {
            id: 'admin',
            email: 'admin@pianoplanner.com',
            name: 'Administrator',
            isAdminUser: true
        };
        req.session.isAdmin = true;

        console.log(`🔐 Admin ingelogd: ${username}`);
        res.json({ success: true, message: 'Ingelogd als admin' });
    } else {
        console.log(`⚠️ Mislukte admin login poging: ${username}`);
        res.status(401).json({ error: 'Ongeldige gebruikersnaam of wachtwoord' });
    }
});

// Check admin status
router.get('/admin/status', (req, res) => {
    const isAdmin = req.session.isAdmin || false;
    res.json({ isAdmin });
});

module.exports = router;
