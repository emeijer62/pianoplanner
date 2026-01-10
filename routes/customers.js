/**
 * Customer Routes - Database versie
 * Klantenbeheer per gebruiker
 */

const express = require('express');
const router = express.Router();
const customerStore = require('../utils/customerStore');
const { requireAuth } = require('../middleware/auth');
const { checkCustomerLimit, addSubscriptionInfo } = require('../middleware/subscription');

// Alle routes vereisen authenticatie
router.use(requireAuth);

// Haal alle klanten op (met subscription info voor UI)
router.get('/', addSubscriptionInfo, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const customers = await customerStore.getAllCustomers(userId);
        
        res.json({
            total: customers.length,
            customers: customers,
            // Tier info voor UI
            tier: req.subscription?.tier || 'free',
            limits: req.subscription?.limits || { maxCustomers: 25 }
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

// Vind duplicaten op basis van email
router.get('/duplicates', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const duplicates = await customerStore.findDuplicates(userId);
        res.json({ duplicates });
    } catch (error) {
        console.error('Error finding duplicates:', error);
        res.status(500).json({ error: 'Kon duplicaten niet ophalen' });
    }
});

// Merge twee klanten
router.post('/merge', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { targetId, sourceId } = req.body;
        
        if (!targetId || !sourceId) {
            return res.status(400).json({ error: 'Target en source ID zijn verplicht' });
        }
        
        const merged = await customerStore.mergeCustomers(userId, targetId, sourceId);
        console.log(`🔄 Klanten samengevoegd: ${sourceId} -> ${targetId}`);
        
        res.json({ 
            success: true, 
            customer: merged,
            message: 'Klanten succesvol samengevoegd'
        });
    } catch (error) {
        console.error('Error merging customers:', error);
        res.status(500).json({ error: error.message || 'Samenvoegen mislukt' });
    }
});

// Clean up notes (remove duplicates and repeated text)
router.post('/clean-notes', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Helper function to clean notes
        function cleanNotesText(notes) {
            if (!notes) return '';
            
            // Split into lines and trim each
            let lines = notes.split(/\r?\n/).map(l => l.trim());
            
            // Remove empty lines at start/end
            while (lines.length && !lines[0]) lines.shift();
            while (lines.length && !lines[lines.length - 1]) lines.pop();
            
            // Remove duplicate consecutive lines
            const uniqueLines = [];
            for (const line of lines) {
                const lastLine = uniqueLines[uniqueLines.length - 1] || '';
                if (line.toLowerCase().trim() !== lastLine.toLowerCase().trim()) {
                    uniqueLines.push(line);
                }
            }
            
            // Find and remove repeated paragraphs
            const result = [];
            const seenParagraphs = new Set();
            let currentParagraph = [];
            
            for (const line of uniqueLines) {
                if (line === '') {
                    if (currentParagraph.length > 0) {
                        const paragraphText = currentParagraph.join('\n').toLowerCase().trim();
                        if (!seenParagraphs.has(paragraphText)) {
                            seenParagraphs.add(paragraphText);
                            result.push(...currentParagraph);
                        }
                        currentParagraph = [];
                    }
                    if (result.length > 0 && result[result.length - 1] !== '') {
                        result.push('');
                    }
                } else {
                    currentParagraph.push(line);
                }
            }
            
            if (currentParagraph.length > 0) {
                const paragraphText = currentParagraph.join('\n').toLowerCase().trim();
                if (!seenParagraphs.has(paragraphText)) {
                    result.push(...currentParagraph);
                }
            }
            
            while (result.length && !result[result.length - 1]) result.pop();
            
            return result.join('\n');
        }
        
        // Get all customers
        const customers = await customerStore.getAllCustomers(userId);
        let customersUpdated = 0;
        
        for (const customer of customers) {
            if (customer.notes) {
                const cleanedNotes = cleanNotesText(customer.notes);
                if (cleanedNotes !== customer.notes) {
                    await customerStore.updateCustomer(userId, customer.id, { notes: cleanedNotes });
                    customersUpdated++;
                }
            }
        }
        
        // Also clean piano notes
        const pianoStore = require('../utils/pianoStore');
        const pianos = await pianoStore.getAllPianos(userId);
        let pianosUpdated = 0;
        
        for (const piano of pianos) {
            if (piano.notes) {
                const cleanedNotes = cleanNotesText(piano.notes);
                if (cleanedNotes !== piano.notes) {
                    await pianoStore.updatePiano(userId, piano.id, { notes: cleanedNotes });
                    pianosUpdated++;
                }
            }
        }
        
        console.log(`🧹 Notes cleaned: ${customersUpdated} customers, ${pianosUpdated} pianos`);
        res.json({ 
            success: true, 
            customersUpdated, 
            pianosUpdated 
        });
    } catch (error) {
        console.error('Error cleaning notes:', error);
        res.status(500).json({ error: 'Could not clean notes' });
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

// Maak nieuwe klant aan (met tier limit check)
router.post('/', checkCustomerLimit, async (req, res) => {
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
        
        console.log(`👤 Nieuwe klant aangemaakt: ${name} (tier: ${req.customerLimit?.tier || 'unknown'})`);
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
        
        const { name, email, phone, street, city, postalCode, notes, defaultServiceId, useTheaterHours } = req.body;
        
        const customer = await customerStore.updateCustomer(userId, customerId, {
            name,
            email,
            phone,
            street,
            city,
            postalCode,
            notes,
            defaultServiceId,
            useTheaterHours
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

// Regenerate booking token voor klant
router.post('/:id/regenerate-token', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const customerId = req.params.id;
        
        // Controleer of klant bestaat en van deze user is
        const customer = await customerStore.getCustomer(userId, customerId);
        if (!customer) {
            return res.status(404).json({ error: 'Klant niet gevonden' });
        }
        
        // Genereer nieuwe token
        const newToken = await customerStore.regenerateBookingToken(userId, customerId);
        
        console.log(`🔄 Booking token geregenereerd voor klant ${customerId}`);
        res.json({ 
            success: true, 
            token: newToken,
            message: 'Nieuwe boekingslink gegenereerd'
        });
    } catch (error) {
        console.error('Error regenerating token:', error);
        res.status(500).json({ error: 'Kon token niet regenereren' });
    }
});

module.exports = router;
