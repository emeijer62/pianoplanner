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
const { calculateTravelTime } = require('../utils/travelTime');

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
        if (settings.allowedServices && settings.allowedServices.length > 0) {
            services = services.filter(s => settings.allowedServices.includes(s.id));
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
                city: company?.city
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
        const workingHours = company?.workingHours || getDefaultWorkingHours();
        
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
        
        // Bereken reistijd als we beide adressen hebben
        let travelInfo = null;
        if (originAddress && customerAddress) {
            try {
                travelInfo = await calculateTravelTime(originAddress, customerAddress);
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
        
        // TODO: Stuur bevestigingsmail naar klant
        
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
        
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden bij het boeken' });
    }
});

// ==================== HELPER FUNCTIES ====================

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

module.exports = router;
