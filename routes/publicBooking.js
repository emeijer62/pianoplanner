/**
 * Public Booking Routes - Publieke zelfplanner
 * Geen authenticatie vereist voor deze routes
 */

const express = require('express');
const router = express.Router();
const userStore = require('../utils/userStore');
const serviceStore = require('../utils/serviceStore');
const customerStore = require('../utils/customerStore');
const appointmentStore = require('../utils/appointmentStore');
const companyStore = require('../utils/companyStore');
const pianoStore = require('../utils/pianoStore');
const { calculateTravelTime, getPlaceAutocomplete, getPlaceDetails, geocodeAddress } = require('../utils/travelTime');
const emailService = require('../utils/emailService');
const { getDb } = require('../utils/database');

// ==================== CUSTOMER-SPECIFIC BOOKING ====================

/**
 * Haal klant booking data op via token
 * GET /api/book/customer/:token
 */
router.get('/customer/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Haal klant + eigenaar info op
        const data = await customerStore.getCustomerWithOwnerByToken(token);
        
        if (!data) {
            return res.status(404).json({ error: 'Boekingslink niet geldig' });
        }
        
        // Haal piano's van deze klant op
        const pianos = await pianoStore.getPianosByCustomer(data.owner.id, data.customer.id);
        
        // Haal beschikbare diensten op
        let services = await serviceStore.getActiveServices(data.owner.id);
        
        // Haal booking settings op
        const bookingSettings = await userStore.getBookingSettings(data.owner.id);
        
        // Als klant een vaste dienst heeft, gebruik alleen die
        if (data.customer.defaultServiceId) {
            const defaultService = services.find(s => s.id === data.customer.defaultServiceId);
            if (defaultService) {
                services = [defaultService];
            }
        } 
        // Anders: filter diensten volgens booking settings
        else {
            const allowedIds = bookingSettings.allowedServiceIds || bookingSettings.allowedServices || [];
            if (allowedIds.length > 0) {
                services = services.filter(s => allowedIds.includes(s.id));
            }
        }
        
        // Haal bedrijfslogo op
        const logoUrl = await emailService.getCompanyLogo(data.owner.id);
        
        // Haal availability op - gebruik theater hours als klant dat heeft ingesteld
        const company = await companyStore.getCompanySettings(data.owner.id);
        
        // Bepaal welke beschikbaarheid te gebruiken
        let availability;
        const useTheaterHours = data.customer.useTheaterHours && company?.theaterHoursEnabled;
        
        if (useTheaterHours && company?.theaterHours) {
            // Gebruik theater beschikbaarheid voor deze klant
            availability = company.theaterHours;
        } else {
            // Normale beschikbaarheid
            availability = company?.workingHours || {
                monday: { enabled: true, start: '09:00', end: '17:00' },
                tuesday: { enabled: true, start: '09:00', end: '17:00' },
                wednesday: { enabled: true, start: '09:00', end: '17:00' },
                thursday: { enabled: true, start: '09:00', end: '17:00' },
                friday: { enabled: true, start: '09:00', end: '17:00' },
                saturday: { enabled: false, start: '09:00', end: '17:00' },
                sunday: { enabled: false, start: '09:00', end: '17:00' }
            };
        }
        
        res.json({
            customer: {
                name: data.customer.name,
                email: data.customer.email,
                phone: data.customer.phone,
                address: data.customer.address
            },
            pianos: pianos.map(p => ({
                id: p.id,
                brand: p.brand,
                model: p.model,
                type: p.type,
                location: p.location,
                serialNumber: p.serialNumber
            })),
            business: {
                name: data.business.name || 'Piano Service',
                logo: logoUrl || data.business.logo,
                phone: data.business.phone,
                email: data.business.email
            },
            services: services.map(s => ({
                id: s.id,
                name: s.name,
                description: s.description,
                duration: s.duration,
                price: s.price
            })),
            availability,
            useTheaterHours,
            ownerId: data.owner.id
        });
        
    } catch (error) {
        console.error('Customer booking fetch error:', error);
        res.status(500).json({ error: 'Kon boekingsgegevens niet laden' });
    }
});

/**
 * Maak een afspraak aan via klant token
 * POST /api/book/customer/:token/appointment
 */
