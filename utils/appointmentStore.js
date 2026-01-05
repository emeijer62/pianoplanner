/**
 * Lokale afspraken opslag per gebruiker
 * Onafhankelijk van Google Calendar
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const DATA_DIR = require('./dataPath');

// Helper: get file path voor gebruiker
const getFilePath = (userId) => {
    return path.join(DATA_DIR, `appointments_${userId}.json`);
};

// Laad afspraken voor gebruiker
const loadAppointments = (userId) => {
    try {
        const filePath = getFilePath(userId);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading appointments:', error);
    }
    return [];
};

// Sla afspraken op
const saveAppointments = (userId, appointments) => {
    try {
        const filePath = getFilePath(userId);
        fs.writeFileSync(filePath, JSON.stringify(appointments, null, 2));
    } catch (error) {
        console.error('Error saving appointments:', error);
    }
};

// ==================== CRUD OPERATIONS ====================

// Maak nieuwe afspraak
const createAppointment = (userId, appointmentData) => {
    const appointments = loadAppointments(userId);
    
    const appointment = {
        id: uuidv4(),
        title: appointmentData.title || 'Nieuwe afspraak',
        description: appointmentData.description || '',
        location: appointmentData.location || '',
        start: appointmentData.start, // ISO string
        end: appointmentData.end, // ISO string
        allDay: appointmentData.allDay || false,
        // Klant koppeling
        customerId: appointmentData.customerId || null,
        customerName: appointmentData.customerName || '',
        // Dienst koppeling
        serviceId: appointmentData.serviceId || null,
        serviceName: appointmentData.serviceName || '',
        // Piano koppeling
        pianoId: appointmentData.pianoId || null,
        pianoBrand: appointmentData.pianoBrand || '',
        pianoModel: appointmentData.pianoModel || '',
        // Status
        status: appointmentData.status || 'scheduled', // scheduled, completed, cancelled
        color: appointmentData.color || '#4CAF50',
        // Google sync
        googleEventId: appointmentData.googleEventId || null,
        lastSynced: null,
        // Timestamps
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    appointments.push(appointment);
    saveAppointments(userId, appointments);
    
    return appointment;
};

// Haal alle afspraken op
const getAllAppointments = (userId) => {
    return loadAppointments(userId);
};

// Haal afspraken op voor een periode
const getAppointmentsByDateRange = (userId, startDate, endDate) => {
    const appointments = loadAppointments(userId);
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    return appointments.filter(apt => {
        const aptStart = new Date(apt.start);
        return aptStart >= start && aptStart <= end;
    });
};

// Haal afspraken voor een specifieke dag
const getAppointmentsForDay = (userId, date) => {
    const appointments = loadAppointments(userId);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    
    return appointments.filter(apt => {
        const aptStart = new Date(apt.start);
        return aptStart >= dayStart && aptStart <= dayEnd;
    });
};

// Haal één afspraak op
const getAppointment = (userId, appointmentId) => {
    const appointments = loadAppointments(userId);
    return appointments.find(a => a.id === appointmentId) || null;
};

// Update afspraak
const updateAppointment = (userId, appointmentId, updates) => {
    const appointments = loadAppointments(userId);
    const index = appointments.findIndex(a => a.id === appointmentId);
    
    if (index === -1) {
        return null;
    }
    
    appointments[index] = {
        ...appointments[index],
        ...updates,
        id: appointmentId, // ID mag niet wijzigen
        updatedAt: new Date().toISOString()
    };
    
    saveAppointments(userId, appointments);
    return appointments[index];
};

// Verwijder afspraak
const deleteAppointment = (userId, appointmentId) => {
    const appointments = loadAppointments(userId);
    const index = appointments.findIndex(a => a.id === appointmentId);
    
    if (index === -1) {
        return false;
    }
    
    appointments.splice(index, 1);
    saveAppointments(userId, appointments);
    return true;
};

// Haal afspraken op voor een klant
const getAppointmentsByCustomer = (userId, customerId) => {
    const appointments = loadAppointments(userId);
    return appointments.filter(a => a.customerId === customerId);
};

// Haal afspraken op voor een piano
const getAppointmentsByPiano = (userId, pianoId) => {
    const appointments = loadAppointments(userId);
    return appointments.filter(a => a.pianoId === pianoId);
};

// Haal komende afspraken op (vandaag en later)
const getUpcomingAppointments = (userId, limit = 10) => {
    const appointments = loadAppointments(userId);
    const now = new Date();
    
    return appointments
        .filter(a => new Date(a.start) >= now && a.status !== 'cancelled')
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, limit);
};

// Markeer afspraak als voltooid
const completeAppointment = (userId, appointmentId, notes = '') => {
    return updateAppointment(userId, appointmentId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        completionNotes: notes
    });
};

// Annuleer afspraak
const cancelAppointment = (userId, appointmentId, reason = '') => {
    return updateAppointment(userId, appointmentId, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancellationReason: reason
    });
};

module.exports = {
    createAppointment,
    getAllAppointments,
    getAppointmentsByDateRange,
    getAppointmentsForDay,
    getAppointment,
    updateAppointment,
    deleteAppointment,
    getAppointmentsByCustomer,
    getAppointmentsByPiano,
    getUpcomingAppointments,
    completeAppointment,
    cancelAppointment
};
