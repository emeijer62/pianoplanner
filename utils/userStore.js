/**
 * Simpele lokale gebruikersopslag (JSON bestand)
 * Geen database nodig!
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Zorg dat data directory bestaat
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================
// PASSWORD HASHING
// ============================================

// Hash wachtwoord met salt
const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
};

// Verifieer wachtwoord
const verifyPassword = (password, storedHash) => {
    const [salt, hash] = storedHash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
};

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

// ============================================
// EMAIL/PASSWORD REGISTRATION & LOGIN
// ============================================

// Genereer unieke gebruikers-ID
const generateUserId = () => {
    return 'user_' + crypto.randomBytes(12).toString('hex');
};

// Registreer nieuwe gebruiker met email/wachtwoord
const registerUser = (email, password, name) => {
    const users = loadUsers();
    
    // Check of email al bestaat
    const existingUser = Object.values(users).find(u => u.email === email);
    if (existingUser) {
        return { error: 'Email is al geregistreerd' };
    }
    
    // Valideer wachtwoord
    if (password.length < 6) {
        return { error: 'Wachtwoord moet minimaal 6 tekens zijn' };
    }
    
    const userId = generateUserId();
    const hashedPassword = hashPassword(password);
    
    users[userId] = {
        id: userId,
        email: email,
        name: name || email.split('@')[0],
        passwordHash: hashedPassword,
        authType: 'email', // 'email' of 'google'
        picture: null,
        tokens: null,
        // Goedkeuringsstatus - nieuwe gebruikers moeten goedgekeurd worden
        approvalStatus: 'pending', // 'pending', 'approved', 'rejected'
        approvedAt: null,
        approvedBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Calendar sync settings
        calendarSync: {
            enabled: false,
            googleCalendarId: null,
            lastSync: null,
            syncDirection: 'both' // 'both', 'toGoogle', 'fromGoogle'
        }
    };
    
    saveUsers(users);
    console.log(`📋 Nieuwe registratie wacht op goedkeuring: ${email}`);
    return { user: users[userId], needsApproval: true };
};

// Login met email/wachtwoord
const loginWithEmail = (email, password) => {
    const users = loadUsers();
    const user = Object.values(users).find(u => u.email === email);
    
    if (!user) {
        return { error: 'Email niet gevonden' };
    }
    
    // Check of gebruiker via email is geregistreerd
    if (user.authType === 'google' && !user.passwordHash) {
        return { error: 'Deze account gebruikt Google login. Klik op "Inloggen met Google".' };
    }
    
    // Verifieer wachtwoord
    if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        return { error: 'Onjuist wachtwoord' };
    }
    
    // Check goedkeuringsstatus
    if (user.approvalStatus === 'pending') {
        return { error: 'Je account wacht nog op goedkeuring door de beheerder.' };
    }
    
    if (user.approvalStatus === 'rejected') {
        return { error: 'Je account is helaas afgewezen. Neem contact op met de beheerder.' };
    }
    
    return { user };
};

// Voeg wachtwoord toe aan bestaande Google gebruiker (optioneel)
const setPasswordForUser = (userId, password) => {
    const users = loadUsers();
    if (!users[userId]) {
        return { error: 'Gebruiker niet gevonden' };
    }
    
    if (password.length < 6) {
        return { error: 'Wachtwoord moet minimaal 6 tekens zijn' };
    }
    
    users[userId].passwordHash = hashPassword(password);
    users[userId].updatedAt = new Date().toISOString();
    saveUsers(users);
    
    return { success: true };
};

// Update gebruikersprofiel (naam en email)
const updateUserProfile = (userId, updates) => {
    const users = loadUsers();
    if (!users[userId]) {
        return { error: 'Gebruiker niet gevonden' };
    }
    
    // Als email wordt gewijzigd, check of deze al bestaat
    if (updates.email && updates.email !== users[userId].email) {
        const existingUser = Object.values(users).find(u => u.email === updates.email && u.id !== userId);
        if (existingUser) {
            return { error: 'Dit e-mailadres is al in gebruik' };
        }
        users[userId].email = updates.email;
    }
    
    // Update naam als opgegeven
    if (updates.name) {
        users[userId].name = updates.name;
    }
    
    users[userId].updatedAt = new Date().toISOString();
    saveUsers(users);
    
    return { user: users[userId] };
};

// Wijzig wachtwoord (met verificatie van huidige wachtwoord)
const changePassword = (userId, currentPassword, newPassword) => {
    const users = loadUsers();
    if (!users[userId]) {
        return { error: 'Gebruiker niet gevonden' };
    }
    
    const user = users[userId];
    
    // Google-only gebruikers moeten eerst een wachtwoord instellen
    if (user.authType === 'google' && !user.passwordHash) {
        // Voor Google gebruikers zonder wachtwoord, stel nieuw wachtwoord in
        if (newPassword.length < 6) {
            return { error: 'Wachtwoord moet minimaal 6 tekens zijn' };
        }
        users[userId].passwordHash = hashPassword(newPassword);
        users[userId].updatedAt = new Date().toISOString();
        saveUsers(users);
        return { success: true, message: 'Wachtwoord ingesteld' };
    }
    
    // Verifieer huidig wachtwoord
    if (!verifyPassword(currentPassword, user.passwordHash)) {
        return { error: 'Huidig wachtwoord is onjuist' };
    }
    
    // Valideer nieuw wachtwoord
    if (newPassword.length < 6) {
        return { error: 'Nieuw wachtwoord moet minimaal 6 tekens zijn' };
    }
    
    if (currentPassword === newPassword) {
        return { error: 'Nieuw wachtwoord moet anders zijn dan huidig wachtwoord' };
    }
    
    users[userId].passwordHash = hashPassword(newPassword);
    users[userId].updatedAt = new Date().toISOString();
    saveUsers(users);
    
    return { success: true, message: 'Wachtwoord gewijzigd' };
};

// Update calendar sync settings
const updateCalendarSync = (userId, syncSettings) => {
    const users = loadUsers();
    if (!users[userId]) {
        return { error: 'Gebruiker niet gevonden' };
    }
    
    users[userId].calendarSync = {
        ...users[userId].calendarSync,
        ...syncSettings,
        updatedAt: new Date().toISOString()
    };
    
    saveUsers(users);
    return { user: users[userId] };
};

// Get calendar sync settings
const getCalendarSync = (userId) => {
    const users = loadUsers();
    const user = users[userId];
    if (!user) return null;
    
    return user.calendarSync || {
        enabled: false,
        googleCalendarId: null,
        lastSync: null,
        syncDirection: 'both'
    };
};

// ============================================
// ADMIN APPROVAL FUNCTIONS
// ============================================

// Haal alle gebruikers op die wachten op goedkeuring
const getPendingUsers = () => {
    const users = loadUsers();
    return Object.values(users).filter(u => u.approvalStatus === 'pending');
};

// Keur gebruiker goed
const approveUser = (userId, adminEmail) => {
    const users = loadUsers();
    if (!users[userId]) {
        return { error: 'Gebruiker niet gevonden' };
    }
    
    users[userId].approvalStatus = 'approved';
    users[userId].approvedAt = new Date().toISOString();
    users[userId].approvedBy = adminEmail;
    users[userId].updatedAt = new Date().toISOString();
    
    saveUsers(users);
    console.log(`✅ Gebruiker goedgekeurd: ${users[userId].email} door ${adminEmail}`);
    return { success: true, user: users[userId] };
};

// Wijs gebruiker af
const rejectUser = (userId, adminEmail, reason) => {
    const users = loadUsers();
    if (!users[userId]) {
        return { error: 'Gebruiker niet gevonden' };
    }
    
    users[userId].approvalStatus = 'rejected';
    users[userId].rejectedAt = new Date().toISOString();
    users[userId].rejectedBy = adminEmail;
    users[userId].rejectionReason = reason || null;
    users[userId].updatedAt = new Date().toISOString();
    
    saveUsers(users);
    console.log(`❌ Gebruiker afgewezen: ${users[userId].email} door ${adminEmail}`);
    return { success: true, user: users[userId] };
};

// Check of gebruiker is goedgekeurd
const isUserApproved = (userId) => {
    const users = loadUsers();
    const user = users[userId];
    if (!user) return false;
    
    // Bestaande gebruikers zonder approvalStatus zijn automatisch goedgekeurd
    if (!user.approvalStatus) return true;
    
    return user.approvalStatus === 'approved';
};

// Update gebruiker plan (voor admin)
const setUserPlan = (userId, plan) => {
    const users = loadUsers();
    if (!users[userId]) {
        return { error: 'Gebruiker niet gevonden' };
    }
    
    users[userId].subscription = {
        plan: plan,
        status: 'active',
        startedAt: new Date().toISOString(),
        expiresAt: null
    };
    users[userId].updatedAt = new Date().toISOString();
    
    saveUsers(users);
    return { success: true, user: users[userId] };
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
    TRIAL_DAYS,
    // Email/Password functions
    registerUser,
    loginWithEmail,
    setPasswordForUser,
    hashPassword,
    verifyPassword,
    // Profile functions
    updateUserProfile,
    changePassword,
    // Calendar sync functions
    updateCalendarSync,
    getCalendarSync,
    // Admin approval functions
    getPendingUsers,
    approveUser,
    rejectUser,
    isUserApproved,
    setUserPlan
};
