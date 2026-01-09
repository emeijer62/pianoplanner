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
const { dbRun } = require('../utils/database');
const fetch = require('node-fetch');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const { requireAuth } = require('../middleware/auth');

// Debug logging (set to true for troubleshooting CalDAV issues)
const DEBUG_CALDAV = process.env.DEBUG_CALDAV === 'true';

// CalDAV endpoints voor iCloud
const ICLOUD_CALDAV_URL = 'https://caldav.icloud.com';
const ICLOUD_PRINCIPAL_URL = 'https://caldav.icloud.com';

// SECURITY: Whitelist van toegestane CalDAV hosts (SSRF protection)
const ALLOWED_CALDAV_HOSTS = [
    'caldav.icloud.com',
    'p01-caldav.icloud.com',
    'p02-caldav.icloud.com',
    'p03-caldav.icloud.com',
    'p04-caldav.icloud.com',
    'p05-caldav.icloud.com',
    'p06-caldav.icloud.com',
    'p07-caldav.icloud.com',
    'p08-caldav.icloud.com',
    'p09-caldav.icloud.com',
    'p10-caldav.icloud.com',
    // Voeg meer Apple datacenter hosts toe indien nodig
];

/**
 * Validate CalDAV URL against whitelist (SSRF protection)
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if URL is safe
 */
const isValidCalDAVUrl = (url) => {
    try {
        const parsed = new URL(url);
        // Must be HTTPS
        if (parsed.protocol !== 'https:') {
            console.warn(`⚠️ SSRF blocked: non-HTTPS URL: ${url}`);
            return false;
        }
        // Must be on whitelist
        if (!ALLOWED_CALDAV_HOSTS.includes(parsed.hostname)) {
            console.warn(`⚠️ SSRF blocked: hostname not in whitelist: ${parsed.hostname}`);
            return false;
        }
        // No redirect to internal IPs
        return true;
    } catch (e) {
        console.warn(`⚠️ SSRF blocked: invalid URL: ${url}`);
        return false;
    }
};

