/**
 * Piano Store - SQLite versie
 * Piano's en service historie per gebruiker
 */

const { dbRun, dbGet, dbAll } = require('./database');
const { v4: uuidv4 } = require('uuid');

// ==================== PIANO CRUD ====================

const createPiano = async (userId, pianoData) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    await dbRun(`
        INSERT INTO pianos (
            id, user_id, customer_id, brand, model, serial_number, year, type, 
            finish, location, floor, condition, notes, service_interval,
            last_tuning_date, last_tuning_pitch, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        userId,
        pianoData.customerId || null,
        pianoData.brand,
        pianoData.model || null,
        pianoData.serialNumber || null,
        pianoData.year || null,
        pianoData.type || 'upright',
        pianoData.finish || null,
        pianoData.location || null,
        pianoData.floor || null,
        pianoData.condition || 'good',
        pianoData.notes || null,
        pianoData.serviceInterval || 6,
        pianoData.lastTuningDate || null,
        pianoData.lastTuningPitch || null,
        now,
        now
    ]);
    
    return getPiano(userId, id);
};

const getPiano = async (userId, pianoId) => {
    const piano = await dbGet(
        'SELECT * FROM pianos WHERE id = ? AND user_id = ?',
        [pianoId, userId]
    );
    
    if (!piano) return null;
    return formatPiano(piano);
};

const getAllPianos = async (userId) => {
    const pianos = await dbAll(
        'SELECT * FROM pianos WHERE user_id = ? ORDER BY brand, model ASC',
        [userId]
    );
    
    return pianos.map(formatPiano);
};

const getPianosByCustomer = async (userId, customerId) => {
    const pianos = await dbAll(
        'SELECT * FROM pianos WHERE user_id = ? AND customer_id = ? ORDER BY brand ASC',
        [userId, customerId]
    );
    
    return pianos.map(formatPiano);
};

const updatePiano = async (userId, pianoId, updates) => {
    const fields = [];
    const values = [];
    
    const fieldMap = {
        customerId: 'customer_id',
        brand: 'brand',
        model: 'model',
        serialNumber: 'serial_number',
        year: 'year',
        type: 'type',
        finish: 'finish',
        location: 'location',
        floor: 'floor',
        condition: 'condition',
        notes: 'notes',
        serviceInterval: 'service_interval',
        lastTuningDate: 'last_tuning_date',
        lastTuningPitch: 'last_tuning_pitch'
    };
    
    for (const [jsField, dbField] of Object.entries(fieldMap)) {
        if (updates[jsField] !== undefined) {
            fields.push(`${dbField} = ?`);
            values.push(updates[jsField]);
        }
    }
    
    if (fields.length === 0) return getPiano(userId, pianoId);
    
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(pianoId);
    values.push(userId);
    
    await dbRun(`UPDATE pianos SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    return getPiano(userId, pianoId);
};

const deletePiano = async (userId, pianoId) => {
    // Verwijder ook service records
    await dbRun('DELETE FROM service_records WHERE piano_id = ? AND user_id = ?', [pianoId, userId]);
    
    const result = await dbRun(
        'DELETE FROM pianos WHERE id = ? AND user_id = ?',
        [pianoId, userId]
    );
    return result.changes > 0;
};

// ==================== SERVICE RECORDS ====================