router.post('/customer/:token/appointment', async (req, res) => {
    try {
        const { token } = req.params;
        const { serviceId, pianoId, date, time, notes } = req.body;
        
        // Valideer klant token
        const data = await customerStore.getCustomerWithOwnerByToken(token);
        
        if (!data) {
            return res.status(404).json({ error: 'Ongeldige boekingslink' });
        }
        
        // Valideer verplichte velden
        if (!serviceId || !date || !time) {
            return res.status(400).json({ error: 'Service, datum en tijd zijn verplicht' });
        }
        
        // Haal service op
        const service = await serviceStore.getService(data.owner.id, serviceId);
        if (!service) {
            return res.status(400).json({ error: 'Ongeldige service' });
        }
        
        // Als piano geselecteerd, valideer dat deze van de klant is
        let piano = null;
        if (pianoId) {
            piano = await pianoStore.getPiano(data.owner.id, pianoId);
            if (!piano || piano.customerId !== data.customer.id) {
                return res.status(400).json({ error: 'Ongeldige piano selectie' });
            }
        }
        
        // Bereken start en eindtijd
        const startDateTime = new Date(`${date}T${time}`);
        const endDateTime = new Date(startDateTime.getTime() + (service.duration || 60) * 60000);
        
        // Maak afspraak aan
        const appointmentData = {
            title: `${service.name} - ${data.customer.name}`,
            customer_id: data.customer.id,
            customer_name: data.customer.name,
            customer_email: data.customer.email,
            customer_phone: data.customer.phone,
            service_id: serviceId,
            service_name: service.name,
            piano_id: pianoId || null,
            piano_info: piano ? `${piano.brand} ${piano.model || ''}`.trim() : null,
            start: startDateTime.toISOString(),
            end: endDateTime.toISOString(),
            address: [
                data.customer.address.street,
                data.customer.address.postalCode,
                data.customer.address.city
            ].filter(Boolean).join(', '),
            notes: notes || '',
            status: 'confirmed',
            source: 'customer_booking_link'
        };
        
        const appointment = await appointmentStore.createAppointment(data.owner.id, appointmentData);
        
        // Stuur bevestigingsmail
        try {
            const company = await companyStore.getCompanySettings(data.owner.id);
            if (emailService.isEmailConfigured() && data.customer.email) {
                await emailService.sendAppointmentConfirmation({
                    customerEmail: data.customer.email,
                    customerName: data.customer.name,
                    appointmentDate: date,
                    appointmentTime: time,
                    serviceName: service.name,
                    companyName: company?.name || 'Piano Service',
                    replyTo: data.owner.email,
                    fromName: company?.name || 'Piano Service',
                    userId: data.owner.id
                });
                console.log('📧 ✅ Customer booking confirmation sent to', data.customer.email);
            }
        } catch (emailErr) {
            console.error('Email verzenden mislukt:', emailErr);
            // Niet fataal - afspraak is wel aangemaakt
        }
        
        res.json({ 
            success: true, 
            appointment: {
                id: appointment.id,
                date,
                time,
                service: service.name
            },
            message: 'Afspraak succesvol geboekt!'
        });
        
    } catch (error) {
        console.error('Customer booking create error:', error);
        res.status(500).json({ error: 'Kon afspraak niet aanmaken' });
    }
});

/**
 * Smart suggestions voor klant-specifieke booking
 * GET /api/book/customer/:token/smart-suggestions
 */
router.get('/customer/:token/smart-suggestions', async (req, res) => {
    try {
        const { token } = req.params;
        const { serviceId } = req.query;
        
        // Valideer klant token
        const data = await customerStore.getCustomerWithOwnerByToken(token);
        
        if (!data) {
            return res.status(404).json({ error: 'Ongeldige boekingslink' });
        }
        
        if (!serviceId) {
            return res.status(400).json({ error: 'Dienst is verplicht' });
        }
        
        // Haal service op
        const service = await serviceStore.getService(data.owner.id, serviceId);
        if (!service) {
            return res.status(400).json({ error: 'Ongeldige service' });
        }
        
        // Haal bedrijfsinstellingen op
        const company = await companyStore.getCompanySettings(data.owner.id);
        const bookingSettings = await userStore.getBookingSettings(data.owner.id);
        
        // Bepaal welke werkuren te gebruiken (theater of normaal)
        let workingHours;
        const useTheaterHours = data.customer.useTheaterHours && company?.theaterHoursEnabled;
        
        if (useTheaterHours && company?.theaterHours) {
            workingHours = normalizeWorkingHours(company.theaterHours);
        } else {
            workingHours = normalizeWorkingHours(company?.workingHours);
        }
        
        // Bouw klant adres
        const customerLocation = [
            data.customer.address.street,
            data.customer.address.postalCode,
            data.customer.address.city
        ].filter(Boolean).join(', ');
        
        // Bouw bedrijfs origin adres
        const originAddress = company?.travelOrigin || 
            [company?.address?.street, company?.address?.postalCode, company?.address?.city].filter(Boolean).join(', ');
        
        // Datum range
        const now = new Date();
        const startDate = new Date(now.getTime() + (bookingSettings.minAdvanceHours * 60 * 60 * 1000));
        const endDate = new Date(now.getTime() + (bookingSettings.maxAdvanceDays * 24 * 60 * 60 * 1000));
        
        // Haal alle afspraken in deze periode op
        const allAppointments = await appointmentStore.getAppointmentsByDateRange(
            data.owner.id, 
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        );
        
        // Haal travel settings op
        const travelSettings = await companyStore.getTravelSettings(data.owner.id);
        
        // Genereer suggesties
        const suggestions = await generateSmartSuggestions({
            customerLocation,
            service,
            workingHours,
            existingAppointments: allAppointments,
            startDate,
            endDate,
            maxSuggestions: 6,
            maxBetweenTravelMinutes: travelSettings.enabled ? travelSettings.maxBetweenTravelMinutes : null,
            originAddress
        });
        
        res.json({
            success: true,
            suggestions,
            useTheaterHours,
            message: suggestions.length === 0 
                ? 'Geen beschikbare tijden gevonden in de komende periode' 
                : `${suggestions.length} optimale tijden gevonden`
        });
        
    } catch (error) {
        console.error('Customer smart suggestions error:', error);
        res.status(500).json({ error: 'Fout bij genereren suggesties' });
    }
});

// ==================== PUBLIC ADDRESS AUTOCOMPLETE ====================

/**
 * Public address autocomplete - geen auth vereist
 * GET /api/book/address-autocomplete
 */
