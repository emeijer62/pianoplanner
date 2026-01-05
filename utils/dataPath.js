/**
 * Centrale configuratie voor data directory
 * Gebruikt Railway volume in productie, lokale data folder in development
 */

const path = require('path');
const fs = require('fs');

// In productie gebruiken we het Railway volume mount point
// In development gebruiken we de lokale data folder
const DATA_DIR = process.env.NODE_ENV === 'production' 
    ? '/app/data' 
    : path.join(__dirname, '..', 'data');

// Zorg dat data directory bestaat
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`📁 Data directory aangemaakt: ${DATA_DIR}`);
}

console.log(`📂 Data directory: ${DATA_DIR}`);

module.exports = DATA_DIR;
