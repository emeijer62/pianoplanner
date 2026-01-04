const express = require('express');
const router = express.Router();
const customerStore = require('../utils/customerStore');
const { requireAuth } = require('../middleware/auth');

// Alle routes vereisen authenticatie
router.use(requireAuth);

// Haal alle klanten op
router.get('/', (req, res) => {
    const customers = customerStore.getAllCustomers();
    res.json({
        total: Object.keys(customers).length,
        customers: Object.values(customers)
    });
});

// Zoek klanten
router.get('/search', (req, res) => {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
        return res.json({ customers: [] });
    }
    
    const results = customerStore.searchCustomers(q);
    res.json({ customers: results });
});

// Haal specifieke klant op
router.get('/:id', (req, res) => {
    const customer = customerStore.getCustomer(req.params.id);
    
    if (!customer) {
        return res.status(404).json({ error: 'Klant niet gevonden' });
    }
    
    res.json(customer);
});

// Maak nieuwe klant aan
router.post('/', (req, res) => {
    const { name, email, phone, street, city, postalCode, notes } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Naam is verplicht' });
    }
    
    const customer = customerStore.saveCustomer({
        name,
        email,
        phone,
        street,
        city,
        postalCode,
        notes
    });
    
    res.status(201).json(customer);
});

// Update klant
router.put('/:id', (req, res) => {
    const existing = customerStore.getCustomer(req.params.id);
    
    if (!existing) {
        return res.status(404).json({ error: 'Klant niet gevonden' });
    }
    
    const { name, email, phone, street, city, postalCode, notes } = req.body;
    
    const customer = customerStore.saveCustomer({
        id: req.params.id,
        name: name || existing.name,
        email: email !== undefined ? email : existing.email,
        phone: phone !== undefined ? phone : existing.phone,
        street: street !== undefined ? street : existing.address.street,
        city: city !== undefined ? city : existing.address.city,
        postalCode: postalCode !== undefined ? postalCode : existing.address.postalCode,
        notes: notes !== undefined ? notes : existing.notes,
        pianos: existing.pianos
    });
    
    res.json(customer);
});

// Verwijder klant
router.delete('/:id', (req, res) => {
    const deleted = customerStore.deleteCustomer(req.params.id);
    
    if (!deleted) {
        return res.status(404).json({ error: 'Klant niet gevonden' });
    }
    
    res.json({ success: true });
});

// Voeg piano toe aan klant
router.post('/:id/pianos', (req, res) => {
    const { brand, model, type, serialNumber, year, notes } = req.body;
    
    const piano = customerStore.addPianoToCustomer(req.params.id, {
        brand,
        model,
        type,
        serialNumber,
        year,
        notes
    });
    
    if (!piano) {
        return res.status(404).json({ error: 'Klant niet gevonden' });
    }
    
    res.status(201).json(piano);
});

module.exports = router;
