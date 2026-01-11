const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');
const { calculateTravelTime, findFirstAvailableSlot, findAllAvailableSlots, getPlaceAutocomplete, getPlaceDetails, geocodeAddress } = require('../utils/travelTime');
const serviceStore = require('../utils/serviceStore');
const customerStore = require('../utils/customerStore');
const companyStore = require('../utils/companyStore');
const userStore = require('../utils/userStore');
const { requireAuth } = require('../middleware/auth');

// Alle routes vereisen authenticatie
router.use(requireAuth);

// XML Parser voor Apple Calendar
const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true
});

// Helper: maak OAuth2 client met tokens uit database of sessie (voor Google)
const getGoogleAuthClient = async (req) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    
    // Probeer tokens uit sessie, anders uit database
    let tokens = req.session.tokens;
    
    if (!tokens) {
        // Haal tokens uit database
        const user = await userStore.getUser(req.session.user.id);
        if (user && user.tokens) {
            try {
                tokens = typeof user.tokens === 'string' ? JSON.parse(user.tokens) : user.tokens;
                // Cache in sessie voor volgende keer
                req.session.tokens = tokens;
            } catch (e) {
                console.error('Error parsing user tokens:', e);
            }
        }
    }
    
    if (!tokens || !tokens.access_token) {
        return null; // Return null instead of throwing - we might have Apple Calendar
    }
    
    oauth2Client.setCredentials(tokens);
    
    // Auto-refresh tokens
    oauth2Client.on('tokens', async (newTokens) => {
        console.log(`🔄 Google tokens refreshed voor ${req.session.user.email}`);
        req.session.tokens = { ...tokens, ...newTokens };
        
        try {
            const user = await userStore.getUser(req.session.user.id);
            if (user) {
                await userStore.saveUser({
                    ...user,
                    tokens: JSON.stringify({ ...tokens, ...newTokens })
                });
            }
        } catch (error) {
            console.error('Error saving refreshed tokens:', error);
        }
    });
    
    return oauth2Client;
};

// Helper: haal events op van Google Calendar
const getGoogleCalendarEvents = async (auth, dayStart, dayEnd) => {
    const calendar = google.calendar({ version: 'v3', auth });
    
    const eventsResponse = await calendar.events.list({
        calendarId: 'primary',
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
    });
    
    return (eventsResponse.data.items || []).map(event => ({
        id: event.id,
        summary: event.summary,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date
    }));
};

