/**
 * Appointment Routes - Database versie
 * Afspraken beheer per gebruiker
 */

const express = require('express');
const router = express.Router();
const appointmentStore = require('../utils/appointmentStore');
const { requireAuth } = require('../middleware/auth');
const emailService = require('../utils/emailService');
const { getDb, dbGet, dbRun, dbAll } = require('../utils/database');
const { google } = require('googleapis');
const userStore = require('../utils/userStore');

// Alle routes vereisen authenticatie
router.use(requireAuth);

// ==================== AFSPRAKEN CRUD ====================

// Haal alle afspraken op
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { start, end } = req.query;
        
        console.log(`📅 GET /appointments for user ${userId}, range: ${start} - ${end}`);
        
        let appointments;
        
        if (start && end) {
            appointments = await appointmentStore.getAppointmentsByDateRange(userId, start, end);
        } else {
            appointments = await appointmentStore.getAllAppointments(userId);
        }
        
        console.log(`📅 Found ${appointments.length} appointments in database`);
        
        // Converteer naar Google Calendar-achtig formaat voor compatibiliteit
        const events = appointments.map(apt => {
            // Skip appointments without valid dates
            if (!apt.start || !apt.end) {
                console.log(`⚠️ Skipping appointment ${apt.id} - missing start or end date`);
                return null;
            }
            
            return {
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
                // Reistijd info
                travelTimeMinutes: apt.travelTimeMinutes,
                travelDistanceKm: apt.travelDistanceKm,
                travelStartTime: apt.travelStartTime,
                originAddress: apt.originAddress,
                source: 'local'
            };
        }).filter(Boolean);  // Remove null entries
        
        console.log(`📅 Returning ${events.length} valid events`);
        res.json(events);
    } catch (error) {
        console.error('Error getting appointments:', error);
        res.status(500).json({ error: 'Kon afspraken niet ophalen' });
    }
});

// Cleanup duplicate appointments - MUST BE BEFORE /:id routes!
router.delete('/cleanup-duplicates', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Haal alle afspraken op
        const appointments = await dbAll(
            'SELECT id, title, start_time, end_time, google_event_id, created_at FROM appointments WHERE user_id = ? ORDER BY created_at ASC',
            [userId]
        );
        
        // Groepeer op titel + start + end
        const groups = {};
        for (const apt of appointments) {
            const key = `${apt.title}|${apt.start_time}|${apt.end_time}`;
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(apt);
        }
        
        // Vind duplicaten en bepaal welke te verwijderen
        const toDelete = [];
        for (const [key, group] of Object.entries(groups)) {
            if (group.length > 1) {
                // Sorteer: behoud degene MET googleEventId, of de oudste
                group.sort((a, b) => {
                    // Prioriteit aan degene met google_event_id
                    if (a.google_event_id && !b.google_event_id) return -1;
                    if (!a.google_event_id && b.google_event_id) return 1;
                    // Anders: oudste eerst (behouden)
                    return new Date(a.created_at) - new Date(b.created_at);
                });
                
                // Verwijder alle behalve de eerste (beste)
                for (let i = 1; i < group.length; i++) {
                    toDelete.push(group[i]);
                }
            }
        }
        
        if (toDelete.length === 0) {
            return res.json({ success: true, message: 'Geen duplicaten gevonden', deleted: 0 });
        }
        
        // Verwijder duplicaten
        const ids = toDelete.map(d => d.id);
        const placeholders = ids.map(() => '?').join(',');
        await dbRun(
            `DELETE FROM appointments WHERE id IN (${placeholders})`,
            ids
        );
        
        console.log(`🧹 User ${userId} cleanup: ${toDelete.length} duplicate appointments deleted`);
        
        res.json({ 
            success: true, 
            message: `${toDelete.length} duplicaten verwijderd`,
            deleted: toDelete.length,
            deletedAppointments: toDelete.map(d => ({ id: d.id, title: d.title, start: d.start_time }))
        });
    } catch (error) {
        console.error('Error cleaning duplicate appointments:', error);
        res.status(500).json({ error: 'Cleanup failed: ' + error.message });
    }
});

