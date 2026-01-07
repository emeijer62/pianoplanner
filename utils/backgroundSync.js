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
                    console.error(`❌ Error syncing event for ${user.email}:`, err.message, 'Appointment:', appointment.title || appointment.id);
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
                            console.error(`❌ Error importing Google event:`, err.message, 'Event:', event.summary || event.id);
                        }
                    }
                }
            } catch (err) {
                errors++;
                console.error(`❌ Error fetching Google events for ${user.email}:`, err.message);
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
 * Sync Apple Calendar voor een gebruiker
 */
const syncUserAppleCalendar = async (user) => {
    try {
        // Check of user Apple credentials heeft
        const credentials = await userStore.getAppleCalendarCredentials(user.id);
        if (!credentials?.connected) {
            return { skipped: true, reason: 'apple_not_connected' };
        }
        
        // Check sync instellingen
        const syncSettings = await userStore.getAppleCalendarSync(user.id);
        if (!syncSettings?.enabled || !syncSettings.appleCalendarUrl) {
            return { skipped: true, reason: 'apple_sync_disabled' };
        }
        
        console.log(`🍎 Start Apple sync voor ${user.email}...`);
        
        // Import Apple Calendar route functions
        const appleCalendarRoute = require('../routes/appleCalendar');
        
        let synced = 0;
        let errors = 0;
        
        // Haal lokale afspraken op
        const localAppointments = await appointmentStore.getAllAppointments(user.id);
        
        const direction = syncSettings.syncDirection || 'both';
        
        // Sync TO Apple (local → Apple)
        if (direction === 'both' || direction === 'toApple') {
            for (const appointment of localAppointments) {
                // Skip als al gesynchroniseerd
                if (appointment.apple_event_id) continue;
                
                try {
                    // Maak event in Apple Calendar via CalDAV
                    const authHeader = Buffer.from(`${credentials.appleId}:${credentials.appPassword}`).toString('base64');
                    const uid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@pianoplanner.com`;
                    
                    // Format dates voor iCalendar
                    const formatICalDate = (date) => {
                        return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
                    };
                    
                    const dtstart = formatICalDate(appointment.start_time || appointment.startTime);
                    const dtend = formatICalDate(appointment.end_time || appointment.endTime);
                    const dtstamp = formatICalDate(new Date());
                    
                    const icalEvent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//PianoPlanner//NONSGML v1.0//EN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}
DTSTART:${dtstart}
DTEND:${dtend}
SUMMARY:${(appointment.title || appointment.service_name || 'PianoPlanner').replace(/[\\;,]/g, ' ')}
DESCRIPTION:Klant: ${(appointment.customer_name || 'Onbekend').replace(/[\\;,\n]/g, ' ')}
LOCATION:${(appointment.address || appointment.location || '').replace(/[\\;,]/g, ' ')}
END:VEVENT
END:VCALENDAR`;
                    
                    const eventUrl = `${syncSettings.appleCalendarUrl}${uid}.ics`;
                    
                    const fetch = require('node-fetch');
                    const response = await fetch(eventUrl, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Basic ${authHeader}`,
                            'Content-Type': 'text/calendar; charset=utf-8',
                            'If-None-Match': '*'
                        },
                        body: icalEvent
                    });
                    
                    if (response.ok || response.status === 201) {
                        // Update lokale afspraak met Apple event ID
                        await appointmentStore.updateAppointment(appointment.id, {
                            apple_event_id: uid,
                            apple_event_url: eventUrl
                        });
                        synced++;
                    } else {
                        errors++;
                    }
                    
                } catch (err) {
                    console.error(`Apple sync error voor appointment ${appointment.id}:`, err.message);
                    errors++;
                }
            }
        }
        
        // Update last sync time
        await userStore.updateAppleCalendarSync(user.id, {
            ...syncSettings,
            lastSync: new Date().toISOString()
        });
        
        console.log(`🍎 Apple sync voltooid voor ${user.email}: ${synced} events, ${errors} errors`);
        
        return { synced, errors };
        
    } catch (error) {
        console.error(`❌ Apple sync error voor ${user.email}:`, error.message);
        return { error: error.message };
    }
};

/**
 * Voer achtergrond sync uit voor alle gebruikers
 */
const runBackgroundSync = async () => {
    console.log('🔄 Background sync gestart...');
    
    try {
        // Haal alle gebruikers op
        const users = await userStore.getAllUsers();
        
        // Google Calendar sync
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
        
        console.log(`✅ Google sync voltooid: ${totalSynced} synced, ${skipped} skipped, ${totalErrors} errors`);
        
        // Apple Calendar sync
        let appleSynced = 0;
        let appleErrors = 0;
        let appleSkipped = 0;
        
        for (const user of users) {
            const result = await syncUserAppleCalendar(user);
            
            if (result.skipped) {
                appleSkipped++;
            } else if (result.error) {
                appleErrors++;
            } else {
                appleSynced += result.synced || 0;
                appleErrors += result.errors || 0;
            }
            
            // Kleine delay
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (appleSynced > 0 || appleErrors > 0) {
            console.log(`🍎 Apple sync voltooid: ${appleSynced} synced, ${appleSkipped} skipped, ${appleErrors} errors`);
        }
        
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
    syncUserCalendar,
    syncUserAppleCalendar
};
