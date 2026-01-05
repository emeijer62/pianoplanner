/**
 * Customer Routes - Database versie
 * Klantenbeheer per gebruiker
 */

const express = require('express');
const router = express.Router();
const customerStore = require('../utils/customerStoreDB');
const { requireAuth } = require('../middleware/auth');

// Alle routes vereisen authenticatie
router.use(requireAuth);

// Haal alle klanten op
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const customers = await customerStore.getAllCustomers(userId);
        
        res.json({
            total: customers.length,
            customers: customers
        });
    } catch (error) {
        console.error('Error getting customers:', error);
        res.status(500).json({ error: 'Kon klanten niet ophalen' });
    }
});

// Zoek klanten
router.get('/search', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.json({ customers: [] });
        }
        
        const results = await customerStore.searchCustomers(userId, q);
        res.json({ customers: results });
    } catch (error) {
        console.error('Error searching customers:', error);
        res.status(500).json({ error: 'Zoeken mislukt' });
    }
});

// Haal specifieke klant op
router.get('/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const customer = await customerStore.getCustomer(userId, req.params.id);
        
        if (!customer) {
            return res.status(404).json({ error: 'Klant niet gevonden' });
        }
        
        res.json(customer);
    } catch (error) {
        console.error('Error getting customer:', error);
        res.status(500).json({ error: 'Kon klant niet ophalen' });
    }
});

// Maak nieuwe klant aan
router.post('/', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { name, email, phone, street, city, postalCode, notes } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Naam is verplicht' });
        }
        
        const customer = await customerStore.createCustomer(userId, {
            name,
            email,
            phone,
            street,
            city,
            postalCode,
            notes
        });
        
        console.log(`👤 Nieuwe klant aangemaakt: ${name}`);
        res.status(201).json(customer);
    } catch (error) {
        console.error('Error creating customer:', error);
        res.status(500).json({ error: 'Kon klant niet aanmaken' });
    }
});

// Update klant
router.put('/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const customerId = req.params.id;
        
        const existing = await customerStore.getCustomer(userId, customerId);
        if (!existing) {
            return res.status(404).json({ error: 'Klant niet gevonden' });
        }
        
        const { name, email, phone, street, city, postalCode, notes } = req.body;
        
        const customer = await customerStore.updateCustomer(userId, customerId, {
            name,
            email,
            phone,
            street,
            city,
            postalCode,
            notes
        });
        
        res.json(customer);
    } catch (error) {
        console.error('Error updating customer:', error);
        res.status(500).json({ error: 'Kon klant niet bijwerken' });
    }
});

// Verwijder klant
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const deleted = await customerStore.deleteCustomer(userId, req.params.id);
        
        if (!deleted) {
            return res.status(404).json({ error: 'Klant niet gevonden' });
        }
        
        res.json({ success: true, message: 'Klant verwijderd' });
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).json({ error: 'Kon klant niet verwijderen' });
    }
});

module.exports = router;
