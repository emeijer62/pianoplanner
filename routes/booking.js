const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const { calculateTravelTime, findFirstAvailableSlot, getPlaceAutocomplete, getPlaceDetails, geocodeAddress } = require('../utils/travelTime');
const serviceStore = require('../utils/serviceStore');
const customerStore = require('../utils/customerStore');
const companyStore = require('../utils/companyStore');
const { requireAuth } = require('../middleware/auth');

// Alle routes vereisen authenticatie
router.use(requireAuth);

// Helper: maak OAuth2 client
const getAuthClient = (req) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(req.session.tokens);
    return oauth2Client;
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
 */
router.post('/find-slot', async (req, res) => {
    try {
        const { serviceId, customerId, date, origin } = req.body;
        
        // Validatie
        if (!serviceId || !date) {
            return res.status(400).json({ error: 'Dienst en datum zijn verplicht' });
        }
        
        const service = await serviceStore.getService(req.session.user.id, serviceId);
        if (!service) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        // Haal bedrijfsadres op als vertrekpunt
        const companyAddress = await companyStore.getOriginAddress(req.session.user.id);
        
        // Bepaal bestemming
        let destination = companyAddress;
        if (customerId) {
            const customer = await customerStore.getCustomer(req.session.user.id, customerId);
            if (customer && customer.address?.city) {
                destination = `${customer.address.street}, ${customer.address.city}`;
            }
        }
        
        // Bereken reistijd
        const fromLocation = origin || companyAddress;
        const travelInfo = await calculateTravelTime(fromLocation, destination);
        
        // Bereken totale benodigde tijd (buffer voor + reistijd + dienst + buffer na)
        const totalServiceTime = (service.bufferBefore || 0) + service.duration + (service.bufferAfter || 0);
        
        // Haal beschikbaarheid op voor deze dag
        const companySettings = await companyStore.getSettings(req.session.user.id);
        const requestedDate = new Date(date);
        const dayOfWeek = requestedDate.getDay(); // 0 = zondag, 1 = maandag, etc.
        
        const dayAvailability = companySettings.availability?.[dayOfWeek];
        
        // Check of deze dag beschikbaar is
        if (!dayAvailability || !dayAvailability.available) {
            return res.json({
                available: false,
                message: `Niet beschikbaar op ${['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'][dayOfWeek]}`,
                service,
                travelInfo
            });
        }
        
        const workHours = {
            start: dayAvailability.start || '09:00',
            end: dayAvailability.end || '18:00'
        };
        
        // Haal events van die dag op
        const auth = getAuthClient(req);
        const calendar = google.calendar({ version: 'v3', auth });
        
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);
        
        const eventsResponse = await calendar.events.list({
            calendarId: 'primary',
            timeMin: dayStart.toISOString(),
            timeMax: dayEnd.toISOString(),
            singleEvents: true,
            orderBy: 'startTime'
        });
        
        const existingEvents = eventsResponse.data.items || [];
        
        // Vind eerste beschikbare slot (met buffertijden)
        const slot = findFirstAvailableSlot(
            existingEvents,
            travelInfo.duration,
            service.duration,
            new Date(date),
            workHours,
            service.bufferBefore || 0,
            service.bufferAfter || 0
        );
        
        if (!slot) {
            return res.json({
                available: false,
                message: 'Geen beschikbare tijd op deze dag',
                service,
                travelInfo
            });
        }
        
        res.json({
            available: true,
            slot: {
                travelStart: slot.travelStart,
                bufferBeforeStart: slot.bufferBeforeStart,
                appointmentStart: slot.appointmentStart,
                appointmentEnd: slot.appointmentEnd,
                slotEnd: slot.slotEnd
            },
            service,
            travelInfo,
            buffers: {
                before: service.bufferBefore || 0,
                after: service.bufferAfter || 0
            },
            totalDuration: slot.totalDuration
        });
        
    } catch (error) {
        console.error('Find slot error:', error);
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
        
        // Maak Google Calendar event
        const auth = getAuthClient(req);
        const calendar = google.calendar({ version: 'v3', auth });
        
        const location = customer.address.street 
            ? `${customer.address.street}, ${customer.address.postalCode} ${customer.address.city}`
            : customer.address.city;
        
        const event = {
            summary: `${service.name} - ${customer.name}`,
            description: `Klant: ${customer.name}
Email: ${customer.email || '-'}
Telefoon: ${customer.phone || '-'}

${customer.pianos?.length ? `Piano: ${customer.pianos[0].brand} ${customer.pianos[0].model}` : ''}

${notes || ''}`.trim(),
            location,
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
            resource: event
        });
        
        console.log(`✅ Afspraak geboekt: ${service.name} bij ${customer.name}`);
        
        res.json({
            success: true,
            event: response.data,
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
