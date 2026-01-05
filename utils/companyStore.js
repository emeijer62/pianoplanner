/**
 * Bedrijfsinstellingen opslag
 */

const fs = require('fs');
const path = require('path');
const DATA_DIR = require('./dataPath');

const SETTINGS_FILE = path.join(DATA_DIR, 'company.json');

// Standaard bedrijfsinstellingen
const defaultSettings = {
    name: '',
    ownerName: '',
    email: '',
    phone: '',
    address: {
        street: '',
        postalCode: '',
        city: '',
        country: '',
        // Geolocation voor wereldwijde ondersteuning
        formattedAddress: '',
        placeId: '',
        lat: null,
        lng: null
    },
    // Beschikbaarheid per dag (0 = zondag, 1 = maandag, etc.)
    availability: {
        0: { available: false, start: '09:00', end: '18:00' }, // Zondag
        1: { available: true, start: '09:00', end: '18:00' },  // Maandag
        2: { available: true, start: '09:00', end: '18:00' },  // Dinsdag
        3: { available: true, start: '09:00', end: '18:00' },  // Woensdag
        4: { available: true, start: '09:00', end: '18:00' },  // Donderdag
        5: { available: true, start: '09:00', end: '18:00' },  // Vrijdag
        6: { available: false, start: '09:00', end: '18:00' }  // Zaterdag
    },
    // Tijdzone voor internationale gebruikers
    timezone: 'Europe/Amsterdam',
    createdAt: null,
    updatedAt: null
};

// Laad instellingen
const getSettings = () => {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            return { ...defaultSettings, ...JSON.parse(data) };
        }
    } catch (error) {
        console.error('Error loading company settings:', error);
    }
    return { ...defaultSettings };
};

// Sla instellingen op
const saveSettings = (settings) => {
    try {
        const current = getSettings();
        const updated = {
            ...current,
            ...settings,
            updatedAt: new Date().toISOString()
        };
        
        if (!updated.createdAt) {
            updated.createdAt = new Date().toISOString();
        }
        
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
        return updated;
    } catch (error) {
        console.error('Error saving company settings:', error);
        throw error;
    }
};

// Haal volledig adres op (voor reistijd berekening)
const getOriginAddress = () => {
    const settings = getSettings();
    const { street, postalCode, city, country, formattedAddress, lat, lng } = settings.address;
    
    // Als coördinaten beschikbaar, gebruik die (meest nauwkeurig)
    if (lat && lng) {
        return `${lat},${lng}`;
    }
    
    // Als geformatteerd adres beschikbaar
    if (formattedAddress) {
        return formattedAddress;
    }
    
    // Bouw adres op uit componenten
    if (city) {
        const parts = [street, postalCode, city, country].filter(Boolean);
        return parts.join(', ');
    }
    
    // Geen adres ingesteld
    return null;
};

// Haal coördinaten op
const getOriginCoordinates = () => {
    const settings = getSettings();
    if (settings.address.lat && settings.address.lng) {
        return {
            lat: settings.address.lat,
            lng: settings.address.lng
        };
    }
    return null;
};

module.exports = {
    getSettings,
    saveSettings,
    getOriginAddress,
    getOriginCoordinates,
    defaultSettings
};
