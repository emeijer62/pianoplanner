const express = require('express');
const router = express.Router();
const { getAllServices, getService } = require('../config/services');
const { requireAuth } = require('../middleware/auth');

// Haal alle diensten op (publiek)
router.get('/', (req, res) => {
    const services = getAllServices();
    res.json({ services });
});

// Haal specifieke dienst op
router.get('/:id', (req, res) => {
    const service = getService(req.params.id);
    
    if (!service) {
        return res.status(404).json({ error: 'Dienst niet gevonden' });
    }
    
    res.json(service);
});

module.exports = router;