router.get('/address-autocomplete', async (req, res) => {
    try {
        const { input, sessionToken, slug, includeNeighbors } = req.query;
        
        if (!input || input.length < 3) {
            return res.json({ predictions: [] });
        }
        
        // Probeer het land te bepalen op basis van de slug
        let userCountry = 'NL'; // Default
        if (slug) {
            try {
                const user = await userStore.getUserByBookingSlug(slug);
                if (user) {
                    const companySettings = await companyStore.getCompanySettings(user.id);
                    if (companySettings?.address?.country) {
                        userCountry = companySettings.address.country;
                    }
                }
            } catch (e) {
                // Gebruik default bij fout
            }
        }
        
        const predictions = await getPlaceAutocomplete(
            input, 
            sessionToken,
            userCountry,
            includeNeighbors !== 'false'
        );
        res.json({ predictions });
    } catch (error) {
        console.error('Public autocomplete error:', error);
        res.json({ predictions: [] });
    }
});

/**
 * Public place details - geen auth vereist
 * GET /api/book/place-details/:placeId
 */
router.get('/place-details/:placeId', async (req, res) => {
    try {
        const { placeId } = req.params;
        
        if (!placeId) {
            return res.status(400).json({ error: 'Place ID is verplicht' });
        }
        
        let details = await getPlaceDetails(placeId);
        let address = details.components || {};
        
        // If postal code is missing, try geocoding
        if (!address.postalCode && details.formattedAddress) {
            try {
                const geocodeResult = await geocodeAddress(details.formattedAddress);
                if (geocodeResult?.components) {
                    if (geocodeResult.components.postalCode) address.postalCode = geocodeResult.components.postalCode;
                    if (geocodeResult.components.city && !address.city) address.city = geocodeResult.components.city;
                }
            } catch (e) { /* ignore */ }
        }
        
        // Combine street and number
        let street = address.street || '';
        if (address.streetNumber) {
            street = street ? `${street} ${address.streetNumber}` : address.streetNumber;
        }
        
        res.json({
            formattedAddress: details.formattedAddress,
            lat: details.lat,
            lng: details.lng,
            address: {
                street,
                postalCode: address.postalCode || '',
                city: address.city || ''
            }
        });
    } catch (error) {
        console.error('Public place details error:', error);
        res.status(500).json({ error: 'Kon adresgegevens niet ophalen' });
    }
});

// ==================== PUBLIC BOOKING PAGE DATA ====================

// GET /api/book/:slug - Haal publieke boekingspagina data op
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        
        // Vind de user via slug
        const user = await userStore.getUserByBookingSlug(slug);
        if (!user) {
            return res.status(404).json({ error: 'Boekingspagina niet gevonden' });
        }
        
        // Check of booking is ingeschakeld
        const settings = await userStore.getBookingSettings(user.id);
        if (!settings.enabled) {
            return res.status(404).json({ error: 'Boekingspagina niet beschikbaar' });
        }
        
        // Haal bedrijfsgegevens op
        const company = await companyStore.getCompanySettings(user.id);
        
        // Haal beschikbare diensten op
        let services = await serviceStore.getActiveServices(user.id);
        
        // Filter op toegestane diensten als ingesteld
        const allowedIds = settings.allowedServiceIds || settings.allowedServices || [];
        if (allowedIds.length > 0) {
            services = services.filter(s => allowedIds.includes(s.id));
        }
        
        // Haal beschikbaarheid op (working hours)
        const availability = company?.workingHours || {
            monday: { enabled: true, start: '09:00', end: '17:00' },
            tuesday: { enabled: true, start: '09:00', end: '17:00' },
            wednesday: { enabled: true, start: '09:00', end: '17:00' },
            thursday: { enabled: true, start: '09:00', end: '17:00' },
            friday: { enabled: true, start: '09:00', end: '17:00' },
            saturday: { enabled: false, start: '09:00', end: '13:00' },
            sunday: { enabled: false, start: '09:00', end: '13:00' }
        };
        
        res.json({
            success: true,
            business: {
                name: company?.name || user.name || 'Piano Services',
                phone: company?.phone,
                email: company?.email,
                city: company?.city,
                logoUrl: company?.logoUrl || null
            },
            settings: {
                title: settings.title,
                description: settings.description,
                minAdvanceHours: settings.minAdvanceHours,
                maxAdvanceDays: settings.maxAdvanceDays,
                requirePhone: settings.requirePhone,
                requireEmail: settings.requireEmail,
                confirmationMessage: settings.confirmationMessage
            },
            services: services.map(s => ({
                id: s.id,
                name: s.name,
                duration: s.duration,
                price: s.price,
                description: s.description
            })),
            availability
        });
        
    } catch (error) {
        console.error('Public booking error:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden' });
    }
});

