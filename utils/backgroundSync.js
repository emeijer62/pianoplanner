/**
 * Background Calendar Sync Service
 * Synchroniseert automatisch agenda's voor ACTIEVE gebruikers
 * (alleen users die recent ingelogd waren)
 */

const { google } = require('googleapis');
const userStore = require('./userStore');
const appointmentStore = require('./appointmentStore');

// Sync interval: elke 30 minuten (was 15)
const SYNC_INTERVAL = 30 * 60 * 1000;

// Alleen users synchen die in de laatste 24 uur actief waren
const ACTIVE_USER_THRESHOLD = 24 * 60 * 60 * 1000;

// Rate limiting: max requests per user
const RATE_LIMIT_DELAY = 500; // ms between API calls

/**
 * Maak OAuth client voor een gebruiker (zonder sessie)
 * Inclusief automatische token refresh
 */
const createAuthClient = (tokens) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(tokens);
    
    // Auto-refresh tokens wanneer ze verlopen
    oauth2Client.on('tokens', (newTokens) => {
        console.log('🔄 Google tokens refreshed');
        // Tokens worden automatisch bijgewerkt in de client
    });
    
    return oauth2Client;
};

/**
 * Valideer en formatteer een datum voor Google Calendar API
 */
const formatDateTimeForGoogle = (dateValue) => {
    if (!dateValue) return null;
    
    try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return null;
        return date.toISOString();
    } catch (e) {
        return null;
    }
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
                
                // Valideer datums voordat we naar Google sturen
                const startDateTime = formatDateTimeForGoogle(appointment.startTime || appointment.start);
                const endDateTime = formatDateTimeForGoogle(appointment.endTime || appointment.end);
                
                if (!startDateTime || !endDateTime) {
                    console.log(`⏭️ Skip appointment zonder geldige datums: ${appointment.title || appointment.id}`);
                    continue;
                }
                
                try {
                    const event = {
                        summary: appointment.title || appointment.serviceName || 'PianoPlanner Afspraak',
                        description: `Klant: ${appointment.customerName || 'Onbekend'}\n${appointment.notes || ''}`,
                        start: {
                            dateTime: startDateTime,
                            timeZone: 'Europe/Amsterdam'
                        },
                        end: {
                            dateTime: endDateTime,
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
                    
                    // Rate limiting: kleine delay tussen API calls
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                    
                } catch (err) {
                    // Check voor token errors
                    if (err.message?.includes('invalid_grant') || err.message?.includes('Token has been expired')) {
                        console.error(`🔑 Token verlopen voor ${user.email} - markeer voor re-auth`);
                        await userStore.updateUser(user.id, { tokens: null });
                        return { error: 'token_expired', needsReauth: true };
                    }
                    
                    errors++;
                    console.error(`❌ Error syncing event for ${user.email}:`, err.message, 'Appointment:', appointment.title || appointment.id);
                }
            }
        }
        
        // Sync FROM Google (Google → local)
        // BELANGRIJK: Herlaad localAppointments om race condition te voorkomen
        // Dit zorgt ervoor dat we net-gepushte events met hun googleEventId zien
        if (direction === 'both' || direction === 'fromGoogle') {
            // Herlaad lokale afspraken om net-gesynchroniseerde googleEventIds te krijgen
            const refreshedLocalAppointments = await appointmentStore.getAllAppointments(user.id);
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
                    // Skip all-day events of events zonder geldige tijden
                    if (!event.start?.dateTime || !event.end?.dateTime) {
                        console.log(`⏭️ Skip all-day/invalid event: ${event.summary || event.id}`);
                        continue;
                    }
                    
                    // Valideer datums
                    const startDateTime = formatDateTimeForGoogle(event.start.dateTime);
                    const endDateTime = formatDateTimeForGoogle(event.end.dateTime);
                    
                    if (!startDateTime || !endDateTime) {
                        console.log(`⏭️ Skip event met ongeldige datums: ${event.summary || event.id}`);
                        continue;
                    }
                    
                    // Check of dit event al bestaat in lokale database (via googleEventId)
                    const existingByGoogleId = refreshedLocalAppointments.filter(a => a.googleEventId === event.id);
                    
                    // Extra check: ook zoeken op titel + start + end als fallback tegen duplicaten
                    const existingByContent = refreshedLocalAppointments.find(a => 
                        a.title === event.summary && 
                        a.start === startDateTime && 
                        a.end === endDateTime
                    );
                    
                    if (existingByGoogleId.length > 0 || existingByContent) {
                        // Als we een match vinden zonder googleEventId, update deze met de googleEventId
                        if (existingByContent && !existingByContent.googleEventId) {
                            await appointmentStore.updateAppointment(user.id, existingByContent.id, {
                                googleEventId: event.id,
                                lastSynced: new Date().toISOString()
                            });
                            console.log(`🔗 Linked existing appointment to Google event: ${event.summary}`);
                        }
                        continue;
                    }
                    
                    try {
                        await appointmentStore.createAppointment(user.id, {
                            title: event.summary || 'Google Agenda Event',
                            description: event.description || '',
                            start: startDateTime,
                            end: endDateTime,
                            location: event.location || '',
                            googleEventId: event.id,
                            source: 'google',
                            lastSynced: new Date().toISOString()
                        });
                        synced++;
                        
                        // Rate limiting
                        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                        
                    } catch (err) {
                        errors++;
                        console.error(`❌ Error importing Google event:`, err.message, 'Event:', event.summary || event.id);
                    }
                }
            } catch (err) {
                // Check voor token errors
                if (err.message?.includes('invalid_grant') || err.message?.includes('Token has been expired')) {
                    console.error(`🔑 Token verlopen voor ${user.email} - markeer voor re-auth`);
                    await userStore.updateUser(user.id, { tokens: null });
                    return { error: 'token_expired', needsReauth: true };
                }
                
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
                
                // Skip als geen geldige start/end tijd
                const startTime = appointment.start_time || appointment.startTime;
                const endTime = appointment.end_time || appointment.endTime;
                
                if (!startTime || !endTime) {
                    console.warn(`⚠️ Deleting broken appointment ${appointment.id}: missing start/end time`);
                    // Auto-delete broken appointments
                    try {
                        const { dbRun } = require('./database');
                        await dbRun('DELETE FROM appointments WHERE id = ?', [appointment.id]);
                        console.log(`🧹 Deleted broken appointment ${appointment.id}`);
                    } catch (deleteErr) {
                        console.error(`Failed to delete broken appointment ${appointment.id}:`, deleteErr.message);
                    }
                    continue;
                }
                
                // Validate dates are parseable
                const startDate = new Date(startTime);
                const endDate = new Date(endTime);
                
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                    console.warn(`⚠️ Skipping appointment ${appointment.id}: invalid date format (start: ${startTime}, end: ${endTime})`);
                    continue;
                }
                
                try {
                    // Maak event in Apple Calendar via CalDAV
                    const authHeader = Buffer.from(`${credentials.appleId}:${credentials.appPassword}`).toString('base64');
                    const uid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@pianoplanner.com`;
                    
                    // Format dates voor iCalendar
                    const formatICalDate = (date) => {
                        return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
                    };
                    
                    const dtstart = formatICalDate(startTime);
                    const dtend = formatICalDate(endTime);
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
        
        // Sync FROM Apple - Check for deleted events
        if (direction === 'both' || direction === 'fromApple') {
            // Get all local appointments that have apple_event_id
            const appleLinkedAppointments = localAppointments.filter(a => a.apple_event_id);
            
            if (appleLinkedAppointments.length > 0) {
                console.log(`🔍 Checking ${appleLinkedAppointments.length} Apple-linked appointments...`);
                
                const authHeader = Buffer.from(`${credentials.appleId}:${credentials.appPassword}`).toString('base64');
                const fetch = require('node-fetch');
                let deleted = 0;
                
                for (const appointment of appleLinkedAppointments) {
                    try {
                        // Check if event still exists in Apple Calendar
                        const eventUrl = appointment.apple_event_url || 
                            `${syncSettings.appleCalendarUrl}${appointment.apple_event_id}.ics`;
                        
                        const response = await fetch(eventUrl, {
                            method: 'HEAD',
                            headers: {
                                'Authorization': `Basic ${authHeader}`
                            }
                        });
                        
                        // If 404 - event was deleted from Apple Calendar
                        if (response.status === 404) {
                            console.log(`🗑️ Apple event deleted, removing local: ${appointment.title || appointment.id}`);
                            
                            const { dbRun } = require('./database');
                            await dbRun('DELETE FROM appointments WHERE id = ?', [appointment.id]);
                            deleted++;
                        }
                        
                        // Small delay to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 200));
                        
                    } catch (err) {
                        // Don't count connection errors as failures
                        if (!err.message?.includes('ECONNREFUSED')) {
                            console.error(`Error checking Apple event ${appointment.apple_event_id}:`, err.message);
                        }
                    }
                }
                
                if (deleted > 0) {
                    console.log(`🗑️ Removed ${deleted} locally deleted Apple events`);
                    synced += deleted;
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
 * Voer achtergrond sync uit voor ACTIEVE gebruikers
 * (alleen users die recent ingelogd waren)
 */
const runBackgroundSync = async () => {
    console.log('🔄 Background sync gestart...');
    
    try {
        // Haal alle gebruikers op
        const allUsers = await userStore.getAllUsers();
        
        // Filter alleen actieve gebruikers (laatst ingelogd < 24 uur)
        const now = Date.now();
        const activeUsers = allUsers.filter(u => {
            if (!u.lastLogin && !u.createdAt) return false;
            const lastActivity = new Date(u.lastLogin || u.createdAt).getTime();
            const isActive = (now - lastActivity) < ACTIVE_USER_THRESHOLD;
            return isActive;
        });
        
        console.log(`📊 ${activeUsers.length} van ${allUsers.length} gebruikers zijn actief (laatste 24 uur)`);
        
        if (activeUsers.length === 0) {
            console.log('ℹ️ Geen actieve gebruikers, sync overgeslagen');
            return;
        }
        
        // Google Calendar sync - alleen actieve users
        const googleUsers = activeUsers.filter(u => u.authType === 'google' && u.tokens);
        console.log(`📊 ${googleUsers.length} actieve gebruikers met Google auth`);
        
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
        
        // Apple Calendar sync - alleen actieve users
        const appleUsers = activeUsers.filter(u => u.appleCalendarSync);
        console.log(`📊 ${appleUsers.length} actieve gebruikers met Apple Calendar`);
        
        let appleSynced = 0;
        let appleErrors = 0;
        let appleSkipped = 0;
        
        for (const user of appleUsers) {
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
    console.log(`👥 Alleen actieve gebruikers (laatste ${ACTIVE_USER_THRESHOLD / 3600000} uur)`);
    
    // Eerste sync na 2 minuten (geef server tijd om op te starten)
    setTimeout(() => {
        runBackgroundSync();
    }, 120000);
    
    // Daarna elke SYNC_INTERVAL
    setInterval(() => {
        runBackgroundSync();
    }, SYNC_INTERVAL);
};

// ==================== REAL-TIME SYNC ====================
/**
 * Push een enkele afspraak DIRECT naar externe calendars
 * Wordt aangeroepen bij CREATE/UPDATE/DELETE van appointments
 * @param {string} userId - De user ID
 * @param {object} appointment - De afspraak data
 * @param {string} action - 'create', 'update', of 'delete'
 * @returns {Promise<object>} - Resultaat met googleEventId etc.
 */
const pushAppointmentToCalendars = async (userId, appointment, action = 'create') => {
    const results = {
        google: null,
        apple: null,
        microsoft: null,
        errors: []
    };
    
    try {
        // Haal user op met tokens en sync settings
        const user = await userStore.getUser(userId, { includeTokens: true });
        if (!user) {
            console.log(`⚠️ [PUSH SYNC] User ${userId} niet gevonden`);
            return results;
        }
        
        // Google Calendar sync
        const syncSettings = await userStore.getCalendarSync(userId);
        if (syncSettings?.enabled && user.tokens?.refresh_token) {
            try {
                const googleResult = await pushToGoogleCalendar(user, syncSettings, appointment, action);
                results.google = googleResult;
                console.log(`✅ [PUSH SYNC] Google: ${action} "${appointment.title}" - eventId: ${googleResult?.eventId || 'N/A'}`);
            } catch (err) {
                results.errors.push({ platform: 'google', error: err.message });
                console.error(`❌ [PUSH SYNC] Google error:`, err.message);
            }
        }
        
        // Apple Calendar sync (CalDAV)
        const appleCalSettings = await userStore.getAppleCalendarSettings(userId);
        if (appleCalSettings?.enabled && appleCalSettings?.appleId && appleCalSettings?.appPassword) {
            try {
                const appleResult = await pushToAppleCalendar(appleCalSettings, appointment, action);
                results.apple = appleResult;
                console.log(`✅ [PUSH SYNC] Apple: ${action} "${appointment.title}"`);
            } catch (err) {
                results.errors.push({ platform: 'apple', error: err.message });
                console.error(`❌ [PUSH SYNC] Apple error:`, err.message);
            }
        }
        
        // Microsoft Calendar sync
        const microsoftSettings = await userStore.getMicrosoftCalendarSettings?.(userId);
        if (microsoftSettings?.enabled && microsoftSettings?.accessToken) {
            try {
                const msResult = await pushToMicrosoftCalendar(microsoftSettings, appointment, action);
                results.microsoft = msResult;
                console.log(`✅ [PUSH SYNC] Microsoft: ${action} "${appointment.title}"`);
            } catch (err) {
                results.errors.push({ platform: 'microsoft', error: err.message });
                console.error(`❌ [PUSH SYNC] Microsoft error:`, err.message);
            }
        }
        
    } catch (err) {
        console.error(`❌ [PUSH SYNC] General error:`, err);
        results.errors.push({ platform: 'general', error: err.message });
    }
    
    return results;
};

/**
 * Push naar Google Calendar
 */
const pushToGoogleCalendar = async (user, syncSettings, appointment, action) => {
    const auth = createAuthClient(user.tokens);
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = syncSettings.googleCalendarId || 'primary';
    
    // Valideer datums
    const startDateTime = formatDateTimeForGoogle(appointment.start || appointment.startTime);
    const endDateTime = formatDateTimeForGoogle(appointment.end || appointment.endTime);
    
    if (!startDateTime || !endDateTime) {
        throw new Error('Ongeldige start of eind datum');
    }
    
    const event = {
        summary: appointment.title || appointment.serviceName || 'PianoPlanner Afspraak',
        description: `Klant: ${appointment.customerName || 'Onbekend'}\n${appointment.description || appointment.notes || ''}`,
        start: {
            dateTime: startDateTime,
            timeZone: 'Europe/Amsterdam'
        },
        end: {
            dateTime: endDateTime,
            timeZone: 'Europe/Amsterdam'
        },
        location: appointment.location || appointment.address || ''
    };
    
    if (action === 'create') {
        const response = await calendar.events.insert({
            calendarId: calendarId,
            resource: event
        });
        return { eventId: response.data.id, action: 'created' };
        
    } else if (action === 'update' && appointment.googleEventId) {
        const response = await calendar.events.update({
            calendarId: calendarId,
            eventId: appointment.googleEventId,
            resource: event
        });
        return { eventId: response.data.id, action: 'updated' };
        
    } else if (action === 'delete' && appointment.googleEventId) {
        await calendar.events.delete({
            calendarId: calendarId,
            eventId: appointment.googleEventId
        });
        return { eventId: appointment.googleEventId, action: 'deleted' };
    }
    
    return null;
};

/**
 * Push naar Apple Calendar (CalDAV)
 */
const pushToAppleCalendar = async (settings, appointment, action) => {
    const https = require('https');
    
    // Genereer unieke UID voor het event
    const eventUid = appointment.appleEventId || `pianoplanner-${appointment.id}@pianoplanner.nl`;
    
    // Valideer datums
    const startDate = new Date(appointment.start || appointment.startTime);
    const endDate = new Date(appointment.end || appointment.endTime);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Ongeldige start of eind datum');
    }
    
    // Format voor iCalendar (YYYYMMDDTHHMMSSZ)
    const formatICalDate = (date) => {
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };
    
    // Bouw iCalendar event
    const icalEvent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//PianoPlanner//EN',
        'BEGIN:VEVENT',
        `UID:${eventUid}`,
        `DTSTAMP:${formatICalDate(new Date())}`,
        `DTSTART:${formatICalDate(startDate)}`,
        `DTEND:${formatICalDate(endDate)}`,
        `SUMMARY:${(appointment.title || 'PianoPlanner Afspraak').replace(/[,;\\]/g, ' ')}`,
        appointment.location ? `LOCATION:${appointment.location.replace(/[,;\\]/g, ' ')}` : '',
        appointment.description ? `DESCRIPTION:${appointment.description.replace(/[,;\\]/g, ' ').replace(/\n/g, '\\n')}` : '',
        'END:VEVENT',
        'END:VCALENDAR'
    ].filter(Boolean).join('\r\n');
    
    // CalDAV URL
    const calendarUrl = settings.calendarUrl || 
        `https://caldav.icloud.com/${settings.appleId}/calendars/${settings.selectedCalendar || 'home'}/`;
    const eventUrl = `${calendarUrl}${eventUid}.ics`;
    
    const authHeader = Buffer.from(`${settings.appleId}:${settings.appPassword}`).toString('base64');
    
    return new Promise((resolve, reject) => {
        const url = new URL(eventUrl);
        
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: action === 'delete' ? 'DELETE' : 'PUT',
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Length': Buffer.byteLength(icalEvent)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ eventId: eventUid, action: action === 'delete' ? 'deleted' : 'synced' });
                } else {
                    reject(new Error(`CalDAV error: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        
        if (action !== 'delete') {
            req.write(icalEvent);
        }
        req.end();
    });
};

/**
 * Push naar Microsoft Calendar (Graph API)
 */
const pushToMicrosoftCalendar = async (settings, appointment, action) => {
    const https = require('https');
    
    // Valideer datums
    const startDate = new Date(appointment.start || appointment.startTime);
    const endDate = new Date(appointment.end || appointment.endTime);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Ongeldige start of eind datum');
    }
    
    const calendarId = settings.selectedCalendar || 'me/calendar';
    
    const event = {
        subject: appointment.title || 'PianoPlanner Afspraak',
        body: {
            contentType: 'Text',
            content: `Klant: ${appointment.customerName || 'Onbekend'}\n${appointment.description || ''}`
        },
        start: {
            dateTime: startDate.toISOString(),
            timeZone: 'Europe/Amsterdam'
        },
        end: {
            dateTime: endDate.toISOString(),
            timeZone: 'Europe/Amsterdam'
        },
        location: {
            displayName: appointment.location || ''
        }
    };
    
    return new Promise((resolve, reject) => {
        let path, method;
        
        if (action === 'create') {
            path = `/v1.0/${calendarId}/events`;
            method = 'POST';
        } else if (action === 'update' && appointment.microsoftEventId) {
            path = `/v1.0/me/events/${appointment.microsoftEventId}`;
            method = 'PATCH';
        } else if (action === 'delete' && appointment.microsoftEventId) {
            path = `/v1.0/me/events/${appointment.microsoftEventId}`;
            method = 'DELETE';
        } else {
            return resolve(null);
        }
        
        const postData = action === 'delete' ? '' : JSON.stringify(event);
        
        const options = {
            hostname: 'graph.microsoft.com',
            port: 443,
            path: path,
            method: method,
            headers: {
                'Authorization': `Bearer ${settings.accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const result = data ? JSON.parse(data) : {};
                        resolve({ eventId: result.id || appointment.microsoftEventId, action });
                    } catch {
                        resolve({ action });
                    }
                } else {
                    reject(new Error(`Microsoft Graph error: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        
        if (action !== 'delete') {
            req.write(postData);
        }
        req.end();
    });
};

module.exports = {
    startBackgroundSync,
    runBackgroundSync,
    syncUserCalendar,
    syncUserAppleCalendar,
    // Real-time sync exports
    pushAppointmentToCalendars,
    pushToGoogleCalendar,
    pushToAppleCalendar,
    pushToMicrosoftCalendar
};
