/**
 * Diensten configuratie voor PianoPlanner
 * Hier definieer je alle standaard diensten met hun duur
 */

const services = [
    {
        id: 'stemmen',
        name: 'Piano stemmen',
        duration: 60, // minuten
        description: 'Standaard stembeurt voor piano of vleugel',
        price: 95,
        color: '#4CAF50'
    },
    {
        id: 'stemmen-concert',
        name: 'Concertstemming',
        duration: 90,
        description: 'Uitgebreide stembeurt voor concerten of opnames',
        price: 145,
        color: '#2196F3'
    },
    {
        id: 'reparatie-klein',
        name: 'Kleine reparatie',
        duration: 60,
        description: 'Kleine reparaties en afstellingen',
        price: 75,
        color: '#FF9800'
    },
    {
        id: 'reparatie-groot',
        name: 'Grote reparatie',
        duration: 180,
        description: 'Uitgebreide reparatie werkzaamheden',
        price: 0, // Op aanvraag
        color: '#F44336'
    },
    {
        id: 'taxatie',
        name: 'Taxatie',
        duration: 45,
        description: 'Waardebepaling van piano of vleugel',
        price: 65,
        color: '#9C27B0'
    },
    {
        id: 'consult',
        name: 'Adviesgesprek',
        duration: 30,
        description: 'Advies over aankoop, onderhoud of verplaatsing',
        price: 0, // Gratis
        color: '#607D8B'
    }
];

// Haal dienst op via ID
const getService = (serviceId) => {
    return services.find(s => s.id === serviceId) || null;
};

// Haal alle diensten op
const getAllServices = () => {
    return services;
};

module.exports = {
    services,
    getService,
    getAllServices
};
