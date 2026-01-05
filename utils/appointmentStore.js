/**
 * Appointment Store - SQLite versie
 * Afspraken beheer per gebruiker
 */

const { dbRun, dbGet, dbAll } = require('./database');
const { v4: uuidv4 } = require('uuid');

// ==================== APPOINTMENT CRUD ====================

const createAppointment = async (userId, appointmentData) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    await dbRun(`
        INSERT INTO appointments (
            id, user_id, title, description, location,
            start_time, end_time, all_day,
            customer_id, customer_name,
            service_id, service_name,
            piano_id, piano_brand, piano_model,
            status, color, google_event_id,
            travel_time_minutes, travel_distance_km, travel_start_time, origin_address,
            created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        userId,
        appointmentData.title || 'Nieuwe afspraak',
        appointmentData.description || null,
        appointmentData.location || null,
        appointmentData.start,
        appointmentData.end,
        appointmentData.allDay ? 1 : 0,
        appointmentData.customerId || null,
        appointmentData.customerName || null,
        appointmentData.serviceId || null,
        appointmentData.serviceName || null,
        appointmentData.pianoId || null,
        appointmentData.pianoBrand || null,
        appointmentData.pianoModel || null,
        appointmentData.status || 'scheduled',
        appointmentData.color || '#4CAF50',
        appointmentData.googleEventId || null,
        appointmentData.travelTimeMinutes || null,
        appointmentData.travelDistanceKm || null,
        appointmentData.travelStartTime || null,
        appointmentData.originAddress || null,
        now,
        now
    ]);
    
    return getAppointment(userId, id);
};

const getAppointment = async (userId, appointmentId) => {
    const appointment = await dbGet(
        'SELECT * FROM appointments WHERE id = ? AND user_id = ?',
        [appointmentId, userId]
    );
    
    if (!appointment) return null;
    return formatAppointment(appointment);
};

const getAllAppointments = async (userId) => {
    const appointments = await dbAll(
        'SELECT * FROM appointments WHERE user_id = ? ORDER BY start_time ASC',
        [userId]
    );
    
    return appointments.map(formatAppointment);
};

const getAppointmentsByDateRange = async (userId, startDate, endDate) => {
    const appointments = await dbAll(`
        SELECT * FROM appointments 
        WHERE user_id = ? 
        AND start_time >= ? 
        AND start_time <= ?
        ORDER BY start_time ASC
    `, [userId, startDate, endDate]);
    
    return appointments.map(formatAppointment);
};

const getAppointmentsForDay = async (userId, date) => {
    const startOfDay = `${date}T00:00:00`;
    const endOfDay = `${date}T23:59:59`;
    
    return getAppointmentsByDateRange(userId, startOfDay, endOfDay);
};

const getUpcomingAppointments = async (userId, limit = 10) => {
    const now = new Date().toISOString();
    
    const appointments = await dbAll(`
        SELECT * FROM appointments 
        WHERE user_id = ? 
        AND start_time >= ?
        AND status != 'cancelled'
        ORDER BY start_time ASC
        LIMIT ?
    `, [userId, now, limit]);
    
    return appointments.map(formatAppointment);
};

const updateAppointment = async (userId, appointmentId, updates) => {
    const fields = [];
    const values = [];
    
    const fieldMap = {
        title: 'title',
        description: 'description',
        location: 'location',
        start: 'start_time',
        end: 'end_time',
        allDay: 'all_day',
        customerId: 'customer_id',
        customerName: 'customer_name',
        serviceId: 'service_id',
        serviceName: 'service_name',
        pianoId: 'piano_id',
        pianoBrand: 'piano_brand',
        pianoModel: 'piano_model',
        status: 'status',
        color: 'color',
        googleEventId: 'google_event_id',
        lastSynced: 'last_synced'
    };
    
    for (const [jsField, dbField] of Object.entries(fieldMap)) {
        if (updates[jsField] !== undefined) {
            fields.push(`${dbField} = ?`);
            if (jsField === 'allDay') {
                values.push(updates[jsField] ? 1 : 0);
            } else {
                values.push(updates[jsField]);
            }
        }
    }
    
    if (fields.length === 0) return getAppointment(userId, appointmentId);
    
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(appointmentId);
    values.push(userId);
    
    await dbRun(`UPDATE appointments SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    return getAppointment(userId, appointmentId);
};

const deleteAppointment = async (userId, appointmentId) => {
    const result = await dbRun(
        'DELETE FROM appointments WHERE id = ? AND user_id = ?',
        [appointmentId, userId]
    );
    return result.changes > 0;
};

// ==================== AFSPRAKEN PER KLANT ====================

const getAppointmentsByCustomer = async (userId, customerId) => {
    const appointments = await dbAll(`
        SELECT * FROM appointments 
        WHERE user_id = ? AND customer_id = ?
        ORDER BY start_time DESC
    `, [userId, customerId]);
    
    return appointments.map(formatAppointment);
};

// ==================== STATISTICS ====================

const getAppointmentStats = async (userId) => {
    const now = new Date().toISOString();
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    
    const [total, upcoming, thisMonth, completed] = await Promise.all([
        dbGet('SELECT COUNT(*) as count FROM appointments WHERE user_id = ?', [userId]),
        dbGet('SELECT COUNT(*) as count FROM appointments WHERE user_id = ? AND start_time >= ?', [userId, now]),
        dbGet('SELECT COUNT(*) as count FROM appointments WHERE user_id = ? AND start_time >= ?', [userId, startOfMonth]),
        dbGet('SELECT COUNT(*) as count FROM appointments WHERE user_id = ? AND status = ?', [userId, 'completed'])
    ]);
    
    return {
        total: total.count,
        upcoming: upcoming.count,
        thisMonth: thisMonth.count,
        completed: completed.count
    };
};

// Format database row naar camelCase/legacy structuur
function formatAppointment(row) {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        location: row.location,
        start: row.start_time,
        end: row.end_time,
        allDay: row.all_day === 1,
        customerId: row.customer_id,
        customerName: row.customer_name,
        serviceId: row.service_id,
        serviceName: row.service_name,
        pianoId: row.piano_id,
        pianoBrand: row.piano_brand,
        pianoModel: row.piano_model,
        status: row.status,
        color: row.color,
        googleEventId: row.google_event_id,
        lastSynced: row.last_synced,
        // Travel info
        travelTimeMinutes: row.travel_time_minutes,
        travelDistanceKm: row.travel_distance_km,
        travelStartTime: row.travel_start_time,
        originAddress: row.origin_address,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

module.exports = {
    createAppointment,
    getAppointment,
    getAllAppointments,
    getAppointmentsByDateRange,
    getAppointmentsForDay,
    getUpcomingAppointments,
    updateAppointment,
    deleteAppointment,
    getAppointmentsByCustomer,
    getAppointmentStats
};
