/**
 * Background Calendar Sync Service
 * Synchroniseert automatisch agenda's voor alle gebruikers met sync enabled
 */

const { google } = require('googleapis');
const userStore = require('./userStore');
const appointmentStore = require('./appointmentStore');

// Sync interval: elke 15 minuten
const SYNC_INTERVAL = 15 * 60 * 1000;

/**
 * Maak OAuth client voor een gebruiker (zonder sessie)
 */
const createAuthClient = (tokens) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
};

/**
 * Sync een enkele gebruiker
 */
const syncUserCalendar = async (user) => {
    try {
        // Check of user tokens heeft
        if (!user.tokens || !user.tokens.refresh_token) {
            console.log(`⏭️ Skip sync voor ${user.email}: geen refresh token`);
            return { skipped: true, reason: 'no_refresh_token' };
        }
        
        // Check sync instellingen
        const syncSettings = await userStore.getCalendarSync(user.id);
        if (!syncSettings?.enabled) {
            return { skipped: true, reason: 'sync_disabled' };
        }
        
        console.log(`🔄 Start sync voor ${user.email}...`);
        
        const auth = createAuthClient(user.tokens);
        const calendar = google.calendar({ version: 'v3', auth });
        
        const calendarId = syncSettings.googleCalendarId || 'primary';
        const direction = syncSettings.syncDirection || 'both';
        
        let synced = 0;
        let errors = 0;
        
        // Haal lokale afspraken op
        const localAppointments = await appointmentStore.getAllAppointments(user.id);
        
        // Sync TO Google (local → Google)
        if (direction === 'both' || direction === 'toGoogle') {
            for (const appointment of localAppointments) {
                // Skip als al gesynchroniseerd
                if (appointment.googleEventId) continue;
                
                try {
                    const event = {
                        summary: appointment.title || appointment.serviceName || 'PianoPlanner Afspraak',
                        description: `Klant: ${appointment.customerName || 'Onbekend'}\n${appointment.notes || ''}`,
                        start: {
                            dateTime: appointment.startTime || appointment.start,
                            timeZone: 'Europe/Amsterdam'
                        },
                        end: {
                            dateTime: appointment.endTime || appointment.end,
                            timeZone: 'Europe/Amsterdam'
                        },
                        location: appointment.address || appointment.location || ''
                    };
                    
                    const response = await calendar.events.insert({
                        calendarId: calendarId,
                        resource: event
                    });
                    
                    await appointmentStore.updateAppointment(user.id, appointment.id, {
                        googleEventId: response.data.id,
                        lastSynced: new Date().toISOString()
                    });
                    synced++;
                } catch (err) {
                    errors++;
                    console.error(`Error syncing event for ${user.email}:`, err.message);
                }
            }
        }
        
        // Sync FROM Google (Google → local)
        if (direction === 'both' || direction === 'fromGoogle') {
            try {
                const now = new Date();
                const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                const threeMonthsLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
                
                const response = await calendar.events.list({
                    calendarId: calendarId,
                    timeMin: oneMonthAgo.toISOString(),
                    timeMax: threeMonthsLater.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime'
                });
                
                const googleEvents = response.data.items || [];
                
                for (const event of googleEvents) {
                    // Skip all-day events
                    if (!event.start?.dateTime) continue;
                    
                    // Check of dit event al bestaat in lokale database (via googleEventId)
                    const existingAppointments = localAppointments.filter(a => a.googleEventId === event.id);
                    
                    if (existingAppointments.length === 0) {
                        // Maak nieuw lokaal event aan
                        try {
                            await appointmentStore.createAppointment(user.id, {
                                title: event.summary || 'Google Agenda Event',
                                description: event.description || '',
                                start: event.start.dateTime,
                                end: event.end.dateTime,
                                location: event.location || '',
                                googleEventId: event.id,
                                source: 'google',
                                lastSynced: new Date().toISOString()
                            });
                            synced++;
                        } catch (err) {
                            errors++;
                            console.error(`Error importing Google event:`, err.message);
                        }
                    }
                }
            } catch (err) {
                console.error(`Error fetching Google events for ${user.email}:`, err.message);
            }
        }
        
        // Update last sync time
        await userStore.updateCalendarSync(user.id, {
            ...syncSettings,
            lastSync: new Date().toISOString()
        });
        
        console.log(`✅ Sync voltooid voor ${user.email}: ${synced} events, ${errors} errors`);
        
        return { synced, errors };
        
    } catch (error) {
        console.error(`❌ Sync error voor ${user.email}:`, error.message);
        return { error: error.message };
    }
};

/**
 * Voer achtergrond sync uit voor alle gebruikers
 */
const runBackgroundSync = async () => {
    console.log('🔄 Background sync gestart...');
    
    try {
        // Haal alle gebruikers op met Google auth
        const users = await userStore.getAllUsers();
        const googleUsers = users.filter(u => u.authType === 'google' && u.tokens);
        
        console.log(`📊 ${googleUsers.length} gebruikers met Google auth gevonden`);
        
        let totalSynced = 0;
        let totalErrors = 0;
        let skipped = 0;
        
        for (const user of googleUsers) {
            const result = await syncUserCalendar(user);
            
            if (result.skipped) {
                skipped++;
            } else if (result.error) {
                totalErrors++;
            } else {
                totalSynced += result.synced || 0;
                totalErrors += result.errors || 0;
            }
            
            // Kleine delay om rate limits te voorkomen
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`✅ Background sync voltooid: ${totalSynced} synced, ${skipped} skipped, ${totalErrors} errors`);
        
    } catch (error) {
        console.error('❌ Background sync failed:', error);
    }
};

/**
 * Start de background sync service
 */
const startBackgroundSync = () => {
    console.log('🚀 Background sync service gestart');
    console.log(`⏰ Sync interval: ${SYNC_INTERVAL / 60000} minuten`);
    
    // Eerste sync na 1 minuut (geef server tijd om op te starten)
    setTimeout(() => {
        runBackgroundSync();
    }, 60000);
    
    // Daarna elke SYNC_INTERVAL
    setInterval(() => {
        runBackgroundSync();
    }, SYNC_INTERVAL);
};

module.exports = {
    startBackgroundSync,
    runBackgroundSync,
    syncUserCalendar
};
