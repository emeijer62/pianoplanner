const express = require('express');
const router = express.Router();
const appointmentStore = require('../utils/appointmentStore');
const { requireAuth } = require('../middleware/auth');

// Alle routes vereisen authenticatie
router.use(requireAuth);

// ==================== AFSPRAKEN CRUD ====================

// Haal alle afspraken op
router.get('/', (req, res) => {
    const userId = req.session.user.id;
    const { start, end } = req.query;
    
    let appointments;
    
    if (start && end) {
        appointments = appointmentStore.getAppointmentsByDateRange(userId, start, end);
    } else {
        appointments = appointmentStore.getAllAppointments(userId);
    }
    
    // Converteer naar Google Calendar-achtig formaat voor compatibiliteit
    const events = appointments.map(apt => ({
        id: apt.id,
        summary: apt.title,
        description: apt.description,
        location: apt.location,
        start: apt.allDay 
            ? { date: apt.start.split('T')[0] }
            : { dateTime: apt.start },
        end: apt.allDay
            ? { date: apt.end.split('T')[0] }
            : { dateTime: apt.end },
        // Extra PianoPlanner velden
        customerId: apt.customerId,
        customerName: apt.customerName,
        serviceId: apt.serviceId,
        serviceName: apt.serviceName,
        pianoId: apt.pianoId,
        pianoBrand: apt.pianoBrand,
        pianoModel: apt.pianoModel,
        status: apt.status,
        colorId: apt.color,
        source: 'local'
    }));
    
    res.json(events);
});

// Haal komende afspraken op
router.get('/upcoming', (req, res) => {
    const userId = req.session.user.id;
    const limit = parseInt(req.query.limit) || 10;
    
    const appointments = appointmentStore.getUpcomingAppointments(userId, limit);
    
    res.json({ appointments });
});

// Haal afspraken voor een specifieke dag
router.get('/day/:date', (req, res) => {
    const userId = req.session.user.id;
    const appointments = appointmentStore.getAppointmentsForDay(userId, req.params.date);
    
    res.json({ appointments });
});

// Haal één afspraak op
router.get('/:id', (req, res) => {
    const userId = req.session.user.id;
    const appointment = appointmentStore.getAppointment(userId, req.params.id);
    
    if (!appointment) {
        return res.status(404).json({ error: 'Afspraak niet gevonden' });
    }
    
    res.json(appointment);
});

// Maak nieuwe afspraak
router.post('/', (req, res) => {
    const userId = req.session.user.id;
    const { 
        title, description, location, 
        start, end, allDay,
        customerId, customerName,
        serviceId, serviceName,
        pianoId, pianoBrand, pianoModel,
        color
    } = req.body;
    
    if (!title) {
        return res.status(400).json({ error: 'Titel is verplicht' });
    }
    
    if (!start || !end) {
        return res.status(400).json({ error: 'Start en eind tijd zijn verplicht' });
    }
    
    const appointment = appointmentStore.createAppointment(userId, {
        title,
        description,
        location,
        start,
        end,
        allDay,
        customerId,
        customerName,
        serviceId,
        serviceName,
        pianoId,
        pianoBrand,
        pianoModel,
        color
    });
    
    console.log(`📅 Nieuwe afspraak aangemaakt: ${title}`);
    res.status(201).json(appointment);
});

// Update afspraak
router.put('/:id', (req, res) => {
    const userId = req.session.user.id;
    const appointmentId = req.params.id;
    
    const existing = appointmentStore.getAppointment(userId, appointmentId);
    if (!existing) {
        return res.status(404).json({ error: 'Afspraak niet gevonden' });
    }
    
    const updated = appointmentStore.updateAppointment(userId, appointmentId, req.body);
    
    console.log(`📅 Afspraak bijgewerkt: ${updated.title}`);
    res.json(updated);
});

// Verwijder afspraak
router.delete('/:id', (req, res) => {
    const userId = req.session.user.id;
    const appointmentId = req.params.id;
    
    const existing = appointmentStore.getAppointment(userId, appointmentId);
    if (!existing) {
        return res.status(404).json({ error: 'Afspraak niet gevonden' });
    }
    
    appointmentStore.deleteAppointment(userId, appointmentId);
    
    console.log(`🗑️ Afspraak verwijderd: ${existing.title}`);
    res.json({ success: true });
});

// Markeer als voltooid
router.post('/:id/complete', (req, res) => {
    const userId = req.session.user.id;
    const appointmentId = req.params.id;
    const { notes } = req.body;
    
    const updated = appointmentStore.completeAppointment(userId, appointmentId, notes);
    
    if (!updated) {
        return res.status(404).json({ error: 'Afspraak niet gevonden' });
    }
    
    res.json(updated);
});

// Annuleer afspraak
router.post('/:id/cancel', (req, res) => {
    const userId = req.session.user.id;
    const appointmentId = req.params.id;
    const { reason } = req.body;
    
    const updated = appointmentStore.cancelAppointment(userId, appointmentId, reason);
    
    if (!updated) {
        return res.status(404).json({ error: 'Afspraak niet gevonden' });
    }
    
    res.json(updated);
});

// Haal afspraken per klant
router.get('/customer/:customerId', (req, res) => {
    const userId = req.session.user.id;
    const appointments = appointmentStore.getAppointmentsByCustomer(userId, req.params.customerId);
    
    res.json({ appointments });
});

// Haal afspraken per piano
router.get('/piano/:pianoId', (req, res) => {
    const userId = req.session.user.id;
    const appointments = appointmentStore.getAppointmentsByPiano(userId, req.params.pianoId);
    
    res.json({ appointments });
});

module.exports = router;
