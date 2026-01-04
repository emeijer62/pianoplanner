const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const { calculateTravelTime, findFirstAvailableSlot, DEFAULT_ORIGIN } = require('../utils/travelTime');
const { getService } = require('../config/services');
const customerStore = require('../utils/customerStore');
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
 * Bereken reistijd naar een adres
 * POST /api/booking/travel-time
 */
router.post('/travel-time', async (req, res) => {
    try {
        const { destination, origin } = req.body;
        
        if (!destination) {
            return res.status(400).json({ error: 'Bestemming is verplicht' });
        }
        
        const from = origin || DEFAULT_ORIGIN.address;
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
        
        const service = getService(serviceId);
        if (!service) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        // Bepaal bestemming
        let destination = DEFAULT_ORIGIN.address;
        if (customerId) {
            const customer = customerStore.getCustomer(customerId);
            if (customer && customer.address.city) {
                destination = `${customer.address.street}, ${customer.address.city}`;
            }
        }
        
        // Bereken reistijd
        const fromLocation = origin || DEFAULT_ORIGIN.address;
        const travelInfo = await calculateTravelTime(fromLocation, destination);
        
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
        
        // Vind eerste beschikbare slot
        const slot = findFirstAvailableSlot(
            existingEvents,
            travelInfo.duration,
            service.duration,
            new Date(date)
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
                appointmentStart: slot.appointmentStart,
                appointmentEnd: slot.appointmentEnd
            },
            service,
            travelInfo,
            totalDuration: travelInfo.duration + service.duration
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
        
        const service = getService(serviceId);
        if (!service) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        // Klant ophalen of aanmaken
        let customer;
        if (customerId) {
            customer = customerStore.getCustomer(customerId);
        } else if (customerData && customerData.name) {
            customer = customerStore.saveCustomer(customerData);
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
