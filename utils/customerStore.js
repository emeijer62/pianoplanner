/**
 * Customer Store - SQLite versie
 * Klantenbeheer per gebruiker
 */

const { dbRun, dbGet, dbAll } = require('./database');
const { v4: uuidv4 } = require('uuid');

// ==================== CUSTOMER CRUD ====================

const createCustomer = async (userId, customerData) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    await dbRun(`
        INSERT INTO customers (id, user_id, name, email, phone, street, postal_code, city, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        userId,
        customerData.name,
        customerData.email || null,
        customerData.phone || null,
        customerData.address?.street || customerData.street || null,
        customerData.address?.postalCode || customerData.postalCode || null,
        customerData.address?.city || customerData.city || null,
        customerData.notes || null,
        now,
        now
    ]);
    
    return getCustomer(userId, id);
};

const getCustomer = async (userId, customerId) => {
    const customer = await dbGet(
        'SELECT * FROM customers WHERE id = ? AND user_id = ?',
        [customerId, userId]
    );
    
    if (!customer) return null;
    
    // Format naar legacy structuur voor compatibiliteit
    return formatCustomer(customer);
};

const getAllCustomers = async (userId) => {
    const customers = await dbAll(
        'SELECT * FROM customers WHERE user_id = ? ORDER BY name ASC',
        [userId]
    );
    
    return customers.map(formatCustomer);
};

const updateCustomer = async (userId, customerId, updates) => {
    const fields = [];
    const values = [];
    
    if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
    }
    if (updates.email !== undefined) {
        fields.push('email = ?');
        values.push(updates.email);
    }
    if (updates.phone !== undefined) {
        fields.push('phone = ?');
        values.push(updates.phone);
    }
    if (updates.street !== undefined || updates.address?.street !== undefined) {
        fields.push('street = ?');
        values.push(updates.street || updates.address?.street);
    }
    if (updates.postalCode !== undefined || updates.address?.postalCode !== undefined) {
        fields.push('postal_code = ?');
        values.push(updates.postalCode || updates.address?.postalCode);
    }
    if (updates.city !== undefined || updates.address?.city !== undefined) {
        fields.push('city = ?');
        values.push(updates.city || updates.address?.city);
    }
    if (updates.notes !== undefined) {
        fields.push('notes = ?');
        values.push(updates.notes);
    }
    
    if (fields.length === 0) return getCustomer(userId, customerId);
    
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(customerId);
    values.push(userId);
    
    await dbRun(`UPDATE customers SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    return getCustomer(userId, customerId);
};

const deleteCustomer = async (userId, customerId) => {
    const result = await dbRun(
        'DELETE FROM customers WHERE id = ? AND user_id = ?',
        [customerId, userId]
    );
    return result.changes > 0;
};

const searchCustomers = async (userId, query) => {
    const searchTerm = `%${query}%`;
    const customers = await dbAll(`
        SELECT * FROM customers 
        WHERE user_id = ? 
        AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ?)
        ORDER BY name ASC
    `, [userId, searchTerm, searchTerm, searchTerm, searchTerm]);
    
    return customers.map(formatCustomer);
};

// Zoek klant op email
const getCustomerByEmail = async (userId, email) => {
    if (!email) return null;
    
    const customer = await dbGet(
        'SELECT * FROM customers WHERE user_id = ? AND email = ?',
        [userId, email.toLowerCase()]
    );
    
    if (!customer) return null;
    return formatCustomer(customer);
};

// Vind duplicaten op basis van email
const findDuplicates = async (userId) => {
    // Vind alle emails die meer dan 1x voorkomen
    const duplicateEmails = await dbAll(`
        SELECT email, COUNT(*) as count
        FROM customers 
        WHERE user_id = ? AND email IS NOT NULL AND email != ''
        GROUP BY LOWER(email)
        HAVING COUNT(*) > 1
    `, [userId]);
    
    const duplicates = [];
    
    for (const dup of duplicateEmails) {
        const customers = await dbAll(`
            SELECT c.*, 
                (SELECT COUNT(*) FROM appointments WHERE customer_id = c.id) as appointment_count,
                (SELECT COUNT(*) FROM pianos WHERE customer_id = c.id) as piano_count
            FROM customers c
            WHERE c.user_id = ? AND LOWER(c.email) = LOWER(?)
            ORDER BY c.created_at ASC
        `, [userId, dup.email]);
        
        duplicates.push({
            email: dup.email,
            count: dup.count,
            customers: customers.map(c => ({
                ...formatCustomer(c),
                appointmentCount: c.appointment_count || 0,
                pianoCount: c.piano_count || 0
            }))
        });
    }
    
    return duplicates;
};

// Merge twee klanten (source wordt samengevoegd in target)
const mergeCustomers = async (userId, targetId, sourceId) => {
    // Haal beide klanten op
    const target = await dbGet('SELECT * FROM customers WHERE id = ? AND user_id = ?', [targetId, userId]);
    const source = await dbGet('SELECT * FROM customers WHERE id = ? AND user_id = ?', [sourceId, userId]);
    
    if (!target || !source) {
        throw new Error('Klant niet gevonden');
    }
    
    if (targetId === sourceId) {
        throw new Error('Kan klant niet met zichzelf mergen');
    }
    
    // Begin transactie-achtige operaties
    const now = new Date().toISOString();
    
    // 1. Verplaats alle afspraken van source naar target
    await dbRun(`
        UPDATE appointments 
        SET customer_id = ?, updated_at = ?
        WHERE customer_id = ? AND user_id = ?
    `, [targetId, now, sourceId, userId]);
    
    // 2. Verplaats alle piano's van source naar target
    await dbRun(`
        UPDATE pianos 
        SET customer_id = ?, updated_at = ?
        WHERE customer_id = ? AND user_id = ?
    `, [targetId, now, sourceId, userId]);
    
    // 3. Combineer notities (als source notities heeft)
    if (source.notes) {
        const combinedNotes = target.notes 
            ? `${target.notes}\n\n--- Samengevoegd van ${source.name} (${now}) ---\n${source.notes}`
            : `--- Samengevoegd van ${source.name} (${now}) ---\n${source.notes}`;
        
        await dbRun(`
            UPDATE customers SET notes = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
        `, [combinedNotes, now, targetId, userId]);
    }
    
    // 4. Vul lege velden in target aan met source data
    const fieldsToMerge = ['phone', 'street', 'postal_code', 'city'];
    for (const field of fieldsToMerge) {
        if (!target[field] && source[field]) {
            await dbRun(`
                UPDATE customers SET ${field} = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
            `, [source[field], now, targetId, userId]);
        }
    }
    
    // 5. Verwijder de source klant
    await dbRun('DELETE FROM customers WHERE id = ? AND user_id = ?', [sourceId, userId]);
    
    // Return de bijgewerkte target klant
    return getCustomer(userId, targetId);
};

// Format database row naar legacy structuur
function formatCustomer(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        address: {
            street: row.street,
            postalCode: row.postal_code,
            city: row.city
        },
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

module.exports = {
    createCustomer,
    getCustomer,
    getAllCustomers,
    updateCustomer,
    deleteCustomer,
    searchCustomers,
    getCustomerByEmail,
    findDuplicates,
    mergeCustomers
};