// Cleanup broken appointments (missing start/end time) - MUST BE BEFORE /:id routes!
router.delete('/cleanup-broken', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Find broken records for this user
        const broken = await dbAll(
            'SELECT id, title FROM appointments WHERE user_id = ? AND (start_time IS NULL OR end_time IS NULL)',
            [userId]
        );
        
        if (broken.length === 0) {
            return res.json({ success: true, message: 'No broken appointments found', deleted: 0 });
        }
        
        // Delete broken records
        const result = await dbRun(
            'DELETE FROM appointments WHERE user_id = ? AND (start_time IS NULL OR end_time IS NULL)',
            [userId]
        );
        
        console.log(`🧹 User ${userId} cleanup: ${result.changes} broken appointments deleted`);
        
        res.json({ 
            success: true, 
            message: `Deleted ${result.changes} broken appointments`,
            deleted: result.changes,
            deletedIds: broken.map(b => b.id)
        });
    } catch (error) {
        console.error('Error cleaning broken appointments:', error);
        res.status(500).json({ error: 'Cleanup failed: ' + error.message });
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
            color,
            sendConfirmation  // Expliciet vinkje van gebruiker
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
        
        // Stuur response DIRECT terug
        res.status(201).json(appointment);
        
        // Send confirmation email ASYNC als vinkje is gezet
        if (emailService.isEmailConfigured() && customerId && sendConfirmation) {
            const emailContext = {
                userId,
                customerId,
                customerName,
                serviceName,
                title,
                description,
                start,
                userEmail: req.session.user.email,
                userName: req.session.user.name
            };
            
            setImmediate(async () => {
                try {
                    const customer = await dbGet(
                        'SELECT email, name FROM customers WHERE id = ? AND user_id = ?',
                        [emailContext.customerId, emailContext.userId]
                    );
                    
                    if (customer?.email) {
                        const company = await dbGet(
                            'SELECT name FROM company_settings WHERE user_id = ?',
                            [emailContext.userId]
                        );
                        
                        const startDate = new Date(emailContext.start);
                        const appointmentDate = startDate.toISOString().split('T')[0];
                        const appointmentTime = startDate.toLocaleTimeString('en-US', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: false 
                        });
                        
                        await emailService.sendAppointmentConfirmation({
                            customerEmail: customer.email,
                            customerName: customer.name || emailContext.customerName,
                            appointmentDate,
                            appointmentTime,
                            serviceName: emailContext.serviceName || emailContext.title,
                            companyName: company?.name || 'PianoPlanner',
                            notes: emailContext.description,
                            replyTo: emailContext.userEmail,
                            fromName: company?.name || emailContext.userName || 'PianoPlanner',
                            userId: emailContext.userId
                        });
                        
                        console.log(`📧 Confirmation sent to ${customer.email}`);
                    }
                } catch (emailError) {
                    console.error('❌ Failed to send confirmation email:', emailError.message);
                }
            });
        }
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
        
        // Als de afspraak een Google Calendar ID heeft, verwijder ook uit Google
        if (existing.googleEventId) {
            try {
                // Haal user op voor Google tokens
                const user = await userStore.getUser(userId);
                const syncSettings = await userStore.getCalendarSync(userId);
                
                if (user?.tokens && syncSettings?.googleCalendarId) {
                    const googleTokens = typeof user.tokens === 'string' 
                        ? JSON.parse(user.tokens) 
                        : user.tokens;
                    
                    if (googleTokens?.access_token) {
                        const oauth2Client = new google.auth.OAuth2(
                            process.env.GOOGLE_CLIENT_ID,
                            process.env.GOOGLE_CLIENT_SECRET,
                            process.env.GOOGLE_REDIRECT_URI
                        );
                        oauth2Client.setCredentials(googleTokens);
                        
                        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
                        
                        await calendar.events.delete({
                            calendarId: syncSettings.googleCalendarId || 'primary',
                            eventId: existing.googleEventId
                        });
                        
                        console.log(`🗑️ Google Calendar event verwijderd: ${existing.googleEventId}`);
                    }
                }
            } catch (googleErr) {
                // Log maar ga door - lokale verwijdering is belangrijker
                console.warn(`⚠️ Kon Google event niet verwijderen: ${googleErr.message}`);
            }
        }
        
        // Als de afspraak een Apple Calendar ID heeft, verwijder ook uit Apple
        if (existing.apple_event_id || existing.apple_event_url) {
            try {
                const appleCredentials = await userStore.getAppleCalendarCredentials(userId);
                const appleSyncSettings = await userStore.getAppleCalendarSync(userId);
                
                if (appleCredentials?.connected && appleCredentials?.appPassword && appleSyncSettings?.appleCalendarUrl) {
                    const fetch = require('node-fetch');
                    
                    // Build event URL
                    const eventUrl = existing.apple_event_url || 
                        `${appleSyncSettings.appleCalendarUrl}${existing.apple_event_id}.ics`;
                    
                    const authHeader = Buffer.from(`${appleCredentials.appleId}:${appleCredentials.appPassword}`).toString('base64');
                    
                    const response = await fetch(eventUrl, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Basic ${authHeader}`
                        }
                    });
                    
                    if (response.ok || response.status === 204 || response.status === 404) {
                        console.log(`🗑️ Apple Calendar event verwijderd: ${eventUrl}`);
                    } else {
                        console.warn(`⚠️ Apple delete response: ${response.status}`);
                    }
                }
            } catch (appleErr) {
                // Log maar ga door - lokale verwijdering is belangrijker
                console.warn(`⚠️ Kon Apple event niet verwijderen: ${appleErr.message}`);
            }
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

// ==================== ROUTE OPTIMALISATIE ====================

const { optimizeRoute, planDayRoute, calculateDistanceMatrix } = require('../utils/travelTime');

// Optimaliseer route voor een specifieke dag
router.post('/optimize-route', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { date } = req.body;
        
        if (!date) {
            return res.status(400).json({ error: 'Datum is verplicht' });
        }
        
        // Haal bedrijfsadres op als startpunt
        const user = await userStore.getUser(userId);
        const companyAddress = user?.company?.address || user?.settings?.companyAddress;
        
        if (!companyAddress) {
            return res.status(400).json({ 
                error: 'Geen bedrijfsadres ingesteld. Stel eerst een bedrijfsadres in bij instellingen.' 
            });
        }
        
        // Haal afspraken voor deze dag
        const startOfDay = `${date}T00:00:00`;
        const endOfDay = `${date}T23:59:59`;
        const appointments = await appointmentStore.getAppointmentsByDateRange(userId, startOfDay, endOfDay);
        
        // Filter alleen afspraken met locatie
        const appointmentsWithLocation = appointments.filter(apt => apt.location && apt.location.trim());
        
        if (appointmentsWithLocation.length < 2) {
            return res.json({
                success: true,
                message: 'Minimaal 2 afspraken met locatie nodig voor route optimalisatie',
                appointments: appointmentsWithLocation,
                optimized: false
            });
        }
        
        // Converteer naar formaat voor optimizer
        const appointmentsForOptimizer = appointmentsWithLocation.map(apt => ({
            id: apt.id,
            title: apt.title,
            location: apt.location,
            duration: apt.duration || 60, // Standaard 60 min
            customerName: apt.customerName,
            serviceName: apt.serviceName,
            originalStart: apt.start,
            originalEnd: apt.end
        }));
        
        // Werkuren ophalen
        const workHours = user?.settings?.workHours || {
            start: '09:00',
            end: '17:00'
        };
        
        // Bereken geoptimaliseerde route
        const result = await planDayRoute(
            appointmentsForOptimizer,
            companyAddress,
            workHours,
            date
        );
        
        // Bereken besparing t.o.v. originele volgorde
        let originalTotalTravel = 0;
        const originalLocations = [companyAddress, ...appointmentsForOptimizer.map(a => a.location)];
        
        try {
            const originalMatrix = await calculateDistanceMatrix(originalLocations);
            for (let i = 0; i < originalLocations.length - 1; i++) {
                originalTotalTravel += originalMatrix[i]?.[i + 1] || 30;
            }
        } catch (e) {
            // Fallback: schat 30 min per rit
            originalTotalTravel = appointmentsForOptimizer.length * 30;
        }
        
        const savings = originalTotalTravel - result.totalTravelTime;
        
        res.json({
            success: true,
            optimized: true,
            date,
            startLocation: companyAddress,
            originalOrder: appointmentsWithLocation.map(a => ({
                id: a.id,
                title: a.title,
                location: a.location,
                start: a.start,
                end: a.end
            })),
            optimizedSchedule: result.schedule,
            summary: {
                totalAppointments: result.schedule.length,
                totalTravelTime: result.totalTravelTime,
                originalTravelTime: originalTotalTravel,
                timeSavedMinutes: Math.max(0, savings),
                workdayStart: result.workdayStart,
                workdayEnd: result.workdayEnd
            }
        });
        
    } catch (error) {
        console.error('Error optimizing route:', error);
        res.status(500).json({ error: 'Kon route niet optimaliseren: ' + error.message });
    }
});

// Pas geoptimaliseerde route toe (update afspraak tijden)
router.post('/apply-optimized-route', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { schedule } = req.body;
        
        if (!schedule || !Array.isArray(schedule)) {
            return res.status(400).json({ error: 'Geen schema opgegeven' });
        }
        
        const updates = [];
        
        for (const item of schedule) {
            if (!item.appointmentId || !item.scheduledStart || !item.scheduledEnd) {
                continue;
            }
            
            try {
                const updated = await appointmentStore.updateAppointment(userId, item.appointmentId, {
                    start: item.scheduledStart,
                    end: item.scheduledEnd,
                    travel_time_minutes: item.travelTimeFromPrevious,
                    travel_start_time: item.departureTime
                });
                
                if (updated) {
                    updates.push({
                        id: item.appointmentId,
                        newStart: item.scheduledStart,
                        newEnd: item.scheduledEnd
                    });
                }
            } catch (e) {
                console.error(`Kon afspraak ${item.appointmentId} niet updaten:`, e);
            }
        }
        
        res.json({
            success: true,
            message: `${updates.length} afspraken bijgewerkt met geoptimaliseerde tijden`,
            updates
        });
        
    } catch (error) {
        console.error('Error applying optimized route:', error);
        res.status(500).json({ error: 'Kon geoptimaliseerde route niet toepassen' });
    }
});

// Verwijder duplicaten
router.delete('/duplicates/clean', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Haal alle afspraken op
        const appointments = await appointmentStore.getAllAppointments(userId);
        
        // Groepeer op title + start_time
        const groups = {};
        for (const apt of appointments) {
            const key = `${apt.title}|${apt.start}`;
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(apt);
        }
        
        // Verwijder duplicaten (houd de oudste)
        let deleted = 0;
        for (const key of Object.keys(groups)) {
            if (groups[key].length > 1) {
                // Sorteer op created_at, houd oudste
                const sorted = groups[key].sort((a, b) => 
                    new Date(a.createdAt) - new Date(b.createdAt)
                );
                
                // Verwijder alle behalve de eerste
                for (let i = 1; i < sorted.length; i++) {
                    await appointmentStore.deleteAppointment(userId, sorted[i].id);
                    console.log(`🗑️ Duplicate verwijderd: ${sorted[i].title}`);
                    deleted++;
                }
            }
        }
        
        res.json({
            success: true,
            message: `${deleted} duplicaten verwijderd`,
            deleted
        });
        
    } catch (error) {
        console.error('Error cleaning duplicates:', error);
        res.status(500).json({ error: 'Kon duplicaten niet verwijderen' });
    }
});

module.exports = router;
