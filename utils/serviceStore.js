/**
 * Diensten opslag - Aanpasbare diensten met buffertijden
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const DATA_DIR = require('./dataPath');

const SERVICES_FILE = path.join(DATA_DIR, 'services.json');

// Standaard diensten (worden aangemaakt als er nog geen zijn)
const defaultServices = [
    {
        id: 'stemmen',
        name: 'Piano stemmen',
        duration: 60,
        bufferBefore: 0,
        bufferAfter: 0,
        description: 'Standaard stembeurt voor piano of vleugel',
        price: 95,
        color: '#4CAF50',
        active: true
    },
    {
        id: 'stemmen-concert',
        name: 'Concertstemming',
        duration: 90,
        bufferBefore: 15,
        bufferAfter: 0,
        description: 'Uitgebreide stembeurt voor concerten of opnames',
        price: 145,
        color: '#2196F3',
        active: true
    },
    {
        id: 'reparatie-klein',
        name: 'Kleine reparatie',
        duration: 60,
        bufferBefore: 0,
        bufferAfter: 0,
        description: 'Kleine reparaties en afstellingen',
        price: 75,
        color: '#FF9800',
        active: true
    },
    {
        id: 'reparatie-groot',
        name: 'Grote reparatie',
        duration: 180,
        bufferBefore: 0,
        bufferAfter: 30,
        description: 'Uitgebreide reparatie werkzaamheden',
        price: 0,
        color: '#F44336',
        active: true
    },
    {
        id: 'taxatie',
        name: 'Taxatie',
        duration: 45,
        bufferBefore: 0,
        bufferAfter: 0,
        description: 'Waardebepaling van piano of vleugel',
        price: 65,
        color: '#9C27B0',
        active: true
    },
    {
        id: 'consult',
        name: 'Adviesgesprek',
        duration: 30,
        bufferBefore: 0,
        bufferAfter: 0,
        description: 'Advies over aankoop, onderhoud of verplaatsing',
        price: 0,
        color: '#607D8B',
        active: true
    }
];

// Laad diensten uit bestand
const loadServices = () => {
    try {
        if (fs.existsSync(SERVICES_FILE)) {
            const data = fs.readFileSync(SERVICES_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading services:', error);
    }
    
    // Eerste keer: sla standaard diensten op
    saveAllServices(defaultServices);
    return defaultServices;
};

// Sla alle diensten op
const saveAllServices = (services) => {
    try {
        fs.writeFileSync(SERVICES_FILE, JSON.stringify(services, null, 2));
    } catch (error) {
        console.error('Error saving services:', error);
    }
};

// Haal alle actieve diensten op
const getAllServices = () => {
    const services = loadServices();
    return services.filter(s => s.active !== false);
};

// Haal alle diensten op (inclusief inactieve, voor admin)
const getAllServicesAdmin = () => {
    return loadServices();
};

// Haal dienst op via ID
const getService = (serviceId) => {
    const services = loadServices();
    return services.find(s => s.id === serviceId) || null;
};

// Maak nieuwe dienst aan of update bestaande
const saveService = (serviceData) => {
    const services = loadServices();
    
    const id = serviceData.id || uuidv4();
    const existingIndex = services.findIndex(s => s.id === id);
    
    const service = {
        id,
        name: serviceData.name,
        duration: parseInt(serviceData.duration) || 60,
        bufferBefore: parseInt(serviceData.bufferBefore) || 0,
        bufferAfter: parseInt(serviceData.bufferAfter) || 0,
        description: serviceData.description || '',
        price: parseFloat(serviceData.price) || 0,
        color: serviceData.color || '#4CAF50',
        active: serviceData.active !== false,
        updatedAt: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
        services[existingIndex] = { ...services[existingIndex], ...service };
    } else {
        service.createdAt = new Date().toISOString();
        services.push(service);
    }
    
    saveAllServices(services);
    return service;
};

// Verwijder dienst (soft delete - zet active op false)
const deleteService = (serviceId) => {
    const services = loadServices();
    const index = services.findIndex(s => s.id === serviceId);
    
    if (index >= 0) {
        services[index].active = false;
        services[index].updatedAt = new Date().toISOString();
        saveAllServices(services);
        return true;
    }
    return false;
};

// Activeer dienst opnieuw
const activateService = (serviceId) => {
    const services = loadServices();
    const index = services.findIndex(s => s.id === serviceId);
    
    if (index >= 0) {
        services[index].active = true;
        services[index].updatedAt = new Date().toISOString();
        saveAllServices(services);
        return true;
    }
    return false;
};

// Bereken totale duur inclusief buffers
const getTotalDuration = (serviceId) => {
    const service = getService(serviceId);
    if (!service) return 0;
    return service.bufferBefore + service.duration + service.bufferAfter;
};

module.exports = {
    getAllServices,
    getAllServicesAdmin,
    getService,
    saveService,
    deleteService,
    activateService,
    getTotalDuration,
    defaultServices
};
