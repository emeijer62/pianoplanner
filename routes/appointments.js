/**
 * Appointment Routes - Database versie
 * Afspraken beheer per gebruiker
 */

const express = require('express');
const router = express.Router();
const appointmentStore = require('../utils/appointmentStore');
const { requireAuth } = require('../middleware/auth');

// Alle routes vereisen authenticatie
router.use(requireAuth);

// ==================== AFSPRAKEN CRUD ====================

// Haal alle afspraken op
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { start, end } = req.query;
        
        let appointments;
        
        if (start && end) {
            appointments = await appointmentStore.getAppointmentsByDateRange(userId, start, end);
        } else {
            appointments = await appointmentStore.getAllAppointments(userId);
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
    } catch (error) {
        console.error('Error getting appointments:', error);
        res.status(500).json({ error: 'Kon afspraken niet ophalen' });
    }
});

// Haal komende afspraken op
router.get('/upcoming', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const limit = parseInt(req.query.limit) || 10;
        
        const appointments = await appointmentStore.getUpcomingAppointments(userId, limit);
        
        res.json({ appointments });
    } catch (error) {
        console.error('Error getting upcoming appointments:', error);
        res.status(500).json({ error: 'Kon afspraken niet ophalen' });
    }
});

// Haal afspraken voor een specifieke dag
router.get('/day/:date', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const appointments = await appointmentStore.getAppointmentsForDay(userId, req.params.date);
        
        res.json({ appointments });
    } catch (error) {
        console.error('Error getting day appointments:', error);
        res.status(500).json({ error: 'Kon afspraken niet ophalen' });
    }
});

// Haal afspraken per klant
router.get('/customer/:customerId', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const appointments = await appointmentStore.getAppointmentsByCustomer(userId, req.params.customerId);
        
        res.json({ appointments });
    } catch (error) {
        console.error('Error getting customer appointments:', error);
        res.status(500).json({ error: 'Kon afspraken niet ophalen' });
    }
});

// Haal één afspraak op
router.get('/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const appointment = await appointmentStore.getAppointment(userId, req.params.id);
        
        if (!appointment) {
            return res.status(404).json({ error: 'Afspraak niet gevonden' });
        }
        
        res.json(appointment);
    } catch (error) {
        console.error('Error getting appointment:', error);
        res.status(500).json({ error: 'Kon afspraak niet ophalen' });
    }
});

// Maak nieuwe afspraak
router.post('/', async (req, res) => {
    try {
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
        
        const appointment = await appointmentStore.createAppointment(userId, {
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
    } catch (error) {
        console.error('Error creating appointment:', error);
        res.status(500).json({ error: 'Kon afspraak niet aanmaken' });
    }
});

// Update afspraak
router.put('/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const appointmentId = req.params.id;
        
        const existing = await appointmentStore.getAppointment(userId, appointmentId);
        if (!existing) {
            return res.status(404).json({ error: 'Afspraak niet gevonden' });
        }
        
        const updated = await appointmentStore.updateAppointment(userId, appointmentId, req.body);
        
        console.log(`📅 Afspraak bijgewerkt: ${updated.title}`);
        res.json(updated);
    } catch (error) {
        console.error('Error updating appointment:', error);
        res.status(500).json({ error: 'Kon afspraak niet bijwerken' });
    }
});

// Verwijder afspraak
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const appointmentId = req.params.id;
        
        const existing = await appointmentStore.getAppointment(userId, appointmentId);
        if (!existing) {
            return res.status(404).json({ error: 'Afspraak niet gevonden' });
        }
        
        await appointmentStore.deleteAppointment(userId, appointmentId);
        
        console.log(`🗑️ Afspraak verwijderd: ${existing.title}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).json({ error: 'Kon afspraak niet verwijderen' });
    }
});

// Markeer als voltooid
router.post('/:id/complete', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const appointmentId = req.params.id;
        const { notes } = req.body;
        
        const existing = await appointmentStore.getAppointment(userId, appointmentId);
        if (!existing) {
            return res.status(404).json({ error: 'Afspraak niet gevonden' });
        }
        
        const updated = await appointmentStore.updateAppointment(userId, appointmentId, {
            status: 'completed',
            description: notes ? `${existing.description || ''}\n\nAfgerond: ${notes}` : existing.description
        });
        
        res.json(updated);
    } catch (error) {
        console.error('Error completing appointment:', error);
        res.status(500).json({ error: 'Kon afspraak niet afronden' });
    }
});

// Annuleer afspraak
router.post('/:id/cancel', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const appointmentId = req.params.id;
        const { reason } = req.body;
        
        const existing = await appointmentStore.getAppointment(userId, appointmentId);
        if (!existing) {
            return res.status(404).json({ error: 'Afspraak niet gevonden' });
        }
        
        const updated = await appointmentStore.updateAppointment(userId, appointmentId, {
            status: 'cancelled',
            description: reason ? `${existing.description || ''}\n\nGeannuleerd: ${reason}` : existing.description
        });
        
        res.json(updated);
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        res.status(500).json({ error: 'Kon afspraak niet annuleren' });
    }
});

// Statistics
router.get('/stats/overview', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const stats = await appointmentStore.getAppointmentStats(userId);
        res.json(stats);
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Kon statistieken niet ophalen' });
    }
});

module.exports = router;
