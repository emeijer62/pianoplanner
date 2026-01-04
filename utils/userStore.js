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

// ============================================
// SUBSCRIPTION MANAGEMENT
// ============================================

const TRIAL_DAYS = 14;

// Start trial voor een gebruiker
const startTrial = (userId) => {
    const users = loadUsers();
    if (users[userId]) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
        
        users[userId].subscription = {
            status: 'trialing',
            trialStart: new Date().toISOString(),
            trialEnd: trialEnd.toISOString(),
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            currentPeriodEnd: null
        };
        
        saveUsers(users);
        return users[userId];
    }
    return null;
};

// Update subscription na Stripe betaling
const updateSubscription = (userId, subscriptionData) => {
    const users = loadUsers();
    if (users[userId]) {
        users[userId].subscription = {
            ...users[userId].subscription,
            ...subscriptionData,
            updatedAt: new Date().toISOString()
        };
        saveUsers(users);
        return users[userId];
    }
    return null;
};

// Check subscription status
const getSubscriptionStatus = (userId) => {
    const users = loadUsers();
    const user = users[userId];
    
    if (!user || !user.subscription) {
        return { status: 'none', hasAccess: false };
    }
    
    const sub = user.subscription;
    const now = new Date();
    
    // Check trial
    if (sub.status === 'trialing') {
        const trialEnd = new Date(sub.trialEnd);
        if (now < trialEnd) {
            const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
            return { 
                status: 'trialing', 
                hasAccess: true, 
                daysLeft,
                trialEnd: sub.trialEnd
            };
        } else {
            // Trial expired
            return { status: 'trial_expired', hasAccess: false };
        }
    }
    
    // Check active subscription
    if (sub.status === 'active') {
        const periodEnd = new Date(sub.currentPeriodEnd);
        if (now < periodEnd) {
            return { 
                status: 'active', 
                hasAccess: true,
                currentPeriodEnd: sub.currentPeriodEnd
            };
        }
    }
    
    // Check canceled but still in period
    if (sub.status === 'canceled' && sub.currentPeriodEnd) {
        const periodEnd = new Date(sub.currentPeriodEnd);
        if (now < periodEnd) {
            return { 
                status: 'canceled', 
                hasAccess: true,
                currentPeriodEnd: sub.currentPeriodEnd
            };
        }
    }
    
    return { status: sub.status || 'inactive', hasAccess: false };
};

// Update Stripe customer ID
const setStripeCustomerId = (userId, stripeCustomerId) => {
    const users = loadUsers();
    if (users[userId]) {
        if (!users[userId].subscription) {
            users[userId].subscription = {};
        }
        users[userId].subscription.stripeCustomerId = stripeCustomerId;
        saveUsers(users);
        return users[userId];
    }
    return null;
};

// Haal gebruiker op via Stripe Customer ID
const getUserByStripeCustomerId = (stripeCustomerId) => {
    const users = loadUsers();
    return Object.values(users).find(
        u => u.subscription?.stripeCustomerId === stripeCustomerId
    ) || null;
};

module.exports = {
    saveUser,
    getUser,
    getUserByEmail,
    getAllUsers,
    deleteUser,
    // Subscription functions
    startTrial,
    updateSubscription,
    getSubscriptionStatus,
    setStripeCustomerId,
    getUserByStripeCustomerId,
    TRIAL_DAYS
};
