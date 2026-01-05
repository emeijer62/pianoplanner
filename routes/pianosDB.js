/**
 * Piano Routes - Database versie
 * Piano's en service historie per gebruiker
 */

const express = require('express');
const router = express.Router();
const pianoStore = require('../utils/pianoStoreDB');
const { requireAuth } = require('../middleware/auth');

// Alle routes vereisen authenticatie
router.use(requireAuth);

// ============================================
// PIANO ROUTES
// ============================================

// GET /api/pianos - Alle piano's van de gebruiker
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const pianos = await pianoStore.getAllPianos(userId);
        
        res.json({
            total: pianos.length,
            pianos: pianos
        });
    } catch (error) {
        console.error('Error getting pianos:', error);
        res.status(500).json({ error: 'Kon piano\'s niet ophalen' });
    }
});

// GET /api/pianos/due - Piano's die service nodig hebben
router.get('/due', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const due = await pianoStore.getPianosDueForService(userId);
        
        res.json({
            total: due.length,
            pianos: due
        });
    } catch (error) {
        console.error('Error getting pianos due:', error);
        res.status(500).json({ error: 'Kon piano\'s niet ophalen' });
    }
});

// GET /api/pianos/brands - Lijst van piano merken
router.get('/brands', (req, res) => {
    res.json({ brands: pianoStore.PIANO_BRANDS });
});

// GET /api/pianos/customer/:customerId - Piano's van een specifieke klant
router.get('/customer/:customerId', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { customerId } = req.params;
        const pianos = await pianoStore.getPianosByCustomer(userId, customerId);
        
        res.json({
            total: pianos.length,
            pianos: pianos
        });
    } catch (error) {
        console.error('Error getting customer pianos:', error);
        res.status(500).json({ error: 'Kon piano\'s niet ophalen' });
    }
});

// GET /api/pianos/customer/:customerId/services - Alle services van piano's van een klant
router.get('/customer/:customerId/services', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { customerId } = req.params;
        
        const services = await pianoStore.getServiceHistoryByCustomer(userId, customerId);
        
        res.json({
            total: services.length,
            services: services
        });
    } catch (error) {
        console.error('Error getting customer services:', error);
        res.status(500).json({ error: 'Kon services niet ophalen' });
    }
});

// GET /api/pianos/:pianoId - Specifieke piano ophalen
router.get('/:pianoId', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { pianoId } = req.params;
        const piano = await pianoStore.getPiano(userId, pianoId);
        
        if (!piano) {
            return res.status(404).json({ error: 'Piano niet gevonden' });
        }
        
        // Voeg service historie toe
        const serviceHistory = await pianoStore.getServiceHistory(userId, pianoId);
        
        res.json({
            ...piano,
            serviceHistory: serviceHistory
        });
    } catch (error) {
        console.error('Error getting piano:', error);
        res.status(500).json({ error: 'Kon piano niet ophalen' });
    }
});

// POST /api/pianos - Nieuwe piano aanmaken
router.post('/', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const pianoData = req.body;
        
        if (!pianoData.brand) {
            return res.status(400).json({ error: 'Merk is verplicht' });
        }
        
        const piano = await pianoStore.createPiano(userId, pianoData);
        console.log(`🎹 Nieuwe piano toegevoegd: ${piano.brand} ${piano.model}`);
        
        res.status(201).json({
            success: true,
            message: 'Piano toegevoegd',
            piano: piano
        });
    } catch (error) {
        console.error('Error creating piano:', error);
        res.status(500).json({ error: 'Kon piano niet aanmaken' });
    }
});

// PUT /api/pianos/:pianoId - Piano bijwerken
router.put('/:pianoId', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { pianoId } = req.params;
        const updates = req.body;
        
        const piano = await pianoStore.updatePiano(userId, pianoId, updates);
        
        if (!piano) {
            return res.status(404).json({ error: 'Piano niet gevonden' });
        }
        
        res.json({
            success: true,
            message: 'Piano bijgewerkt',
            piano: piano
        });
    } catch (error) {
        console.error('Error updating piano:', error);
        res.status(500).json({ error: 'Kon piano niet bijwerken' });
    }
});

// DELETE /api/pianos/:pianoId - Piano verwijderen
router.delete('/:pianoId', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { pianoId } = req.params;
        
        const deleted = await pianoStore.deletePiano(userId, pianoId);
        
        if (!deleted) {
            return res.status(404).json({ error: 'Piano niet gevonden' });
        }
        
        res.json({
            success: true,
            message: 'Piano verwijderd'
        });
    } catch (error) {
        console.error('Error deleting piano:', error);
        res.status(500).json({ error: 'Kon piano niet verwijderen' });
    }
});

// ============================================
// SERVICE HISTORIE ROUTES
// ============================================

// GET /api/pianos/:pianoId/services - Service historie ophalen
router.get('/:pianoId/services', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { pianoId } = req.params;
        
        const services = await pianoStore.getServiceHistory(userId, pianoId);
        
        res.json({
            total: services.length,
            services: services.sort((a, b) => new Date(b.date) - new Date(a.date))
        });
    } catch (error) {
        console.error('Error getting services:', error);
        res.status(500).json({ error: 'Kon services niet ophalen' });
    }
});

// POST /api/pianos/:pianoId/services - Service record toevoegen
router.post('/:pianoId/services', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { pianoId } = req.params;
        const serviceData = req.body;
        
        // Check of piano bestaat
        const piano = await pianoStore.getPiano(userId, pianoId);
        if (!piano) {
            return res.status(404).json({ error: 'Piano niet gevonden' });
        }
        
        const service = await pianoStore.addServiceRecord(userId, pianoId, serviceData);
        console.log(`🔧 Service toegevoegd voor ${piano.brand} ${piano.model}: ${service.type}`);
        
        res.status(201).json({
            success: true,
            message: 'Service record toegevoegd',
            service: service
        });
    } catch (error) {
        console.error('Error adding service:', error);
        res.status(500).json({ error: 'Kon service niet toevoegen' });
    }
});

// Alias voor compatibiliteit
router.post('/:pianoId/service', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { pianoId } = req.params;
        const serviceData = req.body;
        
        const piano = await pianoStore.getPiano(userId, pianoId);
        if (!piano) {
            return res.status(404).json({ error: 'Piano niet gevonden' });
        }
        
        const service = await pianoStore.addServiceRecord(userId, pianoId, serviceData);
        console.log(`🔧 Service toegevoegd voor ${piano.brand} ${piano.model}: ${service.type}`);
        
        res.status(201).json({
            success: true,
            message: 'Service record toegevoegd',
            service: service
        });
    } catch (error) {
        console.error('Error adding service:', error);
        res.status(500).json({ error: 'Kon service niet toevoegen' });
    }
});

// DELETE /api/pianos/:pianoId/services/:serviceId - Service record verwijderen
router.delete('/:pianoId/services/:serviceId', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { pianoId, serviceId } = req.params;
        
        const deleted = await pianoStore.deleteServiceRecord(userId, pianoId, serviceId);
        
        if (!deleted) {
            return res.status(404).json({ error: 'Service record niet gevonden' });
        }
        
        res.json({
            success: true,
            message: 'Service record verwijderd'
        });
    } catch (error) {
        console.error('Error deleting service:', error);
        res.status(500).json({ error: 'Kon service niet verwijderen' });
    }
});

module.exports = router;