// GET /api/book/:slug/slots - Haal beschikbare tijdslots op voor een datum
router.get('/:slug/slots', async (req, res) => {
    try {
        const { slug } = req.params;
        const { date, serviceId } = req.query;
        
        if (!date || !serviceId) {
            return res.status(400).json({ error: 'Datum en dienst zijn verplicht' });
        }
        
        // Vind de user
        const user = await userStore.getUserByBookingSlug(slug);
        if (!user) {
            return res.status(404).json({ error: 'Niet gevonden' });
        }
        
        const settings = await userStore.getBookingSettings(user.id);
        if (!settings.enabled) {
            return res.status(404).json({ error: 'Niet beschikbaar' });
        }
        
        // Haal de dienst op
        const service = await serviceStore.getService(user.id, serviceId);
        if (!service) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        // Check datum beperkingen
        const requestedDate = new Date(date);
        const now = new Date();
        const minDate = new Date(now.getTime() + (settings.minAdvanceHours * 60 * 60 * 1000));
        const maxDate = new Date(now.getTime() + (settings.maxAdvanceDays * 24 * 60 * 60 * 1000));
        
        if (requestedDate < minDate) {
            return res.status(400).json({ error: 'Datum is te vroeg' });
        }
        if (requestedDate > maxDate) {
            return res.status(400).json({ error: 'Datum is te ver in de toekomst' });
        }
        
        // Haal werkuren op
        const company = await companyStore.getCompanySettings(user.id);
        const rawWorkingHours = company?.workingHours;
        
        // Normaliseer werkuren naar { monday: {enabled, start, end}, ... } formaat
        const workingHours = normalizeWorkingHours(rawWorkingHours);
        
        // Bepaal dag van de week
        const dayIndex = requestedDate.getDay();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dayIndex];
        
        const dayHours = workingHours[dayName];
        if (!dayHours || !dayHours.enabled) {
            return res.json({ slots: [], message: 'Gesloten op deze dag' });
        }
        
        // Haal bestaande afspraken op voor die dag
        const appointments = await appointmentStore.getAppointmentsForDay(user.id, date);
        
        // Haal bedrijfsadres op voor reistijd schatting
        const originAddress = company?.travelOrigin || 
            [company?.address?.street, company?.address?.postalCode, company?.address?.city].filter(Boolean).join(', ');
        
        // Default reistijd (30 min) als we geen bedrijfsadres hebben
        let defaultTravelTime = 30;
        
        // Genereer beschikbare slots (eerste slot houdt rekening met reistijd)
        const slots = generateTimeSlots(
            date,
            dayHours.start,
            dayHours.end,
            service.duration,
            service.bufferBefore || 0,
            service.bufferAfter || 0,
            appointments,
            defaultTravelTime
        );
        
        res.json({ 
            slots,
            note: originAddress ? 'Tijden zijn aankomsttijden bij u' : null
        });
        
    } catch (error) {
        console.error('Slots error:', error);
        res.status(500).json({ error: 'Fout bij ophalen tijdslots' });
    }
});

