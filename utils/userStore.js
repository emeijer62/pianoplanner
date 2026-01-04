/**
 * Simpele lokale gebruikersopslag (JSON bestand)
 * Geen database nodig!
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Zorg dat data directory bestaat
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Laad gebruikers uit bestand
const loadUsers = () => {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
    return {};
};

// Sla gebruikers op naar bestand
const saveUsers = (users) => {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Error saving users:', error);
    }
};

// Sla gebruiker op of update bestaande
const saveUser = (userData) => {
    const users = loadUsers();
    
    users[userData.id] = {
        ...userData,
        updatedAt: new Date().toISOString()
    };
    
    // Als het een nieuwe gebruiker is, voeg createdAt toe
    if (!users[userData.id].createdAt) {
        users[userData.id].createdAt = new Date().toISOString();
    }
    
    saveUsers(users);
    return users[userData.id];
};

// Haal gebruiker op via ID
const getUser = (userId) => {
    const users = loadUsers();
    return users[userId] || null;
};

// Haal gebruiker op via email
const getUserByEmail = (email) => {
    const users = loadUsers();
    return Object.values(users).find(u => u.email === email) || null;
};

// Haal alle gebruikers op
const getAllUsers = () => {
    return loadUsers();
};

// Verwijder gebruiker
const deleteUser = (userId) => {
    const users = loadUsers();
    if (users[userId]) {
        delete users[userId];
        saveUsers(users);
        return true;
    }
    return false;
};

module.exports = {
    saveUser,
    getUser,
    getUserByEmail,
    getAllUsers,
    deleteUser
};
