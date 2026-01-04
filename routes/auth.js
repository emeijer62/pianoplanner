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

        // Sla gebruiker op (of update)
        const user = userStore.saveUser({
            id: userInfo.id,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            tokens: tokens
        });

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

module.exports = router;
