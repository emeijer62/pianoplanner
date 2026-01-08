const express = require('express');
const router = express.Router();
const serviceStore = require('../utils/serviceStore');
const { requireAuth } = require('../middleware/auth');

// Haal alle actieve diensten op (publiek voor booking)
router.get('/', requireAuth, async (req, res) => {
    try {
        const services = await serviceStore.getActiveServices(req.session.user.id);
        res.json({ services });
    } catch (error) {
        console.error('Error getting services:', error);
        res.status(500).json({ error: 'Kon diensten niet ophalen' });
    }
});

// Haal specifieke dienst op
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const service = await serviceStore.getService(req.session.user.id, req.params.id);
        
        if (!service) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        res.json(service);
    } catch (error) {
        console.error('Error getting service:', error);
        res.status(500).json({ error: 'Kon dienst niet ophalen' });
    }
});

// Maak nieuwe dienst aan
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, duration, bufferBefore, bufferAfter, description, price, active } = req.body;
        
        if (!name || !duration) {
            return res.status(400).json({ error: 'Naam en duur zijn verplicht' });
        }
        
        const service = await serviceStore.createService(req.session.user.id, {
            name,
            duration: parseInt(duration),
            bufferBefore: parseInt(bufferBefore) || 0,
            bufferAfter: parseInt(bufferAfter) || 0,
            description,
            price: price ? parseFloat(price) : null,
            active: active !== false
        });
        
        console.log(`✅ Service aangemaakt: ${name}`);
        res.status(201).json(service);
    } catch (error) {
        console.error('Error creating service:', error);
        res.status(500).json({ error: 'Kon dienst niet aanmaken' });
    }
});

// Update dienst
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const serviceId = req.params.id;
        const userId = req.session.user.id;
        
        const existing = await serviceStore.getService(userId, serviceId);
        if (!existing) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        const { name, duration, bufferBefore, bufferAfter, description, price, active } = req.body;
        
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (duration !== undefined) updates.duration = parseInt(duration);
        if (bufferBefore !== undefined) updates.bufferBefore = parseInt(bufferBefore);
        if (bufferAfter !== undefined) updates.bufferAfter = parseInt(bufferAfter);
        if (description !== undefined) updates.description = description;
        if (price !== undefined) updates.price = price ? parseFloat(price) : null;
        if (active !== undefined) updates.active = active;
        
        const updated = await serviceStore.updateService(userId, serviceId, updates);
        
        console.log(`✅ Service bijgewerkt: ${updated.name}`);
        res.json(updated);
    } catch (error) {
        console.error('Error updating service:', error);
        res.status(500).json({ error: 'Kon dienst niet bijwerken' });
    }
});

// Verwijder dienst
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const serviceId = req.params.id;
        const userId = req.session.user.id;
        
        const existing = await serviceStore.getService(userId, serviceId);
        if (!existing) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        await serviceStore.deleteService(userId, serviceId);
        
        console.log(`🗑️ Service verwijderd: ${existing.name}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting service:', error);
        res.status(500).json({ error: 'Kon dienst niet verwijderen' });
    }
});

module.exports = router;
