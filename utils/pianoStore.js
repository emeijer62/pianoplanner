/**
 * Piano opslag - Piano's per gebruiker
 * Elke gebruiker heeft zijn eigen piano database
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Zorg dat data directory bestaat
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Haal bestandspad voor gebruiker's piano's
const getPianosFile = (userId) => {
    return path.join(DATA_DIR, `pianos_${userId}.json`);
};

// Laad piano's voor een gebruiker
const loadPianos = (userId) => {
    try {
        const file = getPianosFile(userId);
        if (fs.existsSync(file)) {
            const data = fs.readFileSync(file, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading pianos:', error);
    }
    return {};
};

// Sla piano's op
const savePianos = (userId, pianos) => {
    try {
        const file = getPianosFile(userId);
        fs.writeFileSync(file, JSON.stringify(pianos, null, 2));
    } catch (error) {
        console.error('Error saving pianos:', error);
    }
};

// Genereer unieke piano ID
const generatePianoId = () => {
    return 'piano_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// ============================================
// PIANO CRUD
// ============================================

// Maak nieuwe piano aan
const createPiano = (userId, pianoData) => {
    const pianos = loadPianos(userId);
    const pianoId = generatePianoId();
    
    pianos[pianoId] = {
        id: pianoId,
        customerId: pianoData.customerId || null,
        // Piano info
        brand: pianoData.brand || '',
        model: pianoData.model || '',
        serialNumber: pianoData.serialNumber || '',
        year: pianoData.year || null,
        type: pianoData.type || 'upright', // upright, grand, digital
        finish: pianoData.finish || '', // zwart, wit, hout, etc.
        // Locatie
        location: pianoData.location || '', // Woonkamer, studio, etc.
        floor: pianoData.floor || '', // Begane grond, 1e verdieping
        hasElevator: pianoData.hasElevator || false,
        // Technische info
        lastTuningDate: pianoData.lastTuningDate || null,
        lastTuningPitch: pianoData.lastTuningPitch || '440',
        condition: pianoData.condition || 'good', // excellent, good, fair, poor
        // Notities
        notes: pianoData.notes || '',
        // Service interval (in maanden)
        serviceInterval: pianoData.serviceInterval || 6,
        // Metadata
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    savePianos(userId, pianos);
    return pianos[pianoId];
};

// Haal piano op
const getPiano = (userId, pianoId) => {
    const pianos = loadPianos(userId);
    return pianos[pianoId] || null;
};

// Haal alle piano's op voor een gebruiker
const getAllPianos = (userId) => {
    return loadPianos(userId);
};

// Haal piano's op voor een specifieke klant
const getPianosByCustomer = (userId, customerId) => {
    const pianos = loadPianos(userId);
    return Object.values(pianos).filter(p => p.customerId === customerId);
};

// Update piano
const updatePiano = (userId, pianoId, updates) => {
    const pianos = loadPianos(userId);
    
    if (!pianos[pianoId]) {
        return null;
    }
    
    pianos[pianoId] = {
        ...pianos[pianoId],
        ...updates,
        id: pianoId, // ID kan niet veranderen
        updatedAt: new Date().toISOString()
    };
    
    savePianos(userId, pianos);
    return pianos[pianoId];
};

// Verwijder piano
const deletePiano = (userId, pianoId) => {
    const pianos = loadPianos(userId);
    
    if (pianos[pianoId]) {
        delete pianos[pianoId];
        savePianos(userId, pianos);
        return true;
    }
    return false;
};

// ============================================
// SERVICE HISTORIE
// ============================================

// Haal service historie bestand
const getServiceFile = (userId) => {
    return path.join(DATA_DIR, `services_${userId}.json`);
};

// Laad services
const loadServices = (userId) => {
    try {
        const file = getServiceFile(userId);
        if (fs.existsSync(file)) {
            const data = fs.readFileSync(file, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading services:', error);
    }
    return {};
};

// Sla services op
const saveServices = (userId, services) => {
    try {
        const file = getServiceFile(userId);
        fs.writeFileSync(file, JSON.stringify(services, null, 2));
    } catch (error) {
        console.error('Error saving services:', error);
    }
};

// Genereer service ID
const generateServiceId = () => {
    return 'service_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Voeg service record toe
const addServiceRecord = (userId, pianoId, serviceData) => {
    const services = loadServices(userId);
    const serviceId = generateServiceId();
    
    if (!services[pianoId]) {
        services[pianoId] = [];
    }
    
    const record = {
        id: serviceId,
        pianoId: pianoId,
        date: serviceData.date || new Date().toISOString(),
        type: serviceData.type || 'tuning', // tuning, repair, regulation, voicing, cleaning, other
        // Stemming details
        pitchBefore: serviceData.pitchBefore || '',
        pitchAfter: serviceData.pitchAfter || '440',
        // Werk uitgevoerd
        workPerformed: serviceData.workPerformed || '',
        // Observaties en aanbevelingen
        observations: serviceData.observations || '',
        recommendations: serviceData.recommendations || '',
        // Volgende service
        nextServiceDate: serviceData.nextServiceDate || null,
        // Kosten
        cost: serviceData.cost || 0,
        invoiceId: serviceData.invoiceId || null,
        // Metadata
        createdAt: new Date().toISOString()
    };
    
    services[pianoId].push(record);
    saveServices(userId, services);
    
    // Update lastTuningDate op piano als het een stembeurt was
    if (serviceData.type === 'tuning') {
        updatePiano(userId, pianoId, {
            lastTuningDate: record.date,
            lastTuningPitch: record.pitchAfter || '440'
        });
    }
    
    return record;
};

// Haal service historie voor een piano
const getServiceHistory = (userId, pianoId) => {
    const services = loadServices(userId);
    return services[pianoId] || [];
};

// Haal alle services (voor overzichten)
const getAllServices = (userId) => {
    return loadServices(userId);
};

// Verwijder service record
const deleteServiceRecord = (userId, pianoId, serviceId) => {
    const services = loadServices(userId);
    
    if (services[pianoId]) {
        services[pianoId] = services[pianoId].filter(s => s.id !== serviceId);
        saveServices(userId, services);
        return true;
    }
    return false;
};

// ============================================
// HULP FUNCTIES
// ============================================

// Haal piano's die service nodig hebben
const getPianosDueForService = (userId) => {
    const pianos = loadPianos(userId);
    const now = new Date();
    const due = [];
    
    Object.values(pianos).forEach(piano => {
        if (piano.lastTuningDate && piano.serviceInterval) {
            const lastService = new Date(piano.lastTuningDate);
            const nextDue = new Date(lastService);
            nextDue.setMonth(nextDue.getMonth() + piano.serviceInterval);
            
            if (nextDue <= now) {
                due.push({
                    ...piano,
                    dueDate: nextDue,
                    monthsOverdue: Math.floor((now - nextDue) / (1000 * 60 * 60 * 24 * 30))
                });
            }
        }
    });
    
    return due.sort((a, b) => a.dueDate - b.dueDate);
};

// Piano merken lijst (voor autocomplete)
const PIANO_BRANDS = [
    'Steinway & Sons', 'Yamaha', 'Kawai', 'Bösendorfer', 'Bechstein',
    'Blüthner', 'Fazioli', 'Grotrian', 'Schimmel', 'Petrof',
    'Boston', 'Essex', 'Roland', 'Casio', 'Nord',
    'Samick', 'Young Chang', 'Pearl River', 'Hailun', 'Ritmuller',
    'August Förster', 'Sauter', 'Seiler', 'Feurich', 'Hoffmann',
    'Kemble', 'Broadwood', 'Ibach', 'Pleyel', 'Erard',
    'Mason & Hamlin', 'Baldwin', 'Chickering', 'Knabe', 'Wurlitzer',
    'Overig'
];

module.exports = {
    // Piano CRUD
    createPiano,
    getPiano,
    getAllPianos,
    getPianosByCustomer,
    updatePiano,
    deletePiano,
    // Service historie
    addServiceRecord,
    getServiceHistory,
    getAllServices,
    deleteServiceRecord,
    // Hulp functies
    getPianosDueForService,
    PIANO_BRANDS
};
