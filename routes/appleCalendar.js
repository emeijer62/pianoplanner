/**
 * Apple Calendar (iCloud) Integration via CalDAV
 * 
 * Apple Calendar gebruikt het CalDAV protocol.
 * Gebruikers moeten een app-specifiek wachtwoord aanmaken:
 * 1. Ga naar appleid.apple.com
 * 2. Security → App-Specific Passwords
 * 3. Genereer wachtwoord voor "PianoPlanner"
 */

const express = require('express');
const router = express.Router();
const userStore = require('../utils/userStore');
const fetch = require('node-fetch');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');

// CalDAV endpoints voor iCloud
const ICLOUD_CALDAV_URL = 'https://caldav.icloud.com';
const ICLOUD_PRINCIPAL_URL = 'https://caldav.icloud.com';

// Middleware: check of gebruiker ingelogd is
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }
    next();
};

// Helper: maak Basic Auth header
const getAuthHeader = (appleId, appPassword) => {
    const credentials = Buffer.from(`${appleId}:${appPassword}`).toString('base64');
    return `Basic ${credentials}`;
};

// Helper: XML Parser configuratie
const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true
});

const xmlBuilder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true
});

// ==================== CONNECTION & VALIDATION ====================

/**
 * Test Apple Calendar verbinding
 * POST /api/apple-calendar/connect
 */