const addServiceRecord = async (userId, pianoId, serviceData) => {
    const id = uuidv4();
    
    await dbRun(`
        INSERT INTO service_records (id, user_id, piano_id, type, date, pitch, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        userId,
        pianoId,
        serviceData.type,
        serviceData.date,
        serviceData.pitch || null,
        serviceData.notes || null,
        new Date().toISOString()
    ]);
    
    // Update piano's last tuning date als het een stembeurt is
    if (serviceData.type === 'tuning' || serviceData.type === 'stemmen') {
        await dbRun(`
            UPDATE pianos SET last_tuning_date = ?, last_tuning_pitch = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
        `, [serviceData.date, serviceData.pitch, new Date().toISOString(), pianoId, userId]);
    }
    
    return getServiceRecord(userId, id);
};

const getServiceRecord = async (userId, recordId) => {
    return dbGet(
        'SELECT * FROM service_records WHERE id = ? AND user_id = ?',
        [recordId, userId]
    );
};

const getServiceHistory = async (userId, pianoId) => {
    // Haal service records op
    const records = await dbAll(`
        SELECT id, type, date, pitch, notes, 'record' as source
        FROM service_records 
        WHERE user_id = ? AND piano_id = ?
    `, [userId, pianoId]);
    
    // Haal ook afspraken op die gekoppeld zijn aan deze piano
    const appointments = await dbAll(`
        SELECT id, service_name as type, DATE(start_time) as date, description as notes, 'appointment' as source
        FROM appointments 
        WHERE user_id = ? AND piano_id = ?
    `, [userId, pianoId]);
    
    // Combineer en sorteer op datum (nieuwste eerst)
    const combined = [...records, ...appointments];
    combined.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return combined;
};

const getServiceHistoryByCustomer = async (userId, customerId) => {
    // Service records
    const records = await dbAll(`
        SELECT sr.id, sr.type, sr.date, sr.pitch, sr.notes, 'record' as source,
               p.brand as piano_brand, p.model as piano_model, p.id as piano_id
        FROM service_records sr
        JOIN pianos p ON sr.piano_id = p.id
        WHERE sr.user_id = ? AND p.customer_id = ?
    `, [userId, customerId]);
    
    // Afspraken met piano's van deze klant
    const appointments = await dbAll(`
        SELECT a.id, a.service_name as type, DATE(a.start_time) as date, a.description as notes, 'appointment' as source,
               a.piano_brand, a.piano_model, a.piano_id
        FROM appointments a
        WHERE a.user_id = ? AND a.customer_id = ? AND a.piano_id IS NOT NULL
    `, [userId, customerId]);
    
    // Combineer en sorteer
    const combined = [...records, ...appointments];
    combined.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return combined.map(r => ({
        ...r,
        pianoName: `${r.piano_brand || ''} ${r.piano_model || ''}`.trim()
    }));
};

const deleteServiceRecord = async (userId, pianoId, recordId) => {
    const result = await dbRun(
        'DELETE FROM service_records WHERE id = ? AND piano_id = ? AND user_id = ?',
        [recordId, pianoId, userId]
    );
    return result.changes > 0;
};

// ==================== PIANO's DIE SERVICE NODIG HEBBEN ====================

const getPianosDueForService = async (userId) => {
    const pianos = await dbAll(`
        SELECT * FROM pianos 
        WHERE user_id = ? 
        AND last_tuning_date IS NOT NULL
        AND date(last_tuning_date, '+' || service_interval || ' months') <= date('now')
        ORDER BY last_tuning_date ASC
    `, [userId]);
    
    return pianos.map(formatPiano);
};

// Format database row naar camelCase
function formatPiano(row) {
    return {
        id: row.id,
        customerId: row.customer_id,
        brand: row.brand,
        model: row.model,
        serialNumber: row.serial_number,
        year: row.year,
        type: row.type,
        finish: row.finish,
        location: row.location,
        floor: row.floor,
        condition: row.condition,
        notes: row.notes,
        serviceInterval: row.service_interval,
        lastTuningDate: row.last_tuning_date,
        lastTuningPitch: row.last_tuning_pitch,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

// Piano merken lijst
const PIANO_BRANDS = [
    'Steinway & Sons', 'Bösendorfer', 'Fazioli', 'Bechstein', 'Blüthner',
    'Yamaha', 'Kawai', 'Schimmel', 'Grotrian', 'August Förster',
    'Petrof', 'Estonia', 'Sauter', 'Seiler', 'Feurich',
    'Boston', 'Essex', 'Ritmuller', 'Pearl River', 'Hailun',
    'Roland', 'Casio', 'Korg', 'Nord', 'Clavia'
];

module.exports = {
    createPiano,
    getPiano,
    getAllPianos,
    getPianosByCustomer,
    updatePiano,
    deletePiano,
    addServiceRecord,
    getServiceRecord,
    getServiceHistory,
    getServiceHistoryByCustomer,
    deleteServiceRecord,
    getPianosDueForService,
    PIANO_BRANDS
};
