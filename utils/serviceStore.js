/**
 * Service Store - SQLite versie
 * Diensten configuratie (stemmen, regulatie, etc.)
 */

const { dbRun, dbGet, dbAll } = require('./database');
const { v4: uuidv4 } = require('uuid');

// ==================== SERVICE CRUD ====================

const createService = async (userId, serviceData) => {
    const id = serviceData.id || uuidv4();
    
    await dbRun(`
        INSERT INTO services (id, user_id, name, duration, buffer_before, buffer_after, description, price, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        userId,
        serviceData.name,
        serviceData.duration,
        serviceData.bufferBefore || 0,
        serviceData.bufferAfter || 0,
        serviceData.description || null,
        serviceData.price || null,
        serviceData.active !== false ? 1 : 0,
        new Date().toISOString()
    ]);
    
    return getService(userId, id);
};

const getService = async (userId, serviceId) => {
    // Probeer eerst user-specifieke service, dan globale
    let service = await dbGet(
        'SELECT * FROM services WHERE id = ? AND user_id = ?',
        [serviceId, userId]
    );
    
    if (!service) {
        service = await dbGet(
            'SELECT * FROM services WHERE id = ? AND user_id IS NULL',
            [serviceId]
        );
    }
    
    if (!service) return null;
    return formatService(service);
};

const getAllServices = async (userId) => {
    // Haal zowel globale als user-specifieke services op
    const services = await dbAll(`
        SELECT * FROM services 
        WHERE user_id = ? OR user_id IS NULL
        ORDER BY name ASC
    `, [userId]);
    
    return services.map(formatService);
};

const getActiveServices = async (userId) => {
    const services = await dbAll(`
        SELECT * FROM services 
        WHERE (user_id = ? OR user_id IS NULL) AND active = 1
        ORDER BY name ASC
    `, [userId]);
    
    return services.map(formatService);
};

const updateService = async (userId, serviceId, updates) => {
    const fields = [];
    const values = [];
    
    if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
    }
    if (updates.duration !== undefined) {
        fields.push('duration = ?');
        values.push(updates.duration);
    }
    if (updates.bufferBefore !== undefined) {
        fields.push('buffer_before = ?');
        values.push(updates.bufferBefore);
    }
    if (updates.bufferAfter !== undefined) {
        fields.push('buffer_after = ?');
        values.push(updates.bufferAfter);
    }
    if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
    }
    if (updates.price !== undefined) {
        fields.push('price = ?');
        values.push(updates.price);
    }
    if (updates.active !== undefined) {
        fields.push('active = ?');
        values.push(updates.active ? 1 : 0);
    }
    
    if (fields.length === 0) return getService(userId, serviceId);
    
    values.push(serviceId);
    values.push(userId);
    
    await dbRun(`UPDATE services SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    return getService(userId, serviceId);
};

const deleteService = async (userId, serviceId) => {
    console.log('🗑️ deleteService called:', { userId, serviceId });
    
    // Check if service exists first
    const existing = await dbGet(
        'SELECT * FROM services WHERE id = ? AND user_id = ?',
        [serviceId, userId]
    );
    console.log('🗑️ Found service in DB:', existing);
    
    if (!existing) {
        console.log('🗑️ Service not found, checking without user filter...');
        const anyService = await dbGet('SELECT * FROM services WHERE id = ?', [serviceId]);
        console.log('🗑️ Service exists for any user:', anyService);
    }
    
    const result = await dbRun(
        'DELETE FROM services WHERE id = ? AND user_id = ?',
        [serviceId, userId]
    );
    console.log('🗑️ Delete result:', result);
    return result.changes > 0;
};

const activateService = async (userId, serviceId) => {
    const result = await dbRun(
        'UPDATE services SET active = 1 WHERE id = ? AND user_id = ?',
        [serviceId, userId]
    );
    return result.changes > 0;
};

const deactivateService = async (userId, serviceId) => {
    const result = await dbRun(
        'UPDATE services SET active = 0 WHERE id = ? AND user_id = ?',
        [serviceId, userId]
    );
    return result.changes > 0;
};

// Format database row naar camelCase
function formatService(row) {
    return {
        id: row.id,
        name: row.name,
        duration: row.duration,
        bufferBefore: row.buffer_before,
        bufferAfter: row.buffer_after,
        description: row.description,
        price: row.price,
        active: row.active === 1,
        createdAt: row.created_at
    };
}

module.exports = {
    createService,
    getService,
    getAllServices,
    getActiveServices,
    updateService,
    deleteService,
    activateService,
    deactivateService
};