router.post('/connect', requireAuth, async (req, res) => {
    try {
        const { appleId, appPassword } = req.body;
        
        if (!appleId || !appPassword) {
            return res.status(400).json({ 
                error: 'Apple ID en app-specifiek wachtwoord zijn verplicht' 
            });
        }
        
        // Valideer email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(appleId)) {
            return res.status(400).json({ 
                error: 'Voer een geldig Apple ID (email) in' 
            });
        }
        
        // Test verbinding met CalDAV principal discovery
        const authHeader = getAuthHeader(appleId, appPassword);
        
        // PROPFIND request om principal te ontdekken
        const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:">
    <D:prop>
        <D:current-user-principal/>
        <D:displayname/>
    </D:prop>
</D:propfind>`;
        
        const response = await fetch(ICLOUD_CALDAV_URL, {
            method: 'PROPFIND',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/xml; charset=utf-8',
                'Depth': '0'
            },
            body: propfindBody
        });
        
        if (response.status === 401) {
            return res.status(401).json({ 
                error: 'Ongeldige inloggegevens',
                hint: 'Controleer je Apple ID en app-specifiek wachtwoord. Je hebt een app-specifiek wachtwoord nodig, niet je normale Apple wachtwoord.'
            });
        }
        
        if (!response.ok) {
            console.error('Apple Calendar connect error:', response.status, await response.text());
            return res.status(500).json({ 
                error: 'Kon geen verbinding maken met Apple Calendar',
                status: response.status
            });
        }
        
        const xmlText = await response.text();
        const parsed = xmlParser.parse(xmlText);
        
        // Haal principal URL op
        let principalUrl = null;
        try {
            const propstat = parsed.multistatus?.response?.propstat;
            if (propstat?.prop?.['current-user-principal']?.href) {
                principalUrl = propstat.prop['current-user-principal'].href;
            }
        } catch (e) {
            console.log('Could not parse principal URL, using default');
        }
        
        // Sla credentials veilig op (encrypted in database)
        const result = await userStore.saveAppleCalendarCredentials(req.session.user.id, {
            appleId,
            appPassword, // TODO: encrypt dit
            principalUrl: principalUrl || `/${appleId}/`,
            connected: true,
            connectedAt: new Date().toISOString()
        });
        
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        
        console.log(`🍎 Apple Calendar connected for user ${req.session.user.email}`);
        
        res.json({ 
            success: true, 
            message: 'Apple Calendar succesvol verbonden!',
            appleId: appleId
        });
        
    } catch (error) {
        console.error('Apple Calendar connect error:', error);
        res.status(500).json({ 
            error: 'Er ging iets mis bij het verbinden',
            details: error.message 
        });
    }
});

/**
 * Verbreek Apple Calendar verbinding
 * POST /api/apple-calendar/disconnect
 */
router.post('/disconnect', requireAuth, async (req, res) => {
    try {
        await userStore.removeAppleCalendarCredentials(req.session.user.id);
        
        console.log(`🍎 Apple Calendar disconnected for user ${req.session.user.email}`);
        
        res.json({ 
            success: true, 
            message: 'Apple Calendar verbinding verbroken' 
        });
    } catch (error) {
        console.error('Apple Calendar disconnect error:', error);
        res.status(500).json({ error: 'Kon verbinding niet verbreken' });
    }
});

/**
 * Check Apple Calendar status
 * GET /api/apple-calendar/status
 */
router.get('/status', requireAuth, async (req, res) => {
    try {
        const credentials = await userStore.getAppleCalendarCredentials(req.session.user.id);
        
        if (!credentials || !credentials.connected) {
            return res.json({ 
                connected: false 
            });
        }
        
        res.json({
            connected: true,
            appleId: credentials.appleId,
            connectedAt: credentials.connectedAt,
            lastSync: credentials.lastSync || null
        });
    } catch (error) {
        console.error('Apple Calendar status error:', error);
        res.status(500).json({ error: 'Kon status niet ophalen' });
    }
});

// ==================== CALENDARS ====================

/**
 * Haal beschikbare calendars op
 * GET /api/apple-calendar/calendars
 */
router.get('/calendars', requireAuth, async (req, res) => {
    try {
        const credentials = await userStore.getAppleCalendarCredentials(req.session.user.id);
        
        console.log('🍎 Apple Calendar credentials:', credentials ? {
            appleId: credentials.appleId,
            principalUrl: credentials.principalUrl,
            connected: credentials.connected
        } : 'none');
        
        if (!credentials || !credentials.connected) {
            return res.status(400).json({ 
                error: 'Apple Calendar niet verbonden' 
            });
        }
        
        if (!credentials.principalUrl) {
            console.error('🍎 Missing principalUrl in credentials');
            return res.status(400).json({ 
                error: 'Apple Calendar configuratie incompleet. Maak opnieuw verbinding.' 
            });
        }
        
        const calendars = await fetchAppleCalendars(credentials);
        console.log('🍎 Found calendars:', calendars.length);
        res.json({ calendars });
        
    } catch (error) {
        console.error('Apple Calendar list error:', error.message, error.stack);
        res.status(500).json({ error: 'Kon calendars niet ophalen: ' + error.message });
    }
});

/**
 * Haal calendars op via CalDAV
 */
async function fetchAppleCalendars(credentials) {
    const authHeader = getAuthHeader(credentials.appleId, credentials.appPassword);
    
    // Eerst de calendar home URL ophalen
    // principalUrl is typically like "/123456789/principal/"
    // We need to build the calendars URL
    let calendarHomeUrl;
    if (credentials.principalUrl.includes('/calendars/')) {
        calendarHomeUrl = `${ICLOUD_CALDAV_URL}${credentials.principalUrl}`;
    } else {
        // Remove trailing slash and "principal" if present, then add "calendars/"
        let baseUrl = credentials.principalUrl.replace(/\/principal\/?$/, '');
        if (!baseUrl.endsWith('/')) baseUrl += '/';
        calendarHomeUrl = `${ICLOUD_CALDAV_URL}${baseUrl}calendars/`;
    }
    
    console.log('🍎 Fetching calendars from:', calendarHomeUrl);
    
    const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/">
    <D:prop>
        <D:displayname/>
        <D:resourcetype/>
        <CS:getctag/>
        <C:calendar-description/>
        <D:sync-token/>
    </D:prop>
</D:propfind>`;
    
    const response = await fetch(calendarHomeUrl, {
        method: 'PROPFIND',
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/xml; charset=utf-8',
            'Depth': '1'
        },
        body: propfindBody
    });
    
    if (!response.ok) {
        throw new Error(`CalDAV error: ${response.status}`);
    }
    
    const xmlText = await response.text();
    console.log('🍎 CalDAV response (first 1000 chars):', xmlText.substring(0, 1000));
    
    const parsed = xmlParser.parse(xmlText);
    console.log('🍎 Parsed structure:', JSON.stringify(parsed, null, 2).substring(0, 2000));
    
    const calendars = [];
    
    // Parse de response - handle different XML structures
    const multistatus = parsed.multistatus || parsed['D:multistatus'] || parsed['d:multistatus'];
    const responses = multistatus?.response || multistatus?.['D:response'] || multistatus?.['d:response'];
    const responseArray = Array.isArray(responses) ? responses : [responses].filter(Boolean);
    
    console.log('🍎 Found', responseArray.length, 'responses in XML');
    
    for (const resp of responseArray) {
        const propstat = resp.propstat || resp['D:propstat'] || resp['d:propstat'];
        if (!propstat) {
            console.log('🍎 No propstat in response:', JSON.stringify(resp).substring(0, 200));
            continue;
        }
        
        // propstat can be an array
        const propstatArray = Array.isArray(propstat) ? propstat : [propstat];
        
        for (const ps of propstatArray) {
            const prop = ps.prop || ps['D:prop'] || ps['d:prop'];
            const resourceType = prop?.resourcetype || prop?.['D:resourcetype'] || prop?.['d:resourcetype'];
            
            console.log('🍎 Checking resourceType:', JSON.stringify(resourceType));
            
            // Check of het een calendar is - multiple possible structures
            const isCalendar = resourceType?.calendar !== undefined || 
                               resourceType?.['C:calendar'] !== undefined ||
                               resourceType?.['cal:calendar'] !== undefined ||
                               (typeof resourceType === 'object' && Object.keys(resourceType).some(k => k.toLowerCase().includes('calendar')));
            
            if (isCalendar) {
                const href = resp.href || resp['D:href'] || resp['d:href'];
                const displayName = prop?.displayname || prop?.['D:displayname'] || prop?.['d:displayname'] || 'Unnamed Calendar';
                const ctag = prop?.getctag || prop?.['CS:getctag'] || prop?.['cs:getctag'];
                
                // Skip de root/home path
                if (href && !href.endsWith('/calendars/')) {
                    console.log('🍎 Found calendar:', displayName, href);
                    calendars.push({
                        id: href,
                        name: displayName,
                        ctag: ctag,
                        url: `${ICLOUD_CALDAV_URL}${href}`
                    });
                }
            }
        }
    }
    
    return calendars;
    
    return calendars;
}

