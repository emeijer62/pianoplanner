const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const userStore = require('../utils/userStore');

// Middleware: check of gebruiker ingelogd is
const requireAuth = (req, res, next) => {
    if (!req.session.user || !req.session.tokens) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }
    next();
};

// Helper: maak OAuth2 client met user tokens (met auto-refresh)
const getAuthClient = (req) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(req.session.tokens);
    
    // Automatisch tokens refreshen als ze verlopen zijn
    oauth2Client.on('tokens', (tokens) => {
        console.log(`🔄 Tokens refreshed voor gebruiker ${req.session.user.email}`);
        
        // Update sessie
        req.session.tokens = { ...req.session.tokens, ...tokens };
        
        // Update opgeslagen gebruiker
        const user = userStore.getUser(req.session.user.id);
        if (user) {
            userStore.saveUser({
                ...user,
                tokens: { ...user.tokens, ...tokens }
            });
        }
    });
    
    return oauth2Client;
};

// Haal agenda's op
router.get('/calendars', requireAuth, async (req, res) => {
    try {
        const auth = getAuthClient(req);
        const calendar = google.calendar({ version: 'v3', auth });
        
        const response = await calendar.calendarList.list();
        res.json(response.data.items);
    } catch (error) {
        console.error('Calendar list error:', error);
        res.status(500).json({ error: 'Kon agenda\'s niet ophalen' });
    }
});

// Haal events op van komende week
router.get('/events', requireAuth, async (req, res) => {
    try {
        const auth = getAuthClient(req);
        const calendar = google.calendar({ version: 'v3', auth });
        
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: now.toISOString(),
            timeMax: nextWeek.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 50
        });
        
        res.json(response.data.items || []);
    } catch (error) {
        console.error('Events error:', error);
        res.status(500).json({ error: 'Kon events niet ophalen' });
    }
});

// Maak nieuw event aan
router.post('/events', requireAuth, async (req, res) => {
    try {
        const { summary, description, start, end, location } = req.body;
        
        if (!summary || !start || !end) {
            return res.status(400).json({ error: 'Titel, start en eind zijn verplicht' });
        }

        const auth = getAuthClient(req);
        const calendar = google.calendar({ version: 'v3', auth });
        
        const event = {
            summary,
            description: description || '',
            location: location || '',
            start: {
                dateTime: start,
                timeZone: 'Europe/Amsterdam'
            },
            end: {
                dateTime: end,
                timeZone: 'Europe/Amsterdam'
            }
        };
        
        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({ error: 'Kon event niet aanmaken' });
    }
});

// Verwijder event
router.delete('/events/:eventId', requireAuth, async (req, res) => {
    try {
        const { eventId } = req.params;
        const auth = getAuthClient(req);
        const calendar = google.calendar({ version: 'v3', auth });
        
        await calendar.events.delete({
            calendarId: 'primary',
            eventId: eventId
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({ error: 'Kon event niet verwijderen' });
    }
});

module.exports = router;
