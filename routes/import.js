/**
 * Import Routes - Gazelle en CSV import
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const customerStore = require('../utils/customerStore');
const pianoStore = require('../utils/pianoStore');

// Generate a unique batch ID for tracking imports
function generateBatchId() {
    return 'imp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * POST /api/import/gazelle
 * Import customers from Gazelle CSV data
 */
router.post('/gazelle', requireAuth, async (req, res) => {
    try {
        const { customers, options = {}, batchId: clientBatchId } = req.body;
        const userId = req.user.id;
        
        if (!customers || !Array.isArray(customers)) {
            return res.status(400).json({ 
                success: false, 
                error: 'No customers data provided' 
            });
        }
        
        // Use client-provided batch ID or generate new one
        const batchId = clientBatchId || generateBatchId();
        
        let imported = 0;
        let skipped = 0;
        const errors = [];
        const importedIds = [];  // Track imported IDs for undo
        
        // Get existing customers for duplicate check
        let existingEmails = new Set();
        if (options.skipDuplicates) {
            const existing = await customerStore.getAllCustomers(userId);
            existingEmails = new Set(
                existing
                    .map(c => c.email?.toLowerCase())
                    .filter(e => e)
            );
        }
        
        // Process each customer
        for (const customer of customers) {
            try {
                // Skip if duplicate email
                if (options.skipDuplicates && customer.email) {
                    if (existingEmails.has(customer.email.toLowerCase())) {
                        skipped++;
                        continue;
                    }
                }
                
                // Validate required fields
                if (!customer.name || customer.name.trim() === '') {
                    errors.push(`Skipped record: Missing name`);
                    skipped++;
                    continue;
                }
                
                // Build customer data with batch ID in notes
                const customerData = {
                    name: customer.name.trim(),
                    email: customer.email?.trim() || null,
                    phone: customer.phone?.trim() || null,
                    street: customer.street?.trim() || null,
                    postalCode: customer.postalCode?.trim() || null,
                    city: customer.city?.trim() || null,
                    notes: buildNotes(customer, batchId)
                };
                
                // Create customer
                const newCustomer = await customerStore.createCustomer(userId, customerData);
                imported++;
                importedIds.push(newCustomer.id);
                
                // Add email to set to prevent duplicates within batch
                if (customer.email) {
                    existingEmails.add(customer.email.toLowerCase());
                }
                
            } catch (err) {
                errors.push(`Error importing "${customer.name}": ${err.message}`);
            }
        }
        
        res.json({
            success: true,
            imported,
            skipped,
            batchId,
            importedIds,
            errors: errors.length > 0 ? errors : undefined
        });
        
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/import/csv
 * Generic CSV import (for future use)
 */
router.post('/csv', requireAuth, async (req, res) => {
    try {
        const { customers, mapping, options = {} } = req.body;
        const userId = req.user.id;
        
        if (!customers || !Array.isArray(customers)) {
            return res.status(400).json({ 
                success: false, 
                error: 'No customers data provided' 
            });
        }
        
        // Similar logic to Gazelle import but with custom mapping
        // To be implemented when needed
        
        res.json({
            success: false,
            error: 'Generic CSV import not yet implemented'
        });
        
    } catch (error) {
        console.error('CSV Import error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * Build notes from Gazelle data
 */
function buildNotes(customer, batchId = null) {
    const parts = [];
    
    // Add import batch ID for undo functionality
    if (batchId) {
        parts.push(`Import Batch: ${batchId}`);
    }
    
    // Add Gazelle ID reference
    if (customer.gazelleId) {
        parts.push(`Gazelle ID: ${customer.gazelleId}`);
    }
    
    // Add original notes
    if (customer.notes) {
        parts.push(customer.notes);
    }
    
    // Add status if inactive
    if (customer.status && customer.status !== 'active') {
        parts.push(`Status in Gazelle: ${customer.status}`);
    }
    
    return parts.join('\n\n') || null;
}

/**
 * POST /api/import/gazelle-pianos
 * Import pianos from Gazelle CSV data
 */
router.post('/gazelle-pianos', requireAuth, async (req, res) => {
    try {
        const { pianos, options = {}, batchId: clientBatchId } = req.body;
        const userId = req.user.id;
        
        if (!pianos || !Array.isArray(pianos)) {
            return res.status(400).json({ 
                success: false, 
                error: 'No pianos data provided' 
            });
        }
        
        // Use client-provided batch ID or generate new one
        const batchId = clientBatchId || generateBatchId();
        
        let imported = 0;
        let skipped = 0;
        const errors = [];
        const importedIds = [];  // Track imported IDs for undo
        
        // Get all customers to find matches by Gazelle ID
        const allCustomers = await customerStore.getAllCustomers(userId);
        
        // Build lookup map: Gazelle Client ID -> Customer
        const customerByGazelleId = new Map();
        for (const customer of allCustomers) {
            // Look for Gazelle ID in notes
            if (customer.notes) {
                const match = customer.notes.match(/Gazelle ID:\s*(cli_[a-zA-Z0-9]+)/);
                if (match) {
                    customerByGazelleId.set(match[1], customer);
                }
            }
        }
        
        console.log(`Found ${customerByGazelleId.size} customers with Gazelle IDs`);
        
        // Process each piano
        for (const piano of pianos) {
            try {
                // Validate required fields
                if (!piano.brand || piano.brand.trim() === '') {
                    errors.push(`Skipped piano: Missing brand`);
                    skipped++;
                    continue;
                }
                
                // Find customer by Gazelle Client ID
                let customerId = null;
                let customerFound = false;
                
                if (piano.clientId) {
                    const customer = customerByGazelleId.get(piano.clientId);
                    if (customer) {
                        customerId = customer.id;
                        customerFound = true;
                    }
                }
                
                // Handle missing customer based on options
                if (!customerFound && piano.clientId) {
                    if (options.skipNoCustomer) {
                        errors.push(`Skipped "${piano.brand} ${piano.model || ''}": Customer not found (${piano.clientId})`);
                        skipped++;
                        continue;
                    }
                    
                    if (options.createCustomer && piano.customerName) {
                        // Create the customer
                        const newCustomer = await customerStore.createCustomer(userId, {
                            name: piano.customerName,
                            notes: `Import Batch: ${batchId}\n\nGazelle ID: ${piano.clientId}\n\nAuto-created during piano import`
                        });
                        customerId = newCustomer.id;
                        customerByGazelleId.set(piano.clientId, newCustomer);
                    }
                }
                
                // Build piano notes
                const noteParts = [];
                // Add import batch ID for undo functionality
                noteParts.push(`Import Batch: ${batchId}`);
                if (piano.gazelleId) {
                    noteParts.push(`Gazelle Piano ID: ${piano.gazelleId}`);
                }
                if (piano.notes) {
                    noteParts.push(piano.notes);
                }
                if (piano.status && piano.status !== 'active') {
                    noteParts.push(`Status in Gazelle: ${piano.status}`);
                }
                
                // Build piano data
                const pianoData = {
                    brand: piano.brand.trim(),
                    model: piano.model?.trim() || null,
                    serialNumber: piano.serialNumber?.trim() || null,
                    year: piano.year || null,
                    type: piano.type || 'upright',
                    location: piano.location?.trim() || null,
                    finish: piano.finish?.trim() || null,
                    serviceInterval: piano.serviceInterval || 12,
                    lastTuningDate: piano.lastTuningDate || null,
                    notes: noteParts.join('\n\n') || null,
                    customerId: customerId
                };
                
                // Create piano
                const newPiano = await pianoStore.createPiano(userId, pianoData);
                imported++;
                importedIds.push(newPiano.id);
                
            } catch (err) {
                errors.push(`Error importing "${piano.brand} ${piano.model || ''}": ${err.message}`);
            }
        }
        
        res.json({
            success: true,
            imported,
            skipped,
            batchId,
            importedIds,
            errors: errors.length > 0 ? errors : undefined
        });
        
    } catch (error) {
        console.error('Piano import error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/import/undo
 * Undo an import by batch ID - deletes all records from that import
 */
router.post('/undo', requireAuth, async (req, res) => {
    try {
        const { batchId, type, ids } = req.body;
        const userId = req.user.id;
        
        if (!batchId || !type || !ids || !Array.isArray(ids)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: batchId, type, and ids' 
            });
        }
        
        let deleted = 0;
        const errors = [];
        
        if (type === 'customers') {
            // Delete customers by ID
            for (const id of ids) {
                try {
                    // Verify the customer belongs to this user and has the batch ID
                    const customer = await customerStore.getCustomerById(userId, id);
                    if (customer && customer.notes && customer.notes.includes(`Import Batch: ${batchId}`)) {
                        await customerStore.deleteCustomer(userId, id);
                        deleted++;
                    }
                } catch (err) {
                    errors.push(`Failed to delete customer ${id}: ${err.message}`);
                }
            }
        } else if (type === 'pianos') {
            // Delete pianos by ID
            for (const id of ids) {
                try {
                    // Verify the piano belongs to this user and has the batch ID
                    const piano = await pianoStore.getPianoById(userId, id);
                    if (piano && piano.notes && piano.notes.includes(`Import Batch: ${batchId}`)) {
                        await pianoStore.deletePiano(userId, id);
                        deleted++;
                    }
                } catch (err) {
                    errors.push(`Failed to delete piano ${id}: ${err.message}`);
                }
            }
        } else {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid type. Must be "customers" or "pianos"' 
            });
        }
        
        res.json({
            success: true,
            deleted,
            errors: errors.length > 0 ? errors : undefined
        });
        
    } catch (error) {
        console.error('Undo import error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = router;