// POST /api/book/:slug - Maak een publieke boeking aan
router.post('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { serviceId, date, time, customer } = req.body;
        
        // Validatie
        if (!serviceId || !date || !time || !customer) {
            return res.status(400).json({ error: 'Alle velden zijn verplicht' });
        }
        
        // Vind de user
        const user = await userStore.getUserByBookingSlug(slug);
        if (!user) {
            return res.status(404).json({ error: 'Niet gevonden' });
        }
        
        const settings = await userStore.getBookingSettings(user.id);
        if (!settings.enabled) {
            return res.status(404).json({ error: 'Niet beschikbaar' });
        }
        
        // Valideer verplichte velden
        if (!customer.name) {
            return res.status(400).json({ error: 'Naam is verplicht' });
        }
        if (settings.requireEmail && !customer.email) {
            return res.status(400).json({ error: 'Email is verplicht' });
        }
        if (settings.requirePhone && !customer.phone) {
            return res.status(400).json({ error: 'Telefoon is verplicht' });
        }
        
        // Haal de dienst op
        const service = await serviceStore.getService(user.id, serviceId);
        if (!service) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        // Check of slot nog beschikbaar is
        const slotCheck = await checkSlotAvailable(user.id, date, time, service.duration);
        if (!slotCheck.available) {
            return res.status(409).json({ error: 'Dit tijdslot is niet meer beschikbaar' });
        }
        
        // Maak of vind de klant
        let existingCustomer = null;
        if (customer.email) {
            existingCustomer = await customerStore.getCustomerByEmail(user.id, customer.email);
        }
        
        let customerId;
        let customerRecord;
        if (existingCustomer) {
            customerId = existingCustomer.id;
            customerRecord = existingCustomer;
        } else {
            customerRecord = await customerStore.createCustomer(user.id, {
                name: customer.name,
                email: customer.email || null,
                phone: customer.phone || null,
                street: customer.street || null,
                postalCode: customer.postalCode || null,
                city: customer.city || null,
                notes: 'Aangemaakt via online boeking'
            });
            customerId = customerRecord.id;
        }
        
        // Haal bedrijfsadres op voor reistijd berekening
        const company = await companyStore.getCompanySettings(user.id);
        const originAddress = company?.travelOrigin || 
            [company?.address?.street, company?.address?.postalCode, company?.address?.city].filter(Boolean).join(', ');
        
        // Bepaal klant adres
        const customerAddress = [
            customer.street || customerRecord?.address?.street,
            customer.postalCode || customerRecord?.address?.postalCode,
            customer.city || customerRecord?.address?.city
        ].filter(Boolean).join(', ');
        
        // Bereken reistijd als we beide adressen hebben (met 5 sec timeout)
        let travelInfo = null;
        if (originAddress && customerAddress) {
            try {
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 5000)
                );
                travelInfo = await Promise.race([
                    calculateTravelTime(originAddress, customerAddress),
                    timeoutPromise
                ]);
            } catch (err) {
                console.log('Kon reistijd niet berekenen:', err.message);
            }
        }
        
        // Bereken tijden
        // De klant boekt een aankomsttijd, wij berekenen wanneer we moeten vertrekken
        const arrivalTime = `${date}T${time}:00`;
        const endTime = calculateEndTime(arrivalTime, service.duration);
        
        // Reistijd start = aankomsttijd - reistijd
        let travelStartTime = null;
        if (travelInfo?.duration) {
            const arrival = new Date(arrivalTime);
            travelStartTime = new Date(arrival.getTime() - (travelInfo.duration * 60 * 1000)).toISOString();
        }
        
        // Maak de afspraak aan met reistijd info
        const appointment = await appointmentStore.createAppointment(user.id, {
            title: `${service.name} - ${customer.name}`,
            description: `Online geboekt\n${customer.phone ? 'Tel: ' + customer.phone : ''}\n${customer.email ? 'Email: ' + customer.email : ''}${travelInfo ? `\n\n🚗 Reistijd: ${travelInfo.durationText} (${travelInfo.distanceText})` : ''}`,
            location: customerAddress || customer.city || null,
            start: arrivalTime,
            end: endTime,
            customerId: customerId,
            customerName: customer.name,
            serviceId: service.id,
            serviceName: service.name,
            status: 'scheduled',
            color: service.color || '#4CAF50',
            // Reistijd info
            travelTimeMinutes: travelInfo?.duration || null,
            travelDistanceKm: travelInfo?.distance || null,
            travelStartTime: travelStartTime,
            originAddress: originAddress || null
        });
        
        // Stuur response DIRECT terug - emails worden async verstuurd
        res.json({
            success: true,
            message: settings.confirmationMessage,
            appointment: {
                id: appointment.id,
                date: date,
                time: time,
                service: service.name,
                duration: service.duration,
                travelTime: travelInfo?.duration || null,
                travelDistance: travelInfo?.distance || null
            }
        });
        
        // Sla variabelen op voor async email (voordat response wordt gestuurd)
        const emailData = {
            userId: user.id,
            userEmail: user.email,
            customerEmail: customer.email,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerNotes: customer.notes,
            date,
            time,
            serviceName: service.name,
            companyName: company?.name || 'Piano Services'
        };
        
        // Send email notifications ASYNC (fire-and-forget, na response)
        // For public bookings, always send confirmations - no need to check settings
        if (emailService.isEmailConfigured()) {
            // Use process.nextTick instead of setImmediate for more reliable execution
            process.nextTick(async () => {
                // Send confirmation to customer
                if (emailData.customerEmail) {
                    try {
                        await emailService.sendAppointmentConfirmation({
                            customerEmail: emailData.customerEmail,
                            customerName: emailData.customerName,
                            appointmentDate: emailData.date,
                            appointmentTime: emailData.time,
                            serviceName: emailData.serviceName,
                            companyName: emailData.companyName,
                            replyTo: emailData.userEmail,
                            fromName: emailData.companyName,
                            userId: emailData.userId
                        });
                        console.log('📧 Confirmation sent to', emailData.customerEmail);
                    } catch (confErr) {
                        console.error('❌ Failed to send confirmation:', confErr.message);
                    }
                }
                
                // Send notification to technician
                if (emailData.userEmail) {
                    try {
                        await emailService.sendNewBookingNotification({
                            technicianEmail: emailData.userEmail,
                            customerName: emailData.customerName,
                            customerEmail: emailData.customerEmail,
                            customerPhone: emailData.customerPhone,
                            appointmentDate: emailData.date,
                            appointmentTime: emailData.time,
                            serviceName: emailData.serviceName,
                            notes: emailData.customerNotes,
                            companyName: emailData.companyName
                        });
                        console.log('📧 Notification sent to', emailData.userEmail);
                    } catch (notifErr) {
                        console.error('❌ Failed to send notification:', notifErr.message);
                    }
                }
            });
        }
        
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden bij het boeken' });
    }
});

// ==================== HELPER FUNCTIES ====================

/**
 * Normaliseer werkuren naar uniform formaat
 * Ondersteunt:
 * - { monday: {enabled, start, end}, ... } (gewenst formaat)
 * - { 0: {available, start, end}, 1: {...}, ... } (settings.js formaat)
 * - { hours: {start, end}, days: [1,2,3,4,5] } (oud formaat)
 */
function normalizeWorkingHours(input) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const defaults = getDefaultWorkingHours();
    
    if (!input) {
        return defaults;
    }
    
    // Check of het al het juiste formaat heeft (monday, tuesday, ...)
    if (input.monday !== undefined) {
        return input;
    }
    
    // Check voor { 0: {...}, 1: {...}, ... } formaat van settings.js
    if (input['0'] !== undefined || input[0] !== undefined) {
        const normalized = {};
        for (let i = 0; i < 7; i++) {
            const dayData = input[i] || input[String(i)];
            if (dayData) {
                normalized[dayNames[i]] = {
                    enabled: dayData.available !== undefined ? dayData.available : dayData.enabled,
                    start: dayData.start || '09:00',
                    end: dayData.end || '17:00'
                };
            } else {
                normalized[dayNames[i]] = defaults[dayNames[i]];
            }
        }
        return normalized;
    }
    
    // Check voor { hours: {...}, days: [...] } oud formaat
    if (input.hours && input.days) {
        const normalized = {};
        const defaultStart = input.hours.start || '09:00';
        const defaultEnd = input.hours.end || '17:00';
        
        for (let i = 0; i < 7; i++) {
            normalized[dayNames[i]] = {
                enabled: input.days.includes(i),
                start: defaultStart,
                end: defaultEnd
            };
        }
        return normalized;
    }
    
    // Fallback
    return defaults;
}

