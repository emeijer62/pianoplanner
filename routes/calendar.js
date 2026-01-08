const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const userStore = require('../utils/userStore');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

// Middleware: check of gebruiker Google tokens heeft
const requireGoogleAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }
    if (!req.session.tokens) {
        return res.status(400).json({ error: 'Geen Google verbinding', hint: 'Log in met Google' });
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
    oauth2Client.on('tokens', async (tokens) => {
        console.log(`🔄 Tokens refreshed voor gebruiker ${req.session.user.email}`);
        
        // Update sessie
        req.session.tokens = { ...req.session.tokens, ...tokens };
        
        // Update opgeslagen gebruiker
        try {
            const user = await userStore.getUser(req.session.user.id);
            if (user) {
                await userStore.saveUser({
                    ...user,
                    tokens: JSON.stringify({ ...JSON.parse(user.tokens || '{}'), ...tokens })
                });
            }
        } catch (error) {
            console.error('Error updating tokens:', error);
        }
    });
    
    return oauth2Client;
};

// Haal agenda's op
router.get('/calendars', requireGoogleAuth, async (req, res) => {
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
router.get('/events', requireGoogleAuth, async (req, res) => {
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
router.post('/events', requireGoogleAuth, async (req, res) => {
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
router.delete('/events/:eventId', requireGoogleAuth, async (req, res) => {
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

// ==================== SYNC SETTINGS ====================

// Get sync settings
router.get('/sync-settings', requireAuth, async (req, res) => {
    try {
        const settings = await userStore.getCalendarSync(req.session.user.id);
        res.json({ settings: settings || {} });
    } catch (error) {
        console.error('Error getting sync settings:', error);
        res.status(500).json({ error: 'Kon sync instellingen niet ophalen' });
    }
});

// Update sync settings
router.post('/sync-settings', requireAuth, async (req, res) => {
    try {
        const { enabled, syncDirection, googleCalendarId } = req.body;
        
        const result = await userStore.updateCalendarSync(req.session.user.id, {
            enabled: enabled,
            syncDirection: syncDirection || 'both',
            googleCalendarId: googleCalendarId || 'primary'
        });
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        console.log(`🔄 Calendar sync settings updated for user ${req.session.user.email}`);
        res.json({ success: true, settings: await userStore.getCalendarSync(req.session.user.id) });
    } catch (error) {
        console.error('Error updating sync settings:', error);
        res.status(500).json({ error: 'Kon sync instellingen niet opslaan' });
    }
});

// List user's calendars
router.get('/list', requireGoogleAuth, async (req, res) => {
    try {
        const auth = getAuthClient(req);
        const calendar = google.calendar({ version: 'v3', auth });
        
        const response = await calendar.calendarList.list();
        const calendars = response.data.items.map(cal => ({
            id: cal.id,
            summary: cal.summary,
            primary: cal.primary || false,
            accessRole: cal.accessRole
        }));
        
        res.json({ calendars });
    } catch (error) {
        console.error('Error listing calendars:', error.message);
        
        // Check voor token errors
        if (error.message?.includes('invalid_grant') || error.message?.includes('Token')) {
            return res.status(401).json({ 
                error: 'Google sessie verlopen', 
                hint: 'Log opnieuw in met Google om de verbinding te herstellen'
            });
        }
        
        res.status(500).json({ error: 'Kon agenda\'s niet ophalen: ' + error.message });
    }
});

// ==================== SYNC OPERATIONS ====================

// Perform sync
router.post('/sync', requireGoogleAuth, async (req, res) => {
    try {
        const syncSettings = await userStore.getCalendarSync(req.session.user.id);
        
        if (!syncSettings?.enabled) {
            return res.status(400).json({ error: 'Synchronisatie is niet ingeschakeld' });
        }
        
        const auth = getAuthClient(req);
        const calendar = google.calendar({ version: 'v3', auth });
        
        const calendarId = syncSettings.googleCalendarId || 'primary';
        const direction = syncSettings.syncDirection || 'both';
        
        let synced = 0;
        
        // Import appointmentStore voor database operaties
        const appointmentStore = require('../utils/appointmentStore');
        
        // Load local appointments from database
        const localAppointments = await appointmentStore.getAllAppointments(req.session.user.id);
        
        // Sync TO Google (local → Google)
        if (direction === 'both' || direction === 'toGoogle') {
            for (const appointment of localAppointments) {
                // Skip if already synced
                if (appointment.googleEventId) continue;
                
                try {
                    const event = {
                        summary: appointment.title || appointment.serviceName || 'PianoPlanner Afspraak',
                        description: `Klant: ${appointment.customerName || 'Onbekend'}\n${appointment.description || ''}`,
                        start: {
                            dateTime: appointment.start,
                            timeZone: 'Europe/Amsterdam'
                        },
                        end: {
                            dateTime: appointment.end,
                            timeZone: 'Europe/Amsterdam'
                        },
                        location: appointment.location || ''
                    };
                    
                    const response = await calendar.events.insert({
                        calendarId: calendarId,
                        resource: event
                    });
                    
                    // Save Google Event ID back to appointment in database
                    await appointmentStore.updateAppointment(req.session.user.id, appointment.id, {
                        googleEventId: response.data.id,
                        lastSynced: new Date().toISOString()
                    });
                    synced++;
                    console.log(`✅ Synced to Google: ${appointment.title}`);
                } catch (err) {
                    console.error('Error syncing event to Google:', err.message);
                }
            }
        }
        
        // Sync FROM Google (Google → local)
        // BELANGRIJK: Herlaad localAppointments om race condition te voorkomen
        // Dit zorgt ervoor dat we net-gepushte events met hun googleEventId zien
        if (direction === 'both' || direction === 'fromGoogle') {
            // Herlaad lokale afspraken om net-gesynchroniseerde googleEventIds te krijgen
            const refreshedLocalAppointments = await appointmentStore.getAllAppointments(req.session.user.id);
            
            // 1 week terug en 6 maanden vooruit
            const timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
            
            console.log(`🔄 Fetching Google events from ${timeMin} to ${timeMax} for calendar ${calendarId}`);
            
            const response = await calendar.events.list({
                calendarId: calendarId,
                timeMin: timeMin,
                timeMax: timeMax,
                singleEvents: true,
                orderBy: 'startTime'
            });
            
            const googleEvents = response.data.items || [];
            console.log(`🔄 Found ${googleEvents.length} events in Google Calendar`);
            
            for (const event of googleEvents) {
                // Skip if already have this event locally (by googleEventId)
                const existingByGoogleId = refreshedLocalAppointments.find(a => a.googleEventId === event.id);
                if (existingByGoogleId) {
                    console.log(`⏭️ Skipping already synced event: ${event.summary}`);
                    continue;
                }
                
                // Skip all-day events or events without proper dateTime
                if (!event.start?.dateTime || !event.end?.dateTime) {
                    console.log(`⏭️ Skipping event without dateTime: ${event.summary}`);
                    continue;
                }
                
                // Extra check: ook zoeken op titel + start + end als fallback tegen duplicaten
                const existingByContent = refreshedLocalAppointments.find(a => 
                    a.title === event.summary && 
                    a.start === event.start.dateTime && 
                    a.end === event.end.dateTime
                );
                
                if (existingByContent) {
                    // Als we een match vinden zonder googleEventId, update deze met de googleEventId
                    if (!existingByContent.googleEventId) {
                        await appointmentStore.updateAppointment(req.session.user.id, existingByContent.id, {
                            googleEventId: event.id,
                            lastSynced: new Date().toISOString()
                        });
                        console.log(`🔗 Linked existing appointment to Google event: ${event.summary}`);
                    }
                    continue;
                }
                
                // Create local appointment from Google event
                try {
                    await appointmentStore.createAppointment(req.session.user.id, {
                        googleEventId: event.id,
                        title: event.summary || 'Google Agenda',
                        description: event.description || '',
                        location: event.location || '',
                        start: event.start.dateTime,
                        end: event.end.dateTime,
                        allDay: false,
                        source: 'google',
                        lastSynced: new Date().toISOString()
                    });
                    synced++;
                } catch (err) {
                    console.error('Error creating appointment from Google:', err.message, 'Event:', event.summary);
                }
            }
        }
        
        // Update last sync time
        await userStore.updateCalendarSync(req.session.user.id, {
            ...syncSettings,
            lastSync: new Date().toISOString()
        });
        
        console.log(`🔄 Sync completed for ${req.session.user.email}: ${synced} items`);
        res.json({ success: true, synced: synced });
        
    } catch (error) {
        console.error('Sync error:', error.message);
        
        // Check voor token errors
        if (error.message?.includes('invalid_grant') || error.message?.includes('Token')) {
            return res.status(401).json({ 
                error: 'Google sessie verlopen', 
                hint: 'Log opnieuw in met Google om de verbinding te herstellen'
            });
        }
        
        res.status(500).json({ error: 'Synchronisatie mislukt: ' + error.message });
    }
});

module.exports = router;