// ==================== EVENTS ====================

/**
 * Haal events op van een calendar
 * GET /api/apple-calendar/events
 */
router.get('/events', requireAuth, async (req, res) => {
    try {
        const credentials = await userStore.getAppleCalendarCredentials(req.session.user.id);
        
        if (!credentials || !credentials.connected) {
            return res.status(400).json({ error: 'Apple Calendar niet verbonden' });
        }
        
        const { calendarUrl, start, end } = req.query;
        
        if (!calendarUrl) {
            return res.status(400).json({ error: 'Calendar URL is verplicht' });
        }
        
        const events = await fetchAppleEvents(credentials, calendarUrl, start, end);
        res.json({ events });
        
    } catch (error) {
        console.error('Apple Calendar events error:', error);
        res.status(500).json({ error: 'Kon events niet ophalen' });
    }
});

/**
 * Haal events op via CalDAV REPORT
 */
async function fetchAppleEvents(credentials, calendarUrl, startDate, endDate) {
    const authHeader = getAuthHeader(credentials.appleId, credentials.appPassword);
    
    // Default: komende 30 dagen
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop>
        <D:getetag/>
        <C:calendar-data/>
    </D:prop>
    <C:filter>
        <C:comp-filter name="VCALENDAR">
            <C:comp-filter name="VEVENT">
                <C:time-range start="${formatICalDate(start)}" end="${formatICalDate(end)}"/>
            </C:comp-filter>
        </C:comp-filter>
    </C:filter>
</C:calendar-query>`;
    
    const response = await fetch(calendarUrl, {
        method: 'REPORT',
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/xml; charset=utf-8',
            'Depth': '1'
        },
        body: reportBody
    });
    
    if (!response.ok) {
        throw new Error(`CalDAV REPORT error: ${response.status}`);
    }
    
    const xmlText = await response.text();
    const parsed = xmlParser.parse(xmlText);
    
    const events = [];
    
    const responses = parsed.multistatus?.response;
    const responseArray = Array.isArray(responses) ? responses : [responses].filter(Boolean);
    
    for (const resp of responseArray) {
        const calendarData = resp.propstat?.prop?.['calendar-data'];
        if (calendarData) {
            const event = parseICalEvent(calendarData, resp.href);
            if (event) {
                events.push(event);
            }
        }
    }
    
    return events.sort((a, b) => new Date(a.start) - new Date(b.start));
}

/**
 * Maak nieuw event aan
 * POST /api/apple-calendar/events
 */
router.post('/events', requireAuth, async (req, res) => {
    try {
        const credentials = await userStore.getAppleCalendarCredentials(req.session.user.id);
        
        if (!credentials || !credentials.connected) {
            return res.status(400).json({ error: 'Apple Calendar niet verbonden' });
        }
        
        const { calendarUrl, summary, description, location, start, end } = req.body;
        
        if (!calendarUrl || !summary || !start || !end) {
            return res.status(400).json({ 
                error: 'Calendar URL, titel, start en eind zijn verplicht' 
            });
        }
        
        const event = await createAppleEvent(credentials, calendarUrl, {
            summary,
            description,
            location,
            start,
            end
        });
        
        console.log(`🍎 Event created in Apple Calendar for user ${req.session.user.email}`);
        res.json({ success: true, event });
        
    } catch (error) {
        console.error('Apple Calendar create event error:', error);
        res.status(500).json({ error: 'Kon event niet aanmaken' });
    }
});

/**
 * Maak event aan via CalDAV PUT
 */
async function createAppleEvent(credentials, calendarUrl, eventData) {
    const authHeader = getAuthHeader(credentials.appleId, credentials.appPassword);
    
    // Genereer unieke UID
    const uid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@pianoplanner.com`;
    
    // Maak iCalendar formaat
    const icalEvent = generateICalEvent({
        uid,
        ...eventData
    });
    
    // Event URL
    const eventUrl = `${calendarUrl}${uid}.ics`;
    
    const response = await fetch(eventUrl, {
        method: 'PUT',
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'text/calendar; charset=utf-8',
            'If-None-Match': '*'  // Alleen aanmaken, niet overschrijven
        },
        body: icalEvent
    });
    
    if (!response.ok && response.status !== 201) {
        throw new Error(`CalDAV PUT error: ${response.status}`);
    }
    
    return {
        id: uid,
        url: eventUrl,
        ...eventData
    };
}