function getDefaultWorkingHours() {
    return {
        monday: { enabled: true, start: '09:00', end: '17:00' },
        tuesday: { enabled: true, start: '09:00', end: '17:00' },
        wednesday: { enabled: true, start: '09:00', end: '17:00' },
        thursday: { enabled: true, start: '09:00', end: '17:00' },
        friday: { enabled: true, start: '09:00', end: '17:00' },
        saturday: { enabled: false, start: '09:00', end: '13:00' },
        sunday: { enabled: false, start: '09:00', end: '13:00' }
    };
}

function generateTimeSlots(date, startHour, endHour, duration, bufferBefore, bufferAfter, existingAppointments, defaultTravelTime = 30) {
    const slots = [];
    
    // Parse start en eind uren
    const [startH, startM] = startHour.split(':').map(Number);
    const [endH, endM] = endHour.split(':').map(Number);
    
    // Start tijd in minuten - eerste slot moet ruimte hebben voor reistijd
    // Als werkdag start om 09:00 en reistijd is 30 min, dan is eerste aankomst 09:30
    let currentMinutes = startH * 60 + startM + defaultTravelTime;
    const endMinutes = endH * 60 + endM;
    
    while (currentMinutes + duration <= endMinutes) {
        const slotStart = formatMinutesToTime(currentMinutes);
        const slotEnd = formatMinutesToTime(currentMinutes + duration);
        
        // Check overlap met bestaande afspraken (inclusief hun reistijd)
        const hasConflict = existingAppointments.some(apt => {
            // Gebruik travelStartTime als die bestaat, anders start
            const aptStartTime = apt.travelStartTime || apt.start;
            const aptStart = new Date(aptStartTime).toTimeString().slice(0, 5);
            const aptEnd = new Date(apt.end).toTimeString().slice(0, 5);
            
            // Onze reistijd begint defaultTravelTime minuten voor aankomst
            const ourTravelStart = formatMinutesToTime(currentMinutes - defaultTravelTime);
            
            return timesOverlap(ourTravelStart, slotEnd, aptStart, aptEnd);
        });
        
        if (!hasConflict) {
            slots.push({
                time: slotStart,
                endTime: slotEnd,
                display: `${slotStart} - ${slotEnd}`
            });
        }
        
        // Volgende slot (30 min intervals)
        currentMinutes += 30;
    }
    
    return slots;
}

function formatMinutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function timesOverlap(start1, end1, start2, end2) {
    return start1 < end2 && end1 > start2;
}

function calculateEndTime(startTime, durationMinutes) {
    const start = new Date(startTime);
    start.setMinutes(start.getMinutes() + durationMinutes);
    return start.toISOString().slice(0, 16);
}

async function checkSlotAvailable(userId, date, time, duration) {
    const appointments = await appointmentStore.getAppointmentsForDay(userId, date);
    const slotStart = time;
    const slotEnd = formatMinutesToTime(
        parseInt(time.split(':')[0]) * 60 + parseInt(time.split(':')[1]) + duration
    );
    
    const hasConflict = appointments.some(apt => {
        const aptStart = new Date(apt.start).toTimeString().slice(0, 5);
        const aptEnd = new Date(apt.end).toTimeString().slice(0, 5);
        return timesOverlap(slotStart, slotEnd, aptStart, aptEnd);
    });
    
    return { available: !hasConflict };
}

