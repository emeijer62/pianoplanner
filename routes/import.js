/**
 * Import Routes - Gazelle en CSV import
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const customerStore = require('../utils/customerStore');

/**
 * POST /api/import/gazelle
 * Import customers from Gazelle CSV data
 */
router.post('/gazelle', authenticate, async (req, res) => {
    try {
        const { customers, options = {} } = req.body;
        const userId = req.user.id;
        
        if (!customers || !Array.isArray(customers)) {
            return res.status(400).json({ 
                success: false, 
                error: 'No customers data provided' 
            });
        }
        
        let imported = 0;
        let skipped = 0;
        const errors = [];
        
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
                
                // Build customer data
                const customerData = {
                    name: customer.name.trim(),
                    email: customer.email?.trim() || null,
                    phone: customer.phone?.trim() || null,
                    street: customer.street?.trim() || null,
                    postalCode: customer.postalCode?.trim() || null,
                    city: customer.city?.trim() || null,
                    notes: buildNotes(customer)
                };
                
                // Create customer
                await customerStore.createCustomer(userId, customerData);
                imported++;
                
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
router.post('/csv', authenticate, async (req, res) => {
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
function buildNotes(customer) {
    const parts = [];
    
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

module.exports = router;