/**
 * Verwijder event
 * DELETE /api/apple-calendar/events/:eventId
 */
router.delete('/events/:eventId', requireAuth, async (req, res) => {
    try {
        const credentials = await userStore.getAppleCalendarCredentials(req.session.user.id);
        
        if (!credentials || !credentials.connected) {
            return res.status(400).json({ error: 'Apple Calendar niet verbonden' });
        }
        
        const { eventId } = req.params;
        const { eventUrl } = req.query;
        
        if (!eventUrl) {
            return res.status(400).json({ error: 'Event URL is verplicht' });
        }
        
        const authHeader = getAuthHeader(credentials.appleId, credentials.appPassword);
        
        const response = await fetch(eventUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': authHeader
            }
        });
        
        if (!response.ok && response.status !== 204) {
            throw new Error(`CalDAV DELETE error: ${response.status}`);
        }
        
        console.log(`🍎 Event deleted from Apple Calendar for user ${req.session.user.email}`);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Apple Calendar delete event error:', error);
        res.status(500).json({ error: 'Kon event niet verwijderen' });
    }
});

// ==================== SYNC ====================

/**
 * Sync instellingen ophalen
 * GET /api/apple-calendar/sync-settings
 */
router.get('/sync-settings', requireAuth, async (req, res) => {
    try {
        const settings = await userStore.getAppleCalendarSync(req.session.user.id);
        res.json({ settings: settings || {} });
    } catch (error) {
        console.error('Error getting Apple sync settings:', error);
        res.status(500).json({ error: 'Kon sync instellingen niet ophalen' });
    }
});