// Helper: debug log (only logs when DEBUG_CALDAV is enabled)
const debugLog = (...args) => {
    if (DEBUG_CALDAV) {
        console.log(...args);
    }
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
            debugLog('Could not parse principal URL, using default');
        }
        
        // Sla credentials veilig op (encrypted in database)
        const result = await userStore.saveAppleCalendarCredentials(req.session.user.id, {
            appleId,
            appPassword, // Wordt encrypted in userStore
            principalUrl: principalUrl || `/${appleId}/`,
            connected: true,
            connectedAt: new Date().toISOString()
        });
        
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        
        debugLog(`🍎 Apple Calendar connected for user ${req.session.user.email}`);
        
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
        
        debugLog(`🍎 Apple Calendar disconnected for user ${req.session.user.email}`);
        
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
        
        debugLog('🍎 Apple Calendar credentials:', credentials ? {
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
        debugLog('🍎 Found calendars:', calendars.length);
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
    
    debugLog('🍎 Fetching calendars from:', calendarHomeUrl);
    
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
    debugLog('🍎 CalDAV response (first 1000 chars):', xmlText.substring(0, 1000));
    
    const parsed = xmlParser.parse(xmlText);
    debugLog('🍎 Parsed structure:', JSON.stringify(parsed, null, 2).substring(0, 2000));
    
    const calendars = [];
    
    // Parse de response - handle different XML structures
    const multistatus = parsed.multistatus || parsed['D:multistatus'] || parsed['d:multistatus'];
    const responses = multistatus?.response || multistatus?.['D:response'] || multistatus?.['d:response'];
    const responseArray = Array.isArray(responses) ? responses : [responses].filter(Boolean);
    
    debugLog('🍎 Found', responseArray.length, 'responses in XML');
    
    for (const resp of responseArray) {
        const propstat = resp.propstat || resp['D:propstat'] || resp['d:propstat'];
        if (!propstat) {
            debugLog('🍎 No propstat in response:', JSON.stringify(resp).substring(0, 200));
            continue;
        }
        
        // propstat can be an array
        const propstatArray = Array.isArray(propstat) ? propstat : [propstat];
        
        for (const ps of propstatArray) {
            const prop = ps.prop || ps['D:prop'] || ps['d:prop'];
            const resourceType = prop?.resourcetype || prop?.['D:resourcetype'] || prop?.['d:resourcetype'];
            
            debugLog('🍎 Checking resourceType:', JSON.stringify(resourceType));
            
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
                    debugLog('🍎 Found calendar:', displayName, href);
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
        
        // SECURITY: Validate CalDAV URL against whitelist (SSRF protection)
        if (!isValidCalDAVUrl(calendarUrl)) {
            return res.status(400).json({ error: 'Ongeldige calendar URL' });
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
    // SSRF protection: validate URL before making request
    if (!isValidCalDAVUrl(calendarUrl)) {
        throw new Error('Invalid CalDAV URL');
    }
    
    const authHeader = getAuthHeader(credentials.appleId, credentials.appPassword);
    
    // Default: komende 30 dagen
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    debugLog(`🍎 Fetching events from ${calendarUrl}`);
    debugLog(`🍎 Date range: ${start.toISOString()} to ${end.toISOString()}`);
    
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
    
    debugLog(`🍎 CalDAV REPORT response status: ${response.status}`);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`🍎 CalDAV REPORT error body:`, errorText.substring(0, 500));
        throw new Error(`CalDAV REPORT error: ${response.status}`);
    }
    
    const xmlText = await response.text();
    debugLog(`🍎 CalDAV REPORT response (first 1000 chars):`, xmlText.substring(0, 1000));
    
    const parsed = xmlParser.parse(xmlText);
    
    const events = [];
    
    // Try multiple possible XML structures
    const multistatus = parsed.multistatus || parsed['D:multistatus'] || parsed['d:multistatus'];
    const responses = multistatus?.response || multistatus?.['D:response'] || multistatus?.['d:response'];
    const responseArray = Array.isArray(responses) ? responses : [responses].filter(Boolean);
    
    debugLog(`🍎 Found ${responseArray.length} responses in REPORT`);
    
    for (const resp of responseArray) {
        // Try multiple propstat paths
        const propstat = resp.propstat || resp['D:propstat'] || resp['d:propstat'];
        const propstatArray = Array.isArray(propstat) ? propstat : [propstat].filter(Boolean);
        
        for (const ps of propstatArray) {
            const prop = ps?.prop || ps?.['D:prop'] || ps?.['d:prop'];
            const calendarData = prop?.['calendar-data'] || prop?.['C:calendar-data'] || prop?.['cal:calendar-data'];
            
            if (calendarData) {
                debugLog(`🍎 Found calendar-data, parsing...`);
                const event = parseICalEvent(calendarData, resp.href || resp['D:href'] || resp['d:href']);
                if (event) {
                    debugLog(`🍎 Parsed event: ${event.summary} (${event.start})`);
                    events.push(event);
                }
            }
        }
    }
    
    debugLog(`🍎 Total events found: ${events.length}`);
    
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
        
        // SSRF protection: validate CalDAV URL
        if (!isValidCalDAVUrl(calendarUrl)) {
            return res.status(400).json({ error: 'Ongeldige calendar URL' });
        }
        
        const event = await createAppleEvent(credentials, calendarUrl, {
            summary,
            description,
            location,
            start,
            end
        });
        
        debugLog(`🍎 Event created in Apple Calendar for user ${req.session.user.email}`);
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
    // SSRF protection: validate URL before making request
    if (!isValidCalDAVUrl(calendarUrl)) {
        throw new Error('Invalid CalDAV URL');
    }
    
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
        
        debugLog(`🍎 Event deleted from Apple Calendar for user ${req.session.user.email}`);
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
        
        // SSRF protection: validate CalDAV URL if provided
        if (appleCalendarUrl && !isValidCalDAVUrl(appleCalendarUrl)) {
            return res.status(400).json({ error: 'Ongeldige calendar URL' });
        }
        
        const result = await userStore.updateAppleCalendarSync(req.session.user.id, {
            enabled: enabled,
            syncDirection: syncDirection || 'both',
            appleCalendarUrl: appleCalendarUrl
        });
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        debugLog(`🍎 Apple Calendar sync settings updated for user ${req.session.user.email}`);
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
        
        // SSRF protection: validate stored CalDAV URL
        if (!isValidCalDAVUrl(syncSettings.appleCalendarUrl)) {
            return res.status(400).json({ error: 'Ongeldige calendar URL in instellingen' });
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
    
    console.log(`🍎 Starting Apple sync for user ${userId}`);
    console.log(`🍎 Sync direction: ${direction}`);
    console.log(`🍎 Calendar URL: ${syncSettings.appleCalendarUrl}`);
    
    let synced = 0;
    let errors = [];
    
    // Haal lokale afspraken op
    const localAppointments = await appointmentStore.getAllAppointments(userId);
    console.log(`🍎 Local appointments: ${localAppointments.length}`);
    
    // Haal Apple events op
    const appleEvents = await fetchAppleEvents(
        credentials, 
        syncSettings.appleCalendarUrl
    );
    console.log(`🍎 Apple events fetched: ${appleEvents.length}`);
    
    // Sync TO Apple (local → Apple)
    if (direction === 'both' || direction === 'toApple') {
        const toSync = localAppointments.filter(a => !a.apple_event_id);
        debugLog(`🍎 Local appointments to sync to Apple: ${toSync.length}`);
        
        for (const appointment of toSync) {
            try {
                // Maak event in Apple Calendar
                const event = await createAppleEvent(credentials, syncSettings.appleCalendarUrl, {
                    summary: appointment.title || appointment.serviceName,
                    description: formatAppointmentDescription(appointment),
                    location: appointment.location,
                    start: appointment.start,
                    end: appointment.end
                });
                
                // Update lokale afspraak met Apple event ID
                await appointmentStore.updateAppointment(userId, appointment.id, {
                    apple_event_id: event.id,
                    apple_event_url: event.url
                });
                
                debugLog(`🍎 Synced to Apple: ${appointment.title}`);
                synced++;
            } catch (error) {
                console.error(`🍎 Error syncing to Apple: ${appointment.title}`, error.message);
                errors.push(`Event "${appointment.title}": ${error.message}`);
            }
        }
    }
    
    // Sync FROM Apple (Apple → local)
    if (direction === 'both' || direction === 'fromApple') {
        debugLog(`🍎 Checking ${appleEvents.length} Apple events to sync locally`);
        
        for (const event of appleEvents) {
            try {
                // Check of al bestaat lokaal (by apple_event_id)
                const existingByAppleId = localAppointments.find(
                    a => a.apple_event_id === event.id
                );
                if (existingByAppleId) {
                    debugLog(`🍎 Apple event already exists locally (by ID): ${event.summary}`);
                    continue;
                }
                
                // Extra check: ook op title + start time (deduplicatie)
                const eventStart = new Date(event.start).toISOString();
                const existingByTitleTime = localAppointments.find(a => {
                    const localStart = new Date(a.start).toISOString();
                    return a.title === event.summary && localStart === eventStart;
                });
                if (existingByTitleTime) {
                    debugLog(`🍎 Apple event already exists locally (by title+time): ${event.summary}`);
                    // Update bestaande afspraak met apple_event_id
                    await appointmentStore.updateAppointment(userId, existingByTitleTime.id, {
                        apple_event_id: event.id,
                        apple_event_url: event.url
                    });
                    continue;
                }
                
                debugLog(`🍎 Creating local appointment from Apple: ${event.summary}`);
                debugLog(`🍎 Event data: start=${event.start}, end=${event.end}, id=${event.id}`);
                
                // Maak lokale afspraak aan
                const newAppointment = await appointmentStore.createAppointment(userId, {
                    title: event.summary,
                    description: event.description,
                    location: event.location,
                    start: event.start,
                    end: event.end,
                    apple_event_id: event.id,
                    apple_event_url: event.url,
                    source: 'apple_calendar'
                });
                
                console.log(`🍎 Created appointment: ${newAppointment?.id}, start: ${newAppointment?.start}`);
                synced++;
            } catch (error) {
                console.error(`🍎 Error syncing from Apple: ${event.summary}`, error.message);
                errors.push(`Apple event "${event.summary}": ${error.message}`);
            }
        }
        
        // Check for DELETED events in Apple Calendar
        // (local appointments with apple_event_id that no longer exist in Apple)
        const appleEventIds = new Set(appleEvents.map(e => e.id));
        const appleLinkedAppointments = localAppointments.filter(a => a.apple_event_id);
        let deleted = 0;
        
        for (const appointment of appleLinkedAppointments) {
            if (!appleEventIds.has(appointment.apple_event_id)) {
                // Event was deleted from Apple Calendar
                console.log(`🗑️ Apple event deleted, removing local: ${appointment.title || appointment.id}`);
                try {
                    await dbRun('DELETE FROM appointments WHERE id = ?', [appointment.id]);
                    deleted++;
                } catch (err) {
                    console.error(`Failed to delete appointment ${appointment.id}:`, err.message);
                    errors.push(`Delete "${appointment.title}": ${err.message}`);
                }
            }
        }
        
        if (deleted > 0) {
            console.log(`🗑️ Removed ${deleted} locally deleted Apple events`);
            synced += deleted;
        }
    }
    
    debugLog(`🍎 Apple sync completed: ${synced} items synced, ${errors.length} errors`);
    
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
    
    // Handle keys with parameters like DTSTART;TZID=Europe/Amsterdam
    const baseKey = key.split(';')[0];
    
    // Extract TZID parameter if present
    let tzid = null;
    const tzidMatch = key.match(/TZID=([^;:]+)/);
    if (tzidMatch) {
        tzid = tzidMatch[1];
    }
    
    switch (baseKey) {
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
            event.start = parseICalDate(unescapedValue, tzid);
            break;
        case 'DTEND':
            event.end = parseICalDate(unescapedValue, tzid);
            break;
    }
}

function parseICalDate(dateStr, tzid = null) {
    // Format: 20260107T140000Z (UTC) of 20260107T140000 (local/specified timezone)
    if (dateStr.length >= 15) {
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        const hour = parseInt(dateStr.substring(9, 11));
        const minute = parseInt(dateStr.substring(11, 13));
        const second = parseInt(dateStr.substring(13, 15));
        
        if (dateStr.endsWith('Z')) {
            // UTC time
            return new Date(Date.UTC(year, month, day, hour, minute, second)).toISOString();
        }
        
        // Local time (optionally with TZID)
        // For now, we treat non-UTC times as local times
        // A proper implementation would use Luxon or similar for timezone conversion
        // But for most practical purposes, treating it as local time works
        return new Date(year, month, day, hour, minute, second).toISOString();
    }
    
    // Date only format: 20260107 (all-day event)
    if (dateStr.length === 8) {
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        return new Date(year, month, day).toISOString();
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
