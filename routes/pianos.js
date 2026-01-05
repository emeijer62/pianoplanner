/**
 * Piano Routes - API voor piano beheer
 */

const express = require('express');
const router = express.Router();
const pianoStore = require('../utils/pianoStore');
const { requireAuth } = require('../middleware/auth');

// Alle routes vereisen authenticatie
router.use(requireAuth);

// ============================================
// PIANO ROUTES
// ============================================

// GET /api/pianos - Alle piano's van de gebruiker
router.get('/', (req, res) => {
    const userId = req.session.user.id;
    const pianos = pianoStore.getAllPianos(userId);
    
    res.json({
        total: Object.keys(pianos).length,
        pianos: Object.values(pianos)
    });
});

// GET /api/pianos/due - Piano's die service nodig hebben
router.get('/due', (req, res) => {
    const userId = req.session.user.id;
    const due = pianoStore.getPianosDueForService(userId);
    
    res.json({
        total: due.length,
        pianos: due
    });
});

// GET /api/pianos/brands - Lijst van piano merken
router.get('/brands', (req, res) => {
    res.json({ brands: pianoStore.PIANO_BRANDS });
});

// GET /api/pianos/customer/:customerId - Piano's van een specifieke klant
router.get('/customer/:customerId', (req, res) => {
    const userId = req.session.user.id;
    const { customerId } = req.params;
    const pianos = pianoStore.getPianosByCustomer(userId, customerId);
    
    res.json({
        total: pianos.length,
        pianos: pianos
    });
});

// GET /api/pianos/customer/:customerId/services - Alle services van piano's van een klant
router.get('/customer/:customerId/services', (req, res) => {
    const userId = req.session.user.id;
    const { customerId } = req.params;
    
    // Haal alle piano's van de klant op
    const pianos = pianoStore.getPianosByCustomer(userId, customerId);
    
    // Verzamel alle services van alle piano's
    const allServices = [];
    for (const piano of pianos) {
        const services = pianoStore.getServiceHistory(userId, piano.id);
        for (const service of services) {
            allServices.push({
                ...service,
                pianoId: piano.id,
                pianoName: `${piano.brand} ${piano.model || ''}`.trim()
            });
        }
    }
    
    // Sorteer op datum (nieuwste eerst)
    allServices.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json({
        total: allServices.length,
        services: allServices
    });
});

// GET /api/pianos/:pianoId - Specifieke piano ophalen
router.get('/:pianoId', (req, res) => {
    const userId = req.session.user.id;
    const { pianoId } = req.params;
    const piano = pianoStore.getPiano(userId, pianoId);
    
    if (!piano) {
        return res.status(404).json({ error: 'Piano niet gevonden' });
    }
    
    // Voeg service historie toe
    const serviceHistory = pianoStore.getServiceHistory(userId, pianoId);
    
    res.json({
        ...piano,
        serviceHistory: serviceHistory
    });
});

// POST /api/pianos - Nieuwe piano aanmaken
router.post('/', (req, res) => {
    const userId = req.session.user.id;
    const pianoData = req.body;
    
    if (!pianoData.brand) {
        return res.status(400).json({ error: 'Merk is verplicht' });
    }
    
    const piano = pianoStore.createPiano(userId, pianoData);
    console.log(`🎹 Nieuwe piano toegevoegd: ${piano.brand} ${piano.model}`);
    
    res.status(201).json({
        success: true,
        message: 'Piano toegevoegd',
        piano: piano
    });
});

// PUT /api/pianos/:pianoId - Piano bijwerken
router.put('/:pianoId', (req, res) => {
    const userId = req.session.user.id;
    const { pianoId } = req.params;
    const updates = req.body;
    
    const piano = pianoStore.updatePiano(userId, pianoId, updates);
    
    if (!piano) {
        return res.status(404).json({ error: 'Piano niet gevonden' });
    }
    
    res.json({
        success: true,
        message: 'Piano bijgewerkt',
        piano: piano
    });
});

// DELETE /api/pianos/:pianoId - Piano verwijderen
router.delete('/:pianoId', (req, res) => {
    const userId = req.session.user.id;
    const { pianoId } = req.params;
    
    const deleted = pianoStore.deletePiano(userId, pianoId);
    
    if (!deleted) {
        return res.status(404).json({ error: 'Piano niet gevonden' });
    }
    
    res.json({
        success: true,
        message: 'Piano verwijderd'
    });
});

// ============================================
// SERVICE HISTORIE ROUTES
// ============================================

// GET /api/pianos/:pianoId/services - Service historie ophalen
router.get('/:pianoId/services', (req, res) => {
    const userId = req.session.user.id;
    const { pianoId } = req.params;
    
    const services = pianoStore.getServiceHistory(userId, pianoId);
    
    res.json({
        total: services.length,
        services: services.sort((a, b) => new Date(b.date) - new Date(a.date))
    });
});

// POST /api/pianos/:pianoId/services - Service record toevoegen
router.post('/:pianoId/services', (req, res) => {
    const userId = req.session.user.id;
    const { pianoId } = req.params;
    const serviceData = req.body;
    
    // Check of piano bestaat
    const piano = pianoStore.getPiano(userId, pianoId);
    if (!piano) {
        return res.status(404).json({ error: 'Piano niet gevonden' });
    }
    
    const service = pianoStore.addServiceRecord(userId, pianoId, serviceData);
    console.log(`🔧 Service toegevoegd voor ${piano.brand} ${piano.model}: ${service.type}`);
    
    res.status(201).json({
        success: true,
        message: 'Service record toegevoegd',
        service: service
    });
});

// DELETE /api/pianos/:pianoId/services/:serviceId - Service record verwijderen
router.delete('/:pianoId/services/:serviceId', (req, res) => {
    const userId = req.session.user.id;
    const { pianoId, serviceId } = req.params;
    
    const deleted = pianoStore.deleteServiceRecord(userId, pianoId, serviceId);
    
    if (!deleted) {
        return res.status(404).json({ error: 'Service record niet gevonden' });
    }
    
    res.json({
        success: true,
        message: 'Service record verwijderd'
    });
});

module.exports = router;