// ==================== SMART SUGGESTIONS ====================
// GET /api/book/:slug/smart-suggestions - Intelligente tijdslot suggesties
// Gebaseerd op: reistijd optimalisatie, geografische nabijheid, beschikbaarheid
router.get('/:slug/smart-suggestions', async (req, res) => {
    try {
        const { slug } = req.params;
        const { serviceId, customerAddress, customerCity, customerPostalCode } = req.query;
        
        if (!serviceId) {
            return res.status(400).json({ error: 'Dienst is verplicht' });
        }
        
        // Vind de user
        const user = await userStore.getUserByBookingSlug(slug);
        if (!user) {
            return res.status(404).json({ error: 'Niet gevonden' });
        }
        
        const settings = await userStore.getBookingSettings(user.id);
        if (!settings.enabled) {
            return res.status(404).json({ error: 'Niet beschikbaar' });
        }
        
        // Haal de dienst op
        const service = await serviceStore.getService(user.id, serviceId);
        if (!service) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        // Haal bedrijfsgegevens en werkuren op
        const company = await companyStore.getCompanySettings(user.id);
        const workingHours = normalizeWorkingHours(company?.workingHours);
        
        // Haal travel settings op
        const travelSettings = await companyStore.getTravelSettings(user.id);
        
        // Bouw klant locatie string
        const customerLocation = [customerAddress, customerPostalCode, customerCity]
            .filter(Boolean).join(', ');
        
        // Bouw bedrijfs origin adres
        const originAddress = company?.travelOrigin || 
            [company?.address?.street, company?.address?.postalCode, company?.address?.city].filter(Boolean).join(', ');
        
        // Check reistijd limiet als travel settings enabled zijn
        if (travelSettings.enabled && travelSettings.maxBookingTravelMinutes && customerLocation && originAddress) {
            try {
                const travelInfo = await calculateTravelTime(originAddress, customerLocation);
                
                if (travelInfo && travelInfo.duration > travelSettings.maxBookingTravelMinutes) {
                    console.log(`🚗 Customer too far: ${travelInfo.duration} min > ${travelSettings.maxBookingTravelMinutes} min limit`);
                    return res.json({
                        success: false,
                        tooFar: true,
                        travelTime: travelInfo.duration,
                        travelDistance: travelInfo.distance,
                        maxAllowed: travelSettings.maxBookingTravelMinutes,
                        message: travelSettings.farLocationMessage || 'For locations further away, please contact us directly to schedule an appointment.',
                        contactEmail: company?.email,
                        contactPhone: company?.phone
                    });
                }
                
                console.log(`🚗 Customer within range: ${travelInfo.duration} min <= ${travelSettings.maxBookingTravelMinutes} min limit`);
            } catch (travelErr) {
                console.log('⚠️ Could not calculate travel time:', travelErr.message);
                // Continue without travel check if calculation fails
            }
        }
        
        // Datum range: van morgen tot maxAdvanceDays
        const now = new Date();
        const startDate = new Date(now.getTime() + (settings.minAdvanceHours * 60 * 60 * 1000));
        const endDate = new Date(now.getTime() + (settings.maxAdvanceDays * 24 * 60 * 60 * 1000));
        
        // Haal alle afspraken in deze periode op
        const allAppointments = await appointmentStore.getAppointmentsByDateRange(
            user.id, 
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        );
        
        // Genereer suggesties met travel settings
        const suggestions = await generateSmartSuggestions({
            customerLocation,
            service,
            workingHours,
            existingAppointments: allAppointments,
            startDate,
            endDate,
            maxSuggestions: 5,
            maxBetweenTravelMinutes: travelSettings.enabled ? travelSettings.maxBetweenTravelMinutes : null,
            originAddress
        });
        
        res.json({
            success: true,
            suggestions,
            message: suggestions.length === 0 
                ? 'Geen beschikbare tijden gevonden in de komende periode' 
                : `${suggestions.length} optimale tijden gevonden`
        });
        
    } catch (error) {
        console.error('Smart suggestions error:', error);
        res.status(500).json({ error: 'Fout bij genereren suggesties' });
    }
});

/**
 * Genereer slimme tijdslot suggesties
 * Prioriteit: 1) Direct voor/na bestaande afspraak in zelfde regio
 *             2) Op dag met andere afspraken in regio
 *             3) Eerste beschikbare slot
 */
async function generateSmartSuggestions(options) {
    const {
        customerLocation,
        service,
        workingHours,
        existingAppointments,
        startDate,
        endDate,
        maxSuggestions = 5
    } = options;
    
    const suggestions = [];
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    // Groepeer afspraken per dag en bereken afstand tot klant
    const appointmentsByDate = {};
    for (const apt of existingAppointments) {
        const date = new Date(apt.start).toISOString().split('T')[0];
        if (!appointmentsByDate[date]) {
            appointmentsByDate[date] = [];
        }
        
        // Bereken geschatte afstand als we locaties hebben
        let distanceScore = 100; // Default: ver weg
        if (customerLocation && apt.location) {
            distanceScore = estimateLocationProximity(customerLocation, apt.location);
        }
        
        appointmentsByDate[date].push({
            ...apt,
            distanceScore
        });
    }
    
    // Sorteer afspraken per dag op tijd
    for (const date of Object.keys(appointmentsByDate)) {
        appointmentsByDate[date].sort((a, b) => new Date(a.start) - new Date(b.start));
    }
    
    // Loop door dagen en vind optimale slots
    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    
    while (currentDate <= endDate && suggestions.length < maxSuggestions * 2) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayIndex = currentDate.getDay();
        const dayName = dayNames[dayIndex];
        const dayHours = workingHours[dayName];
        
        // Skip als dag niet beschikbaar is
        if (!dayHours || !dayHours.enabled) {
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
        }
        
        const dayAppointments = appointmentsByDate[dateStr] || [];
        
        // Vind slots voor deze dag
        const daySlots = findOptimalSlotsForDay({
            date: dateStr,
            dayHours,
            service,
            dayAppointments,
            customerLocation
        });
        
        suggestions.push(...daySlots);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Sorteer op score (lager = beter) en pak top suggesties
    suggestions.sort((a, b) => a.score - b.score);
    
    return suggestions.slice(0, maxSuggestions).map(s => ({
        date: s.date,
        time: s.time,
        endTime: s.endTime,
        displayDate: formatDisplayDate(s.date),
        displayTime: `${s.time} - ${s.endTime}`,
        reason: s.reason,
        efficiency: s.efficiency
    }));
}

/**
 * Vind optimale slots voor een specifieke dag
 */