/**
 * Sync instellingen opslaan
 * POST /api/apple-calendar/sync-settings
 */
router.post('/sync-settings', requireAuth, async (req, res) => {
    try {
        const { enabled, syncDirection, appleCalendarUrl } = req.body;
        
        const result = await userStore.updateAppleCalendarSync(req.session.user.id, {
            enabled: enabled,
            syncDirection: syncDirection || 'both',
            appleCalendarUrl: appleCalendarUrl
        });
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        console.log(`🍎 Apple Calendar sync settings updated for user ${req.session.user.email}`);
        res.json({ 
            success: true, 
            settings: await userStore.getAppleCalendarSync(req.session.user.id) 
        });
    } catch (error) {
        console.error('Error updating Apple sync settings:', error);
        res.status(500).json({ error: 'Kon sync instellingen niet opslaan' });
    }
});

/**
 * Voer sync uit
 * POST /api/apple-calendar/sync
 */
router.post('/sync', requireAuth, async (req, res) => {
    try {
        const credentials = await userStore.getAppleCalendarCredentials(req.session.user.id);
        const syncSettings = await userStore.getAppleCalendarSync(req.session.user.id);
        
        if (!credentials?.connected) {
            return res.status(400).json({ error: 'Apple Calendar niet verbonden' });
        }
        
        if (!syncSettings?.enabled) {
            return res.status(400).json({ error: 'Synchronisatie is niet ingeschakeld' });
        }
        
        if (!syncSettings.appleCalendarUrl) {
            return res.status(400).json({ error: 'Geen Apple Calendar geselecteerd' });
        }
        
        const result = await performAppleSync(
            req.session.user.id,
            credentials,
            syncSettings
        );
        
        // Update last sync time
        await userStore.updateAppleCalendarSync(req.session.user.id, {
            ...syncSettings,
            lastSync: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            synced: result.synced,
            errors: result.errors 
        });
        
    } catch (error) {
        console.error('Apple Calendar sync error:', error);
        res.status(500).json({ error: 'Synchronisatie mislukt: ' + error.message });
    }
});

/**
 * Voer de daadwerkelijke sync uit
 */
async function performAppleSync(userId, credentials, syncSettings) {
    const appointmentStore = require('../utils/appointmentStore');
    const direction = syncSettings.syncDirection || 'both';
    
    let synced = 0;
    let errors = [];
    
    // Haal lokale afspraken op
    const localAppointments = await appointmentStore.getAllAppointments(userId);
    
    // Haal Apple events op
    const appleEvents = await fetchAppleEvents(
        credentials, 
        syncSettings.appleCalendarUrl
    );
    
    // Sync TO Apple (local → Apple)
    if (direction === 'both' || direction === 'toApple') {
        for (const appointment of localAppointments) {
            try {
                // Check of al gesynchroniseerd (apple_event_id)
                if (appointment.apple_event_id) continue;
                
                // Maak event in Apple Calendar
                const event = await createAppleEvent(credentials, syncSettings.appleCalendarUrl, {
                    summary: appointment.title || appointment.service_name,
                    description: formatAppointmentDescription(appointment),
                    location: appointment.location || appointment.address,
                    start: appointment.start_time,
                    end: appointment.end_time
                });
                
                // Update lokale afspraak met Apple event ID
                await appointmentStore.updateAppointment(appointment.id, {
                    apple_event_id: event.id,
                    apple_event_url: event.url
                });
                
                synced++;
            } catch (error) {
                errors.push(`Event "${appointment.title}": ${error.message}`);
            }
        }
    }
    
    // Sync FROM Apple (Apple → local)
    if (direction === 'both' || direction === 'fromApple') {
        for (const event of appleEvents) {
            try {
                // Check of al bestaat lokaal
                const existing = localAppointments.find(
                    a => a.apple_event_id === event.id
                );
                if (existing) continue;
                
                // Maak lokale afspraak aan
                await appointmentStore.createAppointment(userId, {
                    title: event.summary,
                    description: event.description,
                    location: event.location,
                    start_time: event.start,
                    end_time: event.end,
                    apple_event_id: event.id,
                    apple_event_url: event.url,
                    source: 'apple_calendar'
                });
                
                synced++;
            } catch (error) {
                errors.push(`Apple event "${event.summary}": ${error.message}`);
            }
        }
    }
    
    console.log(`🍎 Apple sync completed: ${synced} items synced, ${errors.length} errors`);
    
    return { synced, errors };
}

