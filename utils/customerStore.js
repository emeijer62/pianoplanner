/**
 * Klantenbeheer - Lokale JSON opslag
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');

// Zorg dat data directory bestaat
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Laad klanten uit bestand
const loadCustomers = () => {
    try {
        if (fs.existsSync(CUSTOMERS_FILE)) {
            const data = fs.readFileSync(CUSTOMERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading customers:', error);
    }
    return {};
};

// Sla klanten op naar bestand
const saveCustomers = (customers) => {
    try {
        fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(customers, null, 2));
    } catch (error) {
        console.error('Error saving customers:', error);
    }
};

// Maak nieuwe klant aan of update bestaande
const saveCustomer = (customerData) => {
    const customers = loadCustomers();
    
    const id = customerData.id || uuidv4();
    
    customers[id] = {
        id,
        name: customerData.name,
        email: customerData.email || '',
        phone: customerData.phone || '',
        address: {
            street: customerData.street || '',
            city: customerData.city || '',
            postalCode: customerData.postalCode || '',
            country: customerData.country || '',
            // Geolocation voor wereldwijde ondersteuning
            formattedAddress: customerData.formattedAddress || '',
            placeId: customerData.placeId || '',
            lat: customerData.lat || null,
            lng: customerData.lng || null
        },
        // Piano informatie
        pianos: customerData.pianos || [],
        notes: customerData.notes || '',
        // Metadata
        createdAt: customers[id]?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    saveCustomers(customers);
    return customers[id];
};

// Voeg piano toe aan klant
const addPianoToCustomer = (customerId, pianoData) => {
    const customers = loadCustomers();
    
    if (!customers[customerId]) {
        return null;
    }
    
    const piano = {
        id: uuidv4(),
        brand: pianoData.brand || '',
        model: pianoData.model || '',
        type: pianoData.type || 'upright', // upright, grand
        serialNumber: pianoData.serialNumber || '',
        year: pianoData.year || '',
        notes: pianoData.notes || '',
        lastService: pianoData.lastService || null
    };
    
    customers[customerId].pianos = customers[customerId].pianos || [];
    customers[customerId].pianos.push(piano);
    customers[customerId].updatedAt = new Date().toISOString();
    
    saveCustomers(customers);
    return piano;
};

// Haal klant op via ID
const getCustomer = (customerId) => {
    const customers = loadCustomers();
    return customers[customerId] || null;
};

// Zoek klanten op naam, email of stad
const searchCustomers = (query) => {
    const customers = loadCustomers();
    const q = query.toLowerCase();
    
    return Object.values(customers).filter(customer => 
        customer.name.toLowerCase().includes(q) ||
        customer.email.toLowerCase().includes(q) ||
        customer.address.city.toLowerCase().includes(q) ||
        customer.phone.includes(q)
    );
};

// Haal alle klanten op
const getAllCustomers = () => {
    return loadCustomers();
};

// Verwijder klant
const deleteCustomer = (customerId) => {
    const customers = loadCustomers();
    if (customers[customerId]) {
        delete customers[customerId];
        saveCustomers(customers);
        return true;
    }
    return false;
};

// Haal klanten op in een bepaalde stad (voor route planning)
const getCustomersByCity = (city) => {
    const customers = loadCustomers();
    return Object.values(customers).filter(
        c => c.address.city.toLowerCase() === city.toLowerCase()
    );
};

module.exports = {
    saveCustomer,
    addPianoToCustomer,
    getCustomer,
    searchCustomers,
    getAllCustomers,
    deleteCustomer,
    getCustomersByCity
};
