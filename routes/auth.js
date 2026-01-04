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

// ==================== EMAIL/PASSWORD AUTH ====================

// Registreren met email/wachtwoord
router.post('/register', (req, res) => {
    const { email, password, name } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email en wachtwoord zijn verplicht' });
    }

    // Valideer email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Ongeldig email formaat' });
    }

    const result = userStore.registerUser(email, password, name);

    if (result.error) {
        return res.status(400).json({ error: result.error });
    }

    // NIET direct inloggen - wacht op goedkeuring
    console.log(`📋 Nieuwe registratie wacht op goedkeuring: ${email}`);

    res.json({ 
        success: true, 
        needsApproval: true,
        message: 'Je account is aangemaakt! Je ontvangt bericht zodra een beheerder je account heeft goedgekeurd.',
        user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name
        }
    });
});

// Inloggen met email/wachtwoord
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email en wachtwoord zijn verplicht' });
    }

    const result = userStore.loginWithEmail(email, password);

    if (result.error) {
        console.log(`⚠️ Mislukte login poging: ${email}`);
        return res.status(401).json({ error: result.error });
    }

    // Zet sessie
    req.session.user = {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        picture: result.user.picture,
        authType: result.user.authType
    };

    console.log(`✅ Gebruiker ingelogd (email): ${email}`);

    res.json({ 
        success: true, 
        message: 'Succesvol ingelogd',
        user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name
        }
    });
});

// ==================== GOOGLE OAUTH ====================

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
            tokens: tokens,
            authType: 'google',
            calendarSync: existingUser?.calendarSync || {
                enabled: false,
                googleCalendarId: null,
                lastSync: null,
                syncDirection: 'both'
            }
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
            picture: user.picture,
            authType: 'google'
        };
        req.session.tokens = tokens;

        // Sla sessie expliciet op voor redirect
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.redirect('/?error=session_failed');
            }
            console.log(`✅ Gebruiker ingelogd (Google): ${user.email}`);
            res.redirect('/dashboard.html');
        });

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

// ==================== PROFILE MANAGEMENT ====================

// Update profiel (naam en email)
router.put('/profile', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    const { name, email } = req.body;

    if (!name && !email) {
        return res.status(400).json({ error: 'Geen wijzigingen opgegeven' });
    }

    // Valideer email format als opgegeven
    if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Ongeldig email formaat' });
        }
    }

    const result = userStore.updateUserProfile(req.session.user.id, { name, email });

    if (result.error) {
        return res.status(400).json({ error: result.error });
    }

    // Update sessie met nieuwe gegevens
    if (name) req.session.user.name = name;
    if (email) req.session.user.email = email;

    console.log(`✏️ Profiel bijgewerkt: ${req.session.user.email}`);
    res.json({ 
        success: true, 
        message: 'Profiel bijgewerkt',
        user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email
        }
    });
});

// Wijzig wachtwoord
router.put('/password', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;
    const user = userStore.getUser(req.session.user.id);

    // Voor Google gebruikers die voor het eerst een wachtwoord instellen
    if (user.authType === 'google' && !user.passwordHash) {
        if (!newPassword) {
            return res.status(400).json({ error: 'Nieuw wachtwoord is verplicht' });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'Wachtwoorden komen niet overeen' });
        }
        
        const result = userStore.changePassword(req.session.user.id, '', newPassword);
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        console.log(`🔐 Wachtwoord ingesteld voor Google gebruiker: ${req.session.user.email}`);
        return res.json({ success: true, message: 'Wachtwoord ingesteld! Je kunt nu ook inloggen met email en wachtwoord.' });
    }

    // Normale wachtwoord wijziging
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Huidig en nieuw wachtwoord zijn verplicht' });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'Nieuwe wachtwoorden komen niet overeen' });
    }

    const result = userStore.changePassword(req.session.user.id, currentPassword, newPassword);

    if (result.error) {
        return res.status(400).json({ error: result.error });
    }

    console.log(`🔐 Wachtwoord gewijzigd: ${req.session.user.email}`);
    res.json({ success: true, message: 'Wachtwoord succesvol gewijzigd' });
});

// Haal huidige profiel gegevens op
router.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    const user = userStore.getUser(req.session.user.id);
    if (!user) {
        return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }

    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        authType: user.authType,
        hasPassword: !!user.passwordHash,
        createdAt: user.createdAt
    });
});

module.exports = router;