// ==================== HELPERS ====================

/**
 * Formatteer datum naar iCalendar formaat
 */
function formatICalDate(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Genereer iCalendar event
 */
function generateICalEvent({ uid, summary, description, location, start, end }) {
    const dtstart = formatICalDate(new Date(start));
    const dtend = formatICalDate(new Date(end));
    const dtstamp = formatICalDate(new Date());
    
    let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//PianoPlanner//NONSGML v1.0//EN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}
DTSTART:${dtstart}
DTEND:${dtend}
SUMMARY:${escapeICalText(summary)}`;
    
    if (description) {
        ical += `\nDESCRIPTION:${escapeICalText(description)}`;
    }
    
    if (location) {
        ical += `\nLOCATION:${escapeICalText(location)}`;
    }
    
    ical += `\nEND:VEVENT
END:VCALENDAR`;
    
    return ical;
}

/**
 * Escape tekst voor iCalendar
 */
function escapeICalText(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

/**
 * Parse iCalendar event naar object
 */
function parseICalEvent(icalData, href) {
    try {
        const lines = icalData.split(/\r?\n/);
        const event = { url: href };
        
        let currentKey = null;
        let currentValue = '';
        
        for (const line of lines) {
            // Continuation line (starts with space or tab)
            if (line.match(/^[ \t]/)) {
                currentValue += line.substring(1);
                continue;
            }
            
            // Save previous value
            if (currentKey) {
                setEventProperty(event, currentKey, currentValue);
            }
            
            // Parse new line
            const match = line.match(/^([^:;]+)(?:;[^:]*)?:(.*)/);
            if (match) {
                currentKey = match[1];
                currentValue = match[2];
            }
        }
        
        // Save last value
        if (currentKey) {
            setEventProperty(event, currentKey, currentValue);
        }
        
        return event;
    } catch (error) {
        console.error('Error parsing iCal event:', error);
        return null;
    }
}

function setEventProperty(event, key, value) {
    const unescapedValue = value
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
    
    switch (key) {
        case 'UID':
            event.id = unescapedValue;
            break;
        case 'SUMMARY':
            event.summary = unescapedValue;
            break;
        case 'DESCRIPTION':
            event.description = unescapedValue;
            break;
        case 'LOCATION':
            event.location = unescapedValue;
            break;
        case 'DTSTART':
            event.start = parseICalDate(unescapedValue);
            break;
        case 'DTEND':
            event.end = parseICalDate(unescapedValue);
            break;
    }
}

function parseICalDate(dateStr) {
    // Format: 20260107T140000Z of 20260107T140000
    if (dateStr.length >= 15) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        const hour = dateStr.substring(9, 11);
        const minute = dateStr.substring(11, 13);
        const second = dateStr.substring(13, 15);
        
        if (dateStr.endsWith('Z')) {
            return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
        }
        return new Date(year, month - 1, day, hour, minute, second).toISOString();
    }
    
    // Date only format: 20260107
    if (dateStr.length === 8) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        return new Date(year, month - 1, day).toISOString();
    }
    
    return dateStr;
}

function formatAppointmentDescription(appointment) {
    let desc = '';
    
    if (appointment.customer_name) {
        desc += `Klant: ${appointment.customer_name}\n`;
    }
    if (appointment.piano_info) {
        desc += `Piano: ${appointment.piano_info}\n`;
    }
    if (appointment.notes) {
        desc += `\n${appointment.notes}`;
    }
    
    return desc.trim();
}

module.exports = router;