function findOptimalSlotsForDay(options) {
    const { date, dayHours, service, dayAppointments, customerLocation } = options;
    const slots = [];
    
    const [startH, startM] = dayHours.start.split(':').map(Number);
    const [endH, endM] = dayHours.end.split(':').map(Number);
    const dayStartMinutes = startH * 60 + startM;
    const dayEndMinutes = endH * 60 + endM;
    
    // Default reistijd (kan later via API berekend worden)
    const defaultTravelTime = 30;
    
    // Als er afspraken zijn op deze dag, zoek slots direct voor/na
    if (dayAppointments.length > 0) {
        for (let i = 0; i < dayAppointments.length; i++) {
            const apt = dayAppointments[i];
            const aptStart = new Date(apt.start);
            const aptEnd = new Date(apt.end);
            const aptStartMinutes = aptStart.getHours() * 60 + aptStart.getMinutes();
            const aptEndMinutes = aptEnd.getHours() * 60 + aptEnd.getMinutes();
            
            // Slot VOOR deze afspraak
            const beforeSlotEnd = aptStartMinutes - defaultTravelTime;
            const beforeSlotStart = beforeSlotEnd - service.duration;
            
            if (beforeSlotStart >= dayStartMinutes + defaultTravelTime) {
                const hasConflict = dayAppointments.some((other, idx) => {
                    if (idx === i) return false;
                    const otherEnd = new Date(other.end);
                    const otherEndMinutes = otherEnd.getHours() * 60 + otherEnd.getMinutes();
                    return beforeSlotStart < otherEndMinutes + defaultTravelTime;
                });
                
                if (!hasConflict) {
                    const proximityScore = apt.distanceScore || 50;
                    slots.push({
                        date,
                        time: formatMinutesToTime(beforeSlotStart),
                        endTime: formatMinutesToTime(beforeSlotEnd),
                        score: proximityScore + 10, // Bonus voor aansluiting
                        reason: apt.distanceScore < 30 
                            ? `Direct before appointment in same area`
                            : `Efficient: before another appointment`,
                        efficiency: 'high'
                    });
                }
            }
            
            // Slot NA deze afspraak
            const afterSlotStart = aptEndMinutes + defaultTravelTime;
            const afterSlotEnd = afterSlotStart + service.duration;
            
            if (afterSlotEnd <= dayEndMinutes) {
                const nextApt = dayAppointments[i + 1];
                let hasConflict = false;
                
                if (nextApt) {
                    const nextStart = new Date(nextApt.start);
                    const nextStartMinutes = nextStart.getHours() * 60 + nextStart.getMinutes();
                    hasConflict = afterSlotEnd + defaultTravelTime > nextStartMinutes;
                }
                
                if (!hasConflict) {
                    const proximityScore = apt.distanceScore || 50;
                    slots.push({
                        date,
                        time: formatMinutesToTime(afterSlotStart),
                        endTime: formatMinutesToTime(afterSlotEnd),
                        score: proximityScore + 10,
                        reason: apt.distanceScore < 30 
                            ? `Direct after appointment in same area`
                            : `Efficient: after another appointment`,
                        efficiency: 'high'
                    });
                }
            }
        }
    }
    
    // Als geen optimale slots gevonden, voeg eerste beschikbare toe
    if (slots.length === 0) {
        const firstSlotStart = dayStartMinutes + defaultTravelTime;
        const firstSlotEnd = firstSlotStart + service.duration;
        
        if (firstSlotEnd <= dayEndMinutes) {
            const hasConflict = dayAppointments.some(apt => {
                const aptStart = new Date(apt.start);
                const aptStartMinutes = aptStart.getHours() * 60 + aptStart.getMinutes();
                return firstSlotEnd + defaultTravelTime > aptStartMinutes;
            });
            
            if (!hasConflict) {
                slots.push({
                    date,
                    time: formatMinutesToTime(firstSlotStart),
                    endTime: formatMinutesToTime(firstSlotEnd),
                    score: 100, // Lagere prioriteit
                    reason: 'First available slot',
                    efficiency: 'normal'
                });
            }
        }
    }
    
    return slots;
}

/**
 * Schat nabijheid tussen twee locaties op basis van postcode/stad
 * Retourneert score: 0 = zelfde locatie, 100 = ver weg
 */
function estimateLocationProximity(location1, location2) {
    if (!location1 || !location2) return 50;
    
    const loc1 = location1.toLowerCase();
    const loc2 = location2.toLowerCase();
    
    // Extract postcode (NL format: 1234 AB)
    const pcRegex = /(\d{4})\s*[a-z]{2}/gi;
    const pc1Match = loc1.match(pcRegex);
    const pc2Match = loc2.match(pcRegex);
    
    if (pc1Match && pc2Match) {
        const pc1 = parseInt(pc1Match[0].replace(/\D/g, ''));
        const pc2 = parseInt(pc2Match[0].replace(/\D/g, ''));
        
        // Zelfde postcode cijfers = zeer dichtbij
        const diff = Math.abs(pc1 - pc2);
        if (diff === 0) return 5;
        if (diff <= 10) return 15;
        if (diff <= 50) return 30;
        if (diff <= 100) return 50;
        return 70;
    }
    
    // Fallback: check of steden overeenkomen
    const cities = ['amsterdam', 'rotterdam', 'utrecht', 'den haag', 'eindhoven', 
                    'tilburg', 'groningen', 'almere', 'breda', 'nijmegen'];
    
    for (const city of cities) {
        if (loc1.includes(city) && loc2.includes(city)) {
            return 20; // Zelfde stad
        }
    }
    
    return 60; // Onbekend
}

/**
 * Format datum voor weergave
 */
function formatDisplayDate(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    
    return `${dayName} ${day} ${month}`;
}

module.exports = router;
