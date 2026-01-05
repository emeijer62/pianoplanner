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
    getCustomerByEmail
};