// Helper: haal events op van Apple Calendar
const getAppleCalendarEvents = async (credentials, calendarUrl, dayStart, dayEnd) => {
    const authHeader = Buffer.from(`${credentials.appleId}:${credentials.appPassword}`).toString('base64');
    
    const formatICalDate = (date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop>
        <D:getetag/>
        <C:calendar-data/>
    </D:prop>
    <C:filter>
        <C:comp-filter name="VCALENDAR">
            <C:comp-filter name="VEVENT">
                <C:time-range start="${formatICalDate(dayStart)}" end="${formatICalDate(dayEnd)}"/>
            </C:comp-filter>
        </C:comp-filter>
    </C:filter>
</C:calendar-query>`;
    
    const response = await fetch(calendarUrl, {
        method: 'REPORT',
        headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/xml; charset=utf-8',
            'Depth': '1'
        },
        body: reportBody
    });
    
    if (!response.ok) {
        console.error(`🍎 CalDAV REPORT error: ${response.status}`);
        return [];
    }
    
    const xmlText = await response.text();
    const parsed = xmlParser.parse(xmlText);
    
    const events = [];
    const multistatus = parsed.multistatus || parsed['D:multistatus'] || parsed['d:multistatus'];
    const responses = multistatus?.response || multistatus?.['D:response'] || multistatus?.['d:response'];
    const responseArray = Array.isArray(responses) ? responses : [responses].filter(Boolean);
    
    for (const resp of responseArray) {
        const propstat = resp.propstat || resp['D:propstat'] || resp['d:propstat'];
        const propstatArray = Array.isArray(propstat) ? propstat : [propstat].filter(Boolean);
        
        for (const ps of propstatArray) {
            const prop = ps?.prop || ps?.['D:prop'] || ps?.['d:prop'];
            const calendarData = prop?.['calendar-data'] || prop?.['C:calendar-data'] || prop?.['cal:calendar-data'];
            
            if (calendarData && typeof calendarData === 'string') {
                // Parse iCal data
                const summaryMatch = calendarData.match(/SUMMARY:(.+)/);
                const dtStartMatch = calendarData.match(/DTSTART[^:]*:(\d{8}T?\d{0,6}Z?)/);
                const dtEndMatch = calendarData.match(/DTEND[^:]*:(\d{8}T?\d{0,6}Z?)/);
                const uidMatch = calendarData.match(/UID:(.+)/);
                
                if (dtStartMatch) {
                    const parseICalDate = (icalDate) => {
                        if (!icalDate) return null;
                        // Format: 20260109T090000Z or 20260109
                        if (icalDate.length === 8) {
                            return new Date(icalDate.slice(0,4) + '-' + icalDate.slice(4,6) + '-' + icalDate.slice(6,8));
                        }
                        const year = icalDate.slice(0,4);
                        const month = icalDate.slice(4,6);
                        const day = icalDate.slice(6,8);
                        const hour = icalDate.slice(9,11) || '00';
                        const min = icalDate.slice(11,13) || '00';
                        const sec = icalDate.slice(13,15) || '00';
                        return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
                    };
                    
                    events.push({
                        id: uidMatch ? uidMatch[1].trim() : 'unknown',
                        summary: summaryMatch ? summaryMatch[1].trim() : 'Untitled',
                        start: parseICalDate(dtStartMatch[1])?.toISOString(),
                        end: parseICalDate(dtEndMatch?.[1])?.toISOString()
                    });
                }
            }
        }
    }
    
    return events;
};

// Helper: haal events op van Microsoft Calendar
const getMicrosoftCalendarEvents = async (accessToken, dayStart, dayEnd) => {
    const GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';
    
    const url = new URL(`${GRAPH_API_URL}/me/calendar/events`);
    url.searchParams.set('$filter', `start/dateTime ge '${dayStart.toISOString()}' and end/dateTime le '${dayEnd.toISOString()}'`);
    url.searchParams.set('$orderby', 'start/dateTime');
    url.searchParams.set('$top', '50');
    
    const response = await fetch(url.toString(), {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Prefer': 'outlook.timezone="Europe/Amsterdam"'
        }
    });
    
    const data = await response.json();
    
    if (data.error) {
        console.error('[SMART] Microsoft events error:', data.error);
        return [];
    }
    
    return (data.value || []).map(event => ({
        id: event.id,
        summary: event.subject,
        start: event.start?.dateTime,
        end: event.end?.dateTime
    }));
};

// Helper: bepaal kalender type en haal events op
const getCalendarEvents = async (req, dayStart, dayEnd) => {
    const userId = req.session.user.id;
    
    // Check Google Calendar first
    const googleAuth = await getGoogleAuthClient(req);
    if (googleAuth) {
        console.log('[SMART] Using Google Calendar');
        return await getGoogleCalendarEvents(googleAuth, dayStart, dayEnd);
    }
    
    // Check Microsoft Calendar
    const microsoftCredentials = await userStore.getMicrosoftCalendarCredentials(userId);
    if (microsoftCredentials && microsoftCredentials.connected && microsoftCredentials.accessToken) {
        console.log('[SMART] Using Microsoft Calendar');
        // Check if token needs refresh
        if (microsoftCredentials.expiresAt && microsoftCredentials.expiresAt < Date.now() + 300000) {
            console.log('[SMART] Microsoft token expired, skipping (needs refresh via route)');
        } else {
            return await getMicrosoftCalendarEvents(microsoftCredentials.accessToken, dayStart, dayEnd);
        }
    }
    
    // Check Apple Calendar
    const appleCredentials = await userStore.getAppleCalendarCredentials(userId);
    const appleSync = await userStore.getAppleCalendarSync(userId);
    
    if (appleCredentials && appleSync?.enabled && appleSync?.appleCalendarUrl) {
        console.log('[SMART] Using Apple Calendar');
        return await getAppleCalendarEvents(appleCredentials, appleSync.appleCalendarUrl, dayStart, dayEnd);
    }
    
    // No calendar connected
    console.log('[SMART] No calendar connected - returning empty events');
    return [];
};

// Helper: maak event aan in Apple Calendar
const createAppleCalendarEvent = async (credentials, calendarUrl, eventData) => {
    const authHeader = Buffer.from(`${credentials.appleId}:${credentials.appPassword}`).toString('base64');
    
    const uid = `pianoplanner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const eventUrl = `${calendarUrl}${uid}.ics`;
    
    const formatICalDateTime = (date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//PianoPlanner//EN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatICalDateTime(new Date())}
DTSTART:${formatICalDateTime(eventData.start)}
DTEND:${formatICalDateTime(eventData.end)}
SUMMARY:${eventData.summary}
DESCRIPTION:${(eventData.description || '').replace(/\n/g, '\\n')}
LOCATION:${eventData.location || ''}
END:VEVENT
END:VCALENDAR`;
    
    const response = await fetch(eventUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'text/calendar; charset=utf-8'
        },
        body: icalData
    });
    
    if (!response.ok && response.status !== 201 && response.status !== 204) {
        console.error(`🍎 Apple Calendar create event error: ${response.status}`);
        throw new Error(`Failed to create Apple Calendar event: ${response.status}`);
    }
    
    return {
        id: uid,
        summary: eventData.summary,
        start: eventData.start.toISOString(),
        end: eventData.end.toISOString(),
        location: eventData.location
    };
};

// Helper: maak event aan in Microsoft Calendar
const createMicrosoftCalendarEvent = async (accessToken, eventData) => {
    const GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';
    
    const event = {
        subject: eventData.summary,
        body: {
            contentType: 'text',
            content: eventData.description || ''
        },
        start: {
            dateTime: eventData.start.toISOString(),
            timeZone: 'Europe/Amsterdam'
        },
        end: {
            dateTime: eventData.end.toISOString(),
            timeZone: 'Europe/Amsterdam'
        }
    };
    
    if (eventData.location) {
        event.location = { displayName: eventData.location };
    }
    
    const response = await fetch(`${GRAPH_API_URL}/me/calendar/events`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
    });
    
    const data = await response.json();
    
    if (data.error) {
        console.error('🔵 Microsoft create event error:', data.error);
        throw new Error(`Failed to create Microsoft Calendar event: ${data.error.message}`);
    }
    
    return {
        id: data.id,
        summary: data.subject,
        start: data.start?.dateTime,
        end: data.end?.dateTime,
        location: data.location?.displayName
    };
};

/**
 * Autocomplete voor adressen (gefilterd op land + buurlanden)
 * GET /api/booking/address-autocomplete
 */
router.get('/address-autocomplete', async (req, res) => {
    try {
        const { input, sessionToken, includeNeighbors } = req.query;
        
        if (!input || input.length < 3) {
            return res.json({ predictions: [] });
        }
        
        // Haal het land van de gebruiker op uit company settings
        let userCountry = 'NL'; // Default
        try {
            const companySettings = await companyStore.getCompanySettings(req.session.userId);
            if (companySettings?.address?.country) {
                userCountry = companySettings.address.country;
            }
        } catch (e) {
            // Gebruik default bij fout
        }
        
        const predictions = await getPlaceAutocomplete(
            input, 
            sessionToken, 
            userCountry, 
            includeNeighbors !== 'false' // Default true
        );
        res.json({ predictions });
    } catch (error) {
        console.error('Autocomplete error:', error);
        res.json({ predictions: [] });
    }
});

/**
 * Haal place details op via place_id
 * GET /api/booking/place-details/:placeId of ?placeId=...
 */
router.get('/place-details/:placeId?', async (req, res) => {
    try {
        // Ondersteun beide URL param en query string
        const placeId = req.params.placeId || req.query.placeId;
        
        if (!placeId) {
            return res.status(400).json({ error: 'Place ID is verplicht' });
        }
        
        let details = await getPlaceDetails(placeId);
        
        // Transformeer naar address formaat voor frontend compatibiliteit
        let address = details.components || {};
        
        // If postal code is missing, try geocoding the formatted address
        if (!address.postalCode && details.formattedAddress) {
            try {
                const geocodeResult = await geocodeAddress(details.formattedAddress);
                if (geocodeResult && geocodeResult.components) {
                    // Merge geocode results - prioritize original but fill in missing
                    if (geocodeResult.components.postalCode && !address.postalCode) {
                        address.postalCode = geocodeResult.components.postalCode;
                    }
                    if (geocodeResult.components.city && !address.city) {
                        address.city = geocodeResult.components.city;
                    }
                    if (geocodeResult.components.street && !address.street) {
                        address.street = geocodeResult.components.street;
                    }
                    if (geocodeResult.components.streetNumber && !address.streetNumber) {
                        address.streetNumber = geocodeResult.components.streetNumber;
                    }
                }
            } catch (geocodeErr) {
                console.error('📍 Geocode fallback failed:', geocodeErr.message);
            }
        }
        
        // Combineer straat en huisnummer
        let street = address.street || '';
        if (address.streetNumber) {
            street = street ? `${street} ${address.streetNumber}` : address.streetNumber;
        }
        
        const response = {
            formattedAddress: details.formattedAddress,
            lat: details.lat,
            lng: details.lng,
            address: {
                street: street,
                postalCode: address.postalCode || '',
                city: address.city || '',
                country: address.country || 'Nederland'
            },
            components: address // Updated components with fallback data
        };
        
        res.json(response);
    } catch (error) {
        console.error('Place details error:', error);
        res.status(404).json({ error: 'Place niet gevonden' });
    }
});

/**
 * Geocode een adres naar coördinaten
 * POST /api/booking/geocode
 */
router.post('/geocode', async (req, res) => {
    try {
        const { address } = req.body;
        
        if (!address) {
            return res.status(400).json({ error: 'Adres is verplicht' });
        }
        
        const result = await geocodeAddress(address);
        res.json(result);
    } catch (error) {
        console.error('Geocode error:', error);
        res.status(404).json({ error: 'Adres niet gevonden' });
    }
});

/**
 * Bereken reistijd naar een adres
 * POST /api/booking/travel-time
 */
router.post('/travel-time', async (req, res) => {
    try {
        const { destination, origin } = req.body;
        
        if (!destination) {
            return res.status(400).json({ error: 'Bestemming is verplicht' });
        }
        
        const from = origin || await companyStore.getOriginAddress(req.session.user.id);
        const travelInfo = await calculateTravelTime(from, destination);
        
        res.json({
            origin: from,
            destination,
            ...travelInfo
        });
    } catch (error) {
        console.error('Travel time error:', error);
        res.status(500).json({ error: 'Kon reistijd niet berekenen' });
    }
});

/**
 * Vind eerste beschikbare tijdslot
 * POST /api/booking/find-slot
 * Supports multi-piano appointments with combined duration
 */
router.post('/find-slot', async (req, res) => {
    try {
        const { 
            serviceId, customerId, date, origin, searchMultipleDays = false,
            // Multi-piano support
            pianoIds, pianoCount, totalDuration, customBuffer,
            // Pagination for "more options"
            maxSlots = 6, skipSlots = 0
        } = req.body;
        
        console.log('[SMART] Request received:', { serviceId, customerId, date, origin, pianoCount, totalDuration, maxSlots, skipSlots });
        
        // Validatie
        if (!serviceId || !date) {
            return res.status(400).json({ error: 'Dienst en datum zijn verplicht' });
        }
        
        const service = await serviceStore.getService(req.session.user.id, serviceId);
        if (!service) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        // Use custom duration for multi-piano appointments, otherwise service duration
        const effectiveDuration = totalDuration || service.duration;
        
        // For multi-piano: buffer only at start (before first piano), not between pianos
        const effectiveBufferBefore = customBuffer?.before ?? service.bufferBefore ?? 0;
        const effectiveBufferAfter = customBuffer?.after ?? service.bufferAfter ?? 0;
        
        console.log('[SMART] Service:', service.name, 'Duration:', effectiveDuration, 
            pianoCount > 1 ? `(${pianoCount} pianos combined)` : '');
        
        // Haal bedrijfsadres op als default vertrekpunt
        const companyAddress = await companyStore.getOriginAddress(req.session.user.id);
        
        // Bepaal bestemming (klant adres)
        let destination = companyAddress;
        let customer = null;
        if (customerId) {
            customer = await customerStore.getCustomer(req.session.user.id, customerId);
            if (customer && customer.address?.city) {
                destination = `${customer.address.street}, ${customer.address.city}`;
            }
        }
        
        // Check of klant theater availability heeft
        const isTheater = customer?.use_theater_availability === 1 || customer?.useTheaterAvailability === true;
        if (isTheater) {
            console.log('[SMART] Customer has theater availability enabled');
        }
        
        // Bereken reistijd - standaard vanaf bedrijfsadres
        // (wordt later dynamisch aangepast per slot op basis van vorige afspraak)
        const defaultTravelInfo = await calculateTravelTime(origin || companyAddress, destination);
        
        console.log('[SMART] Default travel from', origin || companyAddress, 'to', destination, '=', defaultTravelInfo.duration, 'min');
        
        // Bereken totale benodigde tijd (buffer voor + reistijd + dienst + buffer na)
        const totalServiceTime = effectiveBufferBefore + effectiveDuration + effectiveBufferAfter;
        
        // Haal company settings op
        const companySettings = await companyStore.getSettings(req.session.user.id);
        
        console.log('[SMART] Company workingHours:', JSON.stringify(companySettings.workingHours));
        
        // Map day of week number naar dagnaam
        const dayNameMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayNamesNL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
        
        // Converteer workingHours naar dag-naam formaat als nodig
        let workingHours = companySettings.workingHours;
        if (workingHours && (workingHours[0] !== undefined || workingHours['0'] !== undefined)) {
            // Oud index-based formaat - converteer
            console.log('[SMART] Converting old index-based workingHours to day-name format');
            const converted = {};
            for (let i = 0; i < 7; i++) {
                const dayData = workingHours[i] || workingHours[String(i)];
                const dayName = dayNameMap[i];
                if (dayData) {
                    converted[dayName] = {
                        start: dayData.start || '09:00',
                        end: dayData.end || '17:00',
                        enabled: dayData.available === true || dayData.enabled === true
                    };
                } else {
                    converted[dayName] = {
                        start: '09:00',
                        end: '17:00',
                        enabled: i >= 1 && i <= 5
                    };
                }
            }
            workingHours = converted;
            console.log('[SMART] Converted workingHours:', JSON.stringify(workingHours));
        }
        
        // Zoek alleen op de gekozen dag (niet meer over meerdere dagen)
        const searchDate = new Date(date);
        const dayOfWeek = searchDate.getDay();
        const dayName = dayNameMap[dayOfWeek];
        
        // Haal werkuren op via dagnaam
        const dayAvailability = workingHours?.[dayName];
        
        console.log(`[SMART] Checking ${dayName}:`, dayAvailability);
        
        // Check of deze dag beschikbaar is
        // Voor theaters: gebruik theater hours als enabled
        let effectiveAvailability = dayAvailability;
        if (isTheater && companySettings.theaterHoursEnabled) {
            const theaterHours = companySettings.theaterHours || {};
            const theaterDayHours = theaterHours[dayName];
            if (theaterDayHours?.enabled) {
                effectiveAvailability = theaterDayHours;
                console.log(`[SMART] Using THEATER hours for ${dayName}:`, effectiveAvailability);
            }
        }
        
        if (!effectiveAvailability || !effectiveAvailability.enabled) {
            console.log(`[SMART] Day ${dayName} - not enabled`);
            return res.json({
                available: false,
                message: 'not_available_on_day',
                dayIndex: dayOfWeek,
                service,
                travelInfo: defaultTravelInfo
            });
        }
        
        const workHours = {
            start: effectiveAvailability.start || '09:00',
            end: effectiveAvailability.end || '17:00'
        };
        
        // Haal events van die dag op
        const dayStart = new Date(searchDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(searchDate);
        dayEnd.setHours(23, 59, 59, 999);
        
        const existingEvents = await getCalendarEvents(req, dayStart, dayEnd);
        
        console.log(`[SMART] Day: ${dayName}, workHours:`, workHours);
        console.log(`[SMART] Events on ${searchDate.toISOString().split('T')[0]}:`, existingEvents.length);
        console.log(`[SMART] Travel: ${defaultTravelInfo.duration}min, Service: ${effectiveDuration}min${pianoCount > 1 ? ` (${pianoCount} pianos)` : ''}, Buffer: ${effectiveBufferBefore}/${effectiveBufferAfter}`);
        console.log(`[SMART] Finding ${maxSlots} slots, skipping first ${skipSlots}`);
        
        // Vind ALLE beschikbare slots op deze dag
        const daySlots = findAllAvailableSlots(
            existingEvents,
            defaultTravelInfo.duration,
            effectiveDuration,
            searchDate,
            workHours,
            effectiveBufferBefore,
            effectiveBufferAfter,
            maxSlots,
            skipSlots
        );
        
        console.log(`[SMART] Slots found:`, daySlots.length);
        
        if (daySlots.length > 0) {
            const foundSlots = daySlots.map(slot => ({
                slot: {
                    travelStart: slot.travelStart,
                    bufferBeforeStart: slot.bufferBeforeStart,
                    appointmentStart: slot.appointmentStart,
                    appointmentEnd: slot.appointmentEnd,
                    slotEnd: slot.slotEnd
                },
                foundDate: searchDate.toISOString().split('T')[0],
                pianoCount: pianoCount || 1
            }));
            
            return res.json({
                available: true,
                slots: foundSlots,
                slot: foundSlots[0].slot, // Backward compatibility
                service: {
                    ...service,
                    duration: effectiveDuration
                },
                travelInfo: defaultTravelInfo,
                totalDuration: defaultTravelInfo.duration + effectiveBufferBefore + effectiveDuration + effectiveBufferAfter,
                pianoCount: pianoCount || 1,
                searchedDate: date,
                hasMoreSlots: daySlots.length === maxSlots // Hint dat er mogelijk meer zijn
            });
        }
        
        // Geen slots gevonden op deze dag
        return res.json({
            available: false,
            message: 'no_slots_on_day',
            service,
            travelInfo
        });
        
    } catch (error) {
        console.error('[SMART] Error:', error);
        res.status(500).json({ error: 'Kon beschikbaarheid niet bepalen' });
    }
});

/**
 * Boek een afspraak met klant
 * POST /api/booking/create
 */
router.post('/create', async (req, res) => {
    try {
        const { 
            serviceId, 
            customerId, 
            customerData, // Voor nieuwe klant
            appointmentStart,
            notes 
        } = req.body;
        
        // Validatie
        if (!serviceId || !appointmentStart) {
            return res.status(400).json({ error: 'Dienst en starttijd zijn verplicht' });
        }
        
        const service = await serviceStore.getService(req.session.user.id, serviceId);
        if (!service) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        // Klant ophalen of aanmaken
        let customer;
        if (customerId) {
            customer = await customerStore.getCustomer(req.session.user.id, customerId);
        } else if (customerData && customerData.name) {
            customer = await customerStore.createCustomer(req.session.user.id, customerData);
        }
        
        if (!customer) {
            return res.status(400).json({ error: 'Klantgegevens zijn verplicht' });
        }
        
        // Bereken eindtijd
        const start = new Date(appointmentStart);
        const end = new Date(start.getTime() + service.duration * 60 * 1000);
        
        const location = customer.address.street 
            ? `${customer.address.street}, ${customer.address.postalCode} ${customer.address.city}`
            : customer.address.city;
        
        const eventData = {
            summary: `${service.name} - ${customer.name}`,
            description: `Klant: ${customer.name}
Email: ${customer.email || '-'}
Telefoon: ${customer.phone || '-'}

${customer.pianos?.length ? `Piano: ${customer.pianos[0].brand} ${customer.pianos[0].model}` : ''}

${notes || ''}`.trim(),
            location,
            start: start,
            end: end
        };
        
        // Probeer event aan te maken in de juiste kalender
        let createdEvent = null;
        
        // Check Google Calendar first
        const googleAuth = await getGoogleAuthClient(req);
        if (googleAuth) {
            const calendar = google.calendar({ version: 'v3', auth: googleAuth });
            
            const googleEvent = {
                ...eventData,
                start: {
                    dateTime: start.toISOString(),
                    timeZone: 'Europe/Amsterdam'
                },
                end: {
                    dateTime: end.toISOString(),
                    timeZone: 'Europe/Amsterdam'
                },
                colorId: getCalendarColorId(service.color)
            };
            
            const response = await calendar.events.insert({
                calendarId: 'primary',
                resource: googleEvent
            });
            
            createdEvent = response.data;
            console.log(`✅ Afspraak geboekt via Google Calendar: ${service.name} bij ${customer.name}`);
        } else {
            // Check Microsoft Calendar
            const microsoftCredentials = await userStore.getMicrosoftCalendarCredentials(req.session.user.id);
            
            if (microsoftCredentials && microsoftCredentials.connected && microsoftCredentials.accessToken) {
                // Create event via Microsoft Calendar
                createdEvent = await createMicrosoftCalendarEvent(microsoftCredentials.accessToken, eventData);
                console.log(`✅ Afspraak geboekt via Microsoft Calendar: ${service.name} bij ${customer.name}`);
            } else {
                // Check Apple Calendar
                const appleCredentials = await userStore.getAppleCalendarCredentials(req.session.user.id);
                const appleSync = await userStore.getAppleCalendarSync(req.session.user.id);
                
                if (appleCredentials && appleSync?.enabled && appleSync?.appleCalendarUrl) {
                    // Create event via Apple Calendar
                    createdEvent = await createAppleCalendarEvent(appleCredentials, appleSync.appleCalendarUrl, eventData);
                    console.log(`✅ Afspraak geboekt via Apple Calendar: ${service.name} bij ${customer.name}`);
                } else {
                    console.log(`⚠️ Geen kalender verbonden - afspraak niet toegevoegd aan kalender`);
                    createdEvent = { 
                        id: `local-${Date.now()}`,
                        summary: eventData.summary,
                        start: start.toISOString(),
                        end: end.toISOString()
                    };
                }
            }
        }
        
        res.json({
            success: true,
            event: createdEvent,
            customer,
            service
        });
        
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).json({ error: 'Kon afspraak niet boeken' });
    }
});

// Helper: converteer hex kleur naar Google Calendar kleur ID
function getCalendarColorId(hexColor) {
    const colorMap = {
        '#4CAF50': '10', // Groen
        '#2196F3': '9',  // Blauw
        '#FF9800': '6',  // Oranje
        '#F44336': '11', // Rood
        '#9C27B0': '3',  // Paars
        '#607D8B': '8'   // Grijs
    };
    return colorMap[hexColor] || '1';
}

module.exports = router;
