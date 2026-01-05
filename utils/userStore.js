/**
 * User Store - SQLite versie
 * Gebruikersbeheer met Google OAuth en Email/Password
 */

const { dbRun, dbGet, dbAll } = require('./database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// ==================== PASSWORD HASHING ====================

const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
    if (!storedHash) return false;
    const [salt, hash] = storedHash.split(':');
    const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === testHash;
};

// ==================== USER CRUD ====================

const createUser = async (userData) => {
    const id = userData.id || uuidv4();
    const now = new Date().toISOString();
    
    await dbRun(`
        INSERT INTO users (
            id, email, name, picture, google_id, tokens,
            password_hash, auth_type, approval_status,
            subscription_status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        userData.email,
        userData.name || '',
        userData.picture || '',
        userData.googleId || null,
        userData.tokens ? JSON.stringify(userData.tokens) : null,
        userData.passwordHash || null,
        userData.authType || 'google',
        userData.approvalStatus || 'approved',
        userData.subscriptionStatus || 'trial',
        now,
        now
    ]);
    
    return getUser(id);
};

const getUser = async (id) => {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return null;
    return formatUser(user);
};

const getUserByEmail = async (email) => {
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return null;
    return formatUser(user);
};

const getUserByGoogleId = async (googleId) => {
    const user = await dbGet('SELECT * FROM users WHERE google_id = ?', [googleId]);
    if (!user) return null;
    return formatUser(user);
};

const updateUser = async (id, updates) => {
    const fields = [];
    const values = [];
    
    const fieldMap = {
        name: 'name',
        email: 'email',
        picture: 'picture',
        tokens: 'tokens',
        passwordHash: 'password_hash',
        approvalStatus: 'approval_status',
        subscriptionStatus: 'subscription_status',
        subscriptionId: 'subscription_id',
        subscriptionEndsAt: 'subscription_ends_at',
        stripeCustomerId: 'stripe_customer_id'
    };
    
    for (const [jsField, dbField] of Object.entries(fieldMap)) {
        if (updates[jsField] !== undefined) {
            fields.push(`${dbField} = ?`);
            if (jsField === 'tokens') {
                values.push(JSON.stringify(updates[jsField]));
            } else {
                values.push(updates[jsField]);
            }
        }
    }
    
    if (fields.length === 0) return getUser(id);
    
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    
    await dbRun(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    return getUser(id);
};

const saveUser = async (userData) => {
    if (!userData.id) {
        return createUser(userData);
    }
    
    const existing = await getUser(userData.id);
    if (!existing) {
        return createUser(userData);
    }
    
    return updateUser(userData.id, userData);
};

const getAllUsers = async () => {
    const users = await dbAll('SELECT * FROM users ORDER BY created_at DESC');
    return users.map(formatUser);
};

const deleteUser = async (id) => {
    const result = await dbRun('DELETE FROM users WHERE id = ?', [id]);
    return result.changes > 0;
};

// ==================== EMAIL/PASSWORD AUTH ====================

const registerUser = async (email, password, name) => {
    // Check of email al bestaat
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
        return { error: 'Email is al geregistreerd' };
    }
    
    // Valideer wachtwoord
    if (!password || password.length < 6) {
        return { error: 'Wachtwoord moet minimaal 6 tekens zijn' };
    }
    
    const id = 'user_' + crypto.randomBytes(12).toString('hex');
    const hashedPassword = hashPassword(password);
    
    const user = await createUser({
        id,
        email,
        name: name || email.split('@')[0],
        passwordHash: hashedPassword,
        authType: 'email',
        approvalStatus: 'pending' // Nieuwe gebruikers wachten op goedkeuring
    });
    
    console.log(`📋 Nieuwe registratie wacht op goedkeuring: ${email}`);
    return { user, needsApproval: true };
};

const loginWithEmail = async (email, password) => {
    const user = await getUserByEmail(email);
    
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

// ==================== SUBSCRIPTION ====================

const getSubscriptionStatus = async (userId) => {
    const user = await dbGet(`
        SELECT subscription_status, subscription_id, subscription_ends_at, created_at 
        FROM users WHERE id = ?
    `, [userId]);
    
    if (!user) return null;
    
    return {
        status: user.subscription_status || 'trial',
        subscriptionId: user.subscription_id,
        endsAt: user.subscription_ends_at,
        createdAt: user.created_at
    };
};

const updateSubscription = async (userId, subscriptionData) => {
    await dbRun(`
        UPDATE users 
        SET subscription_status = ?, subscription_id = ?, subscription_ends_at = ?, updated_at = ?
        WHERE id = ?
    `, [
        subscriptionData.status,
        subscriptionData.subscriptionId,
        subscriptionData.endsAt,
        new Date().toISOString(),
        userId
    ]);
};

const startTrial = async (userId) => {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 30); // 30 dagen trial
    
    await updateSubscription(userId, {
        status: 'trial',
        subscriptionId: null,
        endsAt: trialEnds.toISOString()
    });
};

// ==================== APPROVAL ====================

const approveUser = async (userId) => {
    await dbRun(`
        UPDATE users SET approval_status = 'approved', updated_at = ? WHERE id = ?
    `, [new Date().toISOString(), userId]);
    return getUser(userId);
};

const rejectUser = async (userId) => {
    await dbRun(`
        UPDATE users SET approval_status = 'rejected', updated_at = ? WHERE id = ?
    `, [new Date().toISOString(), userId]);
    return getUser(userId);
};

const getPendingUsers = async () => {
    const users = await dbAll(`
        SELECT * FROM users WHERE approval_status = 'pending' ORDER BY created_at DESC
    `);
    return users.map(formatUser);
};

// ==================== STRIPE ====================

const getUserByStripeCustomerId = async (stripeCustomerId) => {
    const user = await dbGet('SELECT * FROM users WHERE stripe_customer_id = ?', [stripeCustomerId]);
    if (!user) return null;
    return formatUser(user);
};

const setStripeCustomerId = async (userId, stripeCustomerId) => {
    await dbRun(`
        UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE id = ?
    `, [stripeCustomerId, new Date().toISOString(), userId]);
};

// ==================== ADMIN FUNCTIES ====================

const setUserPlan = async (userId, plan) => {
    const user = await getUser(userId);
    if (!user) {
        return { error: 'Gebruiker niet gevonden' };
    }
    
    const now = new Date();
    let updates = {};
    
    if (plan === 'active' || plan === 'pro') {
        // Actief abonnement voor 1 jaar
        const endDate = new Date();
        endDate.setFullYear(endDate.getFullYear() + 1);
        updates = {
            status: 'active',
            currentPeriodEnd: endDate.toISOString()
        };
    } else if (plan === 'trial' || plan === 'trialing') {
        // Trial voor 14 dagen
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);
        updates = {
            status: 'trialing',
            trialEndsAt: trialEnd.toISOString()
        };
    } else if (plan === 'none' || plan === 'canceled') {
        updates = {
            status: 'canceled',
            canceledAt: now.toISOString()
        };
    } else {
        return { error: 'Ongeldig plan' };
    }
    
    await updateSubscription(userId, updates);
    const updatedUser = await getUser(userId);
    return { user: updatedUser };
};

const createUserByAdmin = async ({ email, name, password, approvalStatus, plan, createdBy }) => {
    try {
        // Hash password
        const passwordHash = await hashPassword(password);
        
        // Generate ID
        const userId = 'admin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Create user
        await dbRun(`
            INSERT INTO users (id, email, name, password_hash, auth_type, approval_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'email', ?, ?, ?)
        `, [userId, email, name, passwordHash, approvalStatus || 'approved', new Date().toISOString(), new Date().toISOString()]);
        
        // Set plan
        if (plan === 'trial' || !plan) {
            await startTrial(userId);
        } else if (plan === 'active' || plan === 'pro') {
            await setUserPlan(userId, 'active');
        }
        
        const user = await getUser(userId);
        return { user };
    } catch (error) {
        console.error('Error creating user by admin:', error);
        return { error: error.message };
    }
};

const updateUserByAdmin = async (userId, { email, name, password }) => {
    try {
        const user = await getUser(userId);
        if (!user) {
            return { error: 'Gebruiker niet gevonden' };
        }
        
        let updates = {
            email: email || user.email,
            name: name !== undefined ? name : user.name,
            updated_at: new Date().toISOString()
        };
        
        // Update password if provided
        if (password) {
            updates.password_hash = await hashPassword(password);
        }
        
        const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = [...Object.values(updates), userId];
        
        await dbRun(`UPDATE users SET ${fields} WHERE id = ?`, values);
        
        const updatedUser = await getUser(userId);
        return { user: updatedUser };
    } catch (error) {
        console.error('Error updating user by admin:', error);
        return { error: error.message };
    }
};

// ==================== CALENDAR SYNC ====================

const getCalendarSync = async (userId) => {
    const user = await dbGet('SELECT calendar_sync FROM users WHERE id = ?', [userId]);
    if (!user || !user.calendar_sync) {
        return {
            enabled: false,
            syncDirection: 'both',
            googleCalendarId: 'primary'
        };
    }
    try {
        return JSON.parse(user.calendar_sync);
    } catch (e) {
        return {
            enabled: false,
            syncDirection: 'both',
            googleCalendarId: 'primary'
        };
    }
};

const updateCalendarSync = async (userId, settings) => {
    const calendarSync = JSON.stringify({
        enabled: settings.enabled || false,
        syncDirection: settings.syncDirection || 'both',
        googleCalendarId: settings.googleCalendarId || 'primary',
        updatedAt: new Date().toISOString()
    });
    
    await dbRun(`
        UPDATE users SET calendar_sync = ?, updated_at = ? WHERE id = ?
    `, [calendarSync, new Date().toISOString(), userId]);
    
    const user = await getUser(userId);
    return { user };
};

// Format database row naar camelCase
function formatUser(row) {
    if (!row) return null;
    
    let tokens = null;
    if (row.tokens) {
        try {
            tokens = JSON.parse(row.tokens);
        } catch (e) {
            tokens = null;
        }
    }
    
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        picture: row.picture,
        googleId: row.google_id,
        tokens: tokens,
        passwordHash: row.password_hash,
        authType: row.auth_type || 'google',
        approvalStatus: row.approval_status || 'approved',
        subscriptionStatus: row.subscription_status || 'trial',
        subscriptionId: row.subscription_id,
        subscriptionEndsAt: row.subscription_ends_at,
        stripeCustomerId: row.stripe_customer_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

module.exports = {
    // User CRUD
    createUser,
    getUser,
    getUserByEmail,
    getUserByGoogleId,
    updateUser,
    saveUser,
    getAllUsers,
    deleteUser,
    // Auth
    registerUser,
    loginWithEmail,
    hashPassword,
    verifyPassword,
    // Subscription
    getSubscriptionStatus,
    updateSubscription,
    startTrial,
    // Approval
    approveUser,
    rejectUser,
    getPendingUsers,
    // Stripe
    getUserByStripeCustomerId,
    setStripeCustomerId,
    // Admin
    setUserPlan,
    createUserByAdmin,
    updateUserByAdmin,
    // Calendar Sync
    getCalendarSync,
    updateCalendarSync
};
