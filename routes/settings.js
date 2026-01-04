const express = require('express');
const router = express.Router();
const companyStore = require('../utils/companyStore');
const serviceStore = require('../utils/serviceStore');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ==================== BEDRIJFSINSTELLINGEN ====================

// Haal bedrijfsinstellingen op
router.get('/company', requireAuth, (req, res) => {
    const settings = companyStore.getSettings();
    res.json(settings);
});

// Update bedrijfsinstellingen
router.put('/company', requireAuth, (req, res) => {
    try {
        const { name, owner, email, phone, street, postalCode, city, country, workHours, workDays } = req.body;
        
        const settings = companyStore.saveSettings({
            name,
            owner,
            email,
            phone,
            address: {
                street,
                postalCode,
                city,
                country: country || 'Nederland'
            },
            workHours: workHours || { start: '09:00', end: '18:00' },
            workDays: workDays || [1, 2, 3, 4, 5]
        });
        
        res.json(settings);
    } catch (error) {
        console.error('Error saving company settings:', error);
        res.status(500).json({ error: 'Kon instellingen niet opslaan' });
    }
});

// ==================== DIENSTEN ====================

// Haal alle diensten op (inclusief inactieve voor beheer)
router.get('/services', requireAuth, (req, res) => {
    const includeInactive = req.query.all === 'true';
    const services = includeInactive 
        ? serviceStore.getAllServicesAdmin() 
        : serviceStore.getAllServices();
    res.json({ services });
});

// Haal specifieke dienst op
router.get('/services/:id', requireAuth, (req, res) => {
    const service = serviceStore.getService(req.params.id);
    
    if (!service) {
        return res.status(404).json({ error: 'Dienst niet gevonden' });
    }
    
    res.json(service);
});

// Maak nieuwe dienst aan
router.post('/services', requireAuth, (req, res) => {
    const { name, duration, bufferBefore, bufferAfter, description, price, color } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Naam is verplicht' });
    }
    
    const service = serviceStore.saveService({
        name,
        duration,
        bufferBefore,
        bufferAfter,
        description,
        price,
        color
    });
    
    res.status(201).json(service);
});

// Update dienst
router.put('/services/:id', requireAuth, (req, res) => {
    const existing = serviceStore.getService(req.params.id);
    
    if (!existing) {
        return res.status(404).json({ error: 'Dienst niet gevonden' });
    }
    
    const { name, duration, bufferBefore, bufferAfter, description, price, color, active } = req.body;
    
    const service = serviceStore.saveService({
        id: req.params.id,
        name: name || existing.name,
        duration: duration !== undefined ? duration : existing.duration,
        bufferBefore: bufferBefore !== undefined ? bufferBefore : existing.bufferBefore,
        bufferAfter: bufferAfter !== undefined ? bufferAfter : existing.bufferAfter,
        description: description !== undefined ? description : existing.description,
        price: price !== undefined ? price : existing.price,
        color: color || existing.color,
        active: active !== undefined ? active : existing.active
    });
    
    res.json(service);
});

// Verwijder dienst (soft delete)
router.delete('/services/:id', requireAuth, (req, res) => {
    const deleted = serviceStore.deleteService(req.params.id);
    
    if (!deleted) {
        return res.status(404).json({ error: 'Dienst niet gevonden' });
    }
    
    res.json({ success: true });
});

// Activeer dienst opnieuw
router.post('/services/:id/activate', requireAuth, (req, res) => {
    const activated = serviceStore.activateService(req.params.id);
    
    if (!activated) {
        return res.status(404).json({ error: 'Dienst niet gevonden' });
    }
    
    res.json({ success: true });
});

module.exports = router;
