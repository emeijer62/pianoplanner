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

module.exports = router;
