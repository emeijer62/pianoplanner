/**
 * User Store - SQLite versie
 * Gebruikersbeheer met Google OAuth en Email/Password
 */

const { dbRun, dbGet, dbAll } = require('./database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { encrypt, decrypt } = require('./encryption');

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

// ==================== SANITIZE USER DATA ====================

/**
 * Verwijder gevoelige data uit user object voordat het naar frontend gaat
 * @param {Object} user - User object met mogelijk gevoelige data
 * @returns {Object} - Veilig user object zonder credentials
 */
const sanitizeUser = (user) => {
    if (!user) return null;
    
    // Maak een kopie om origineel niet te wijzigen
    const safe = { ...user };
    
    // Verwijder gevoelige velden
    delete safe.passwordHash;
    delete safe.tokens;           // OAuth tokens
    delete safe.appleCalendar;    // Apple Calendar credentials
    delete safe.stripeCustomerId; // Stripe ID (alleen intern)
    
    // Als appleCalendar info moet worden teruggegeven, alleen status
    if (user.appleCalendar) {
        safe.appleCalendarConnected = !!user.appleCalendar.connected;
    }
    
    return safe;
};

/**
 * Sanitize een array van users
 */
const sanitizeUsers = (users) => {
    if (!Array.isArray(users)) return [];
    return users.map(sanitizeUser);
};

// ==================== USER CRUD ====================

const createUser = async (userData) => {
    const id = userData.id || uuidv4();
    const now = new Date().toISOString();
    
    // Encrypt tokens if present
    let encryptedTokens = null;
    if (userData.tokens) {
        encryptedTokens = encrypt(JSON.stringify(userData.tokens));
    }
    
    await dbRun(`
        INSERT INTO users (
            id, email, name, picture, google_id, tokens,
            password_hash, auth_type, approval_status,
            subscription_status, timezone, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        userData.email,
        userData.name || '',
        userData.picture || '',
        userData.googleId || null,
        encryptedTokens,
        userData.passwordHash || null,
        userData.authType || 'google',
        userData.approvalStatus || 'approved',
        userData.subscriptionStatus || 'trial',
        userData.timezone || 'Europe/Amsterdam',
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
                // Encrypt tokens before storing
                const tokenJson = JSON.stringify(updates[jsField]);
                values.push(encrypt(tokenJson));
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

// Update user profile (name and email)
const updateUserProfile = async (id, { name, email, timezone }) => {
    const user = await getUser(id);
    if (!user) {
        return { error: 'User not found' };
    }
    
    // If email is being changed, check if it's already in use
    if (email && email !== user.email) {
        const existingUser = await getUserByEmail(email);
        if (existingUser && existingUser.id !== id) {
            return { error: 'Email is already in use' };
        }
    }
    
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    
    // Update timezone directly in database (not in standard user fields)
    if (timezone) {
        await dbRun('UPDATE users SET timezone = ?, updated_at = ? WHERE id = ?', 
            [timezone, new Date().toISOString(), id]);
    }
    
    if (Object.keys(updates).length > 0) {
        const updatedUser = await updateUser(id, updates);
        return { user: updatedUser };
    }
    
    return { user: await getUser(id) };
};

// Get user profile with timezone
const getUserProfile = async (id) => {
    const user = await dbGet('SELECT id, email, name, picture, timezone, language FROM users WHERE id = ?', [id]);
    if (!user) return null;
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        timezone: user.timezone || 'Europe/Amsterdam',
        language: user.language || 'en'
    };
};

// Update user language
const updateUserLanguage = async (id, language) => {
    await dbRun('UPDATE users SET language = ?, updated_at = ? WHERE id = ?', 
        [language, new Date().toISOString(), id]);
    return { language };
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

const changePassword = async (userId, currentPassword, newPassword) => {
    const user = await getUser(userId);
    if (!user) {
        return { error: 'Gebruiker niet gevonden' };
    }
    
    // Valideer nieuw wachtwoord
    if (!newPassword || newPassword.length < 6) {
        return { error: 'Nieuw wachtwoord moet minimaal 6 tekens zijn' };
    }
    
    // Voor Google gebruikers die voor het eerst een wachtwoord instellen
    // (currentPassword mag dan leeg zijn)
    if (user.authType === 'google' && !user.passwordHash) {
        const hashedPassword = hashPassword(newPassword);
        // Update password AND change authType to 'email' so they can login with email/password
        await dbRun(`
            UPDATE users SET password_hash = ?, auth_type = 'email', updated_at = ? WHERE id = ?
        `, [hashedPassword, new Date().toISOString(), userId]);
        
        return { success: true };
    }
    
    // Normale wachtwoord wijziging - verifieer huidig wachtwoord
    if (!currentPassword) {
        return { error: 'Huidig wachtwoord is verplicht' };
    }
    
    if (!verifyPassword(currentPassword, user.passwordHash)) {
        return { error: 'Huidig wachtwoord is onjuist' };
    }
    
    const hashedPassword = hashPassword(newPassword);
    await dbRun(`
        UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?
    `, [hashedPassword, new Date().toISOString(), userId]);
    
    return { success: true };
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

// ==================== PASSWORD RESET ====================

const createPasswordResetToken = async (email) => {
    const user = await getUserByEmail(email);
    if (!user) {
        return { error: 'Email niet gevonden' };
    }
    
    // Google-only users cannot reset password
    if (user.authType === 'google' && !user.passwordHash) {
        return { error: 'Deze account gebruikt Google login. Wachtwoord reset is niet mogelijk.' };
    }
    
    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    await dbRun(`
        UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = ? WHERE id = ?
    `, [token, expires.toISOString(), new Date().toISOString(), user.id]);
    
    return { 
        success: true, 
        token, 
        user: { id: user.id, email: user.email, name: user.name }
    };
};

const verifyPasswordResetToken = async (token) => {
    const user = await dbGet(`
        SELECT id, email, name, reset_token_expires 
        FROM users 
        WHERE reset_token = ?
    `, [token]);
    
    if (!user) {
        return { error: 'Ongeldige of verlopen reset link' };
    }
    
    // Check if token is expired
    if (new Date(user.reset_token_expires) < new Date()) {
        // Clean up expired token
        await dbRun(`UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = ?`, [user.id]);
        return { error: 'Reset link is verlopen. Vraag een nieuwe aan.' };
    }
    
    return { valid: true, user: { id: user.id, email: user.email, name: user.name } };
};

const resetPasswordWithToken = async (token, newPassword) => {
    // Verify token first
    const verification = await verifyPasswordResetToken(token);
    if (verification.error) {
        return verification;
    }
    
    // Validate new password
    if (!newPassword || newPassword.length < 6) {
        return { error: 'Wachtwoord moet minimaal 6 tekens zijn' };
    }
    
    const hashedPassword = hashPassword(newPassword);
    
    // Update password and clear reset token
    await dbRun(`
        UPDATE users 
        SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = ? 
        WHERE id = ?
    `, [hashedPassword, new Date().toISOString(), verification.user.id]);
    
    console.log(`🔑 Wachtwoord gereset voor: ${verification.user.email}`);
    
    return { success: true, user: verification.user };
};

// ==================== ACCOUNT DELETION ====================

const deleteOwnAccount = async (userId, password) => {
    const user = await getUser(userId);
    if (!user) {
        return { error: 'Gebruiker niet gevonden' };
    }
    
    // Verify password (unless Google-only user)
    if (user.passwordHash) {
        if (!password) {
            return { error: 'Wachtwoord is verplicht om je account te verwijderen' };
        }
        if (!verifyPassword(password, user.passwordHash)) {
            return { error: 'Onjuist wachtwoord' };
        }
    }
    
    // Delete the user and all their data (cascades in database)
    const success = await deleteUser(userId);
    
    if (success) {
        console.log(`🗑️ Account verwijderd door gebruiker: ${user.email}`);
        return { success: true };
    }
    
    return { error: 'Kon account niet verwijderen' };
};

// ==================== SUBSCRIPTION & TIERS ====================

// Owner emails hebben altijd toegang (Go tier)
const OWNER_EMAILS = ['info@edwardmeijer.nl', 'edward@pianoplanner.com'];

// Tier limieten
const TIER_LIMITS = {
    free: {
        maxCustomers: 25,
        maxAppointmentsPerYear: 50,
        calendarSync: false,
        emailReminders: false,
        customSmtp: false,
        theaterBooking: false
    },
    go: {
        maxCustomers: Infinity,
        maxAppointmentsPerYear: Infinity,
        calendarSync: true,
        emailReminders: true,
        customSmtp: true,
        theaterBooking: true
    }
};

const getTierLimits = (tier) => {
    return TIER_LIMITS[tier] || TIER_LIMITS.free;
};

const getSubscriptionStatus = async (userId) => {
    const user = await dbGet(`
        SELECT email, subscription_status, subscription_id, subscription_ends_at, subscription_tier, created_at 
        FROM users WHERE id = ?
    `, [userId]);
    
    if (!user) return { status: 'none', hasAccess: false, tier: 'free', limits: TIER_LIMITS.free };
    
    // Owner heeft altijd Go tier toegang
    if (OWNER_EMAILS.includes(user.email?.toLowerCase())) {
        return {
            status: 'active',
            hasAccess: true,
            isOwner: true,
            tier: 'go',
            limits: TIER_LIMITS.go,
            subscriptionId: 'owner',
            endsAt: null,
            createdAt: user.created_at
        };
    }
    
    const status = user.subscription_status || 'trial';
    const tier = user.subscription_tier || 'free';
    const endsAt = user.subscription_ends_at ? new Date(user.subscription_ends_at) : null;
    const now = new Date();
    
    // Check of subscription nog actief is
    let hasAccess = false;
    let effectiveTier = tier;
    
    if (status === 'active') {
        hasAccess = !endsAt || endsAt > now;
        effectiveTier = hasAccess ? 'go' : 'free';
    } else if (status === 'trial' || status === 'trialing') {
        hasAccess = !endsAt || endsAt > now;
        effectiveTier = hasAccess ? 'go' : 'free'; // Trial gets Go features
    } else {
        effectiveTier = 'free';
    }
    
    return {
        status,
        hasAccess,
        tier: effectiveTier,
        limits: TIER_LIMITS[effectiveTier] || TIER_LIMITS.free,
        subscriptionId: user.subscription_id,
        endsAt: user.subscription_ends_at,
        createdAt: user.created_at,
        daysLeft: endsAt ? Math.max(0, Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24))) : (status === 'trial' || status === 'trialing' ? 14 : null)
    };
};

// Check specifieke tier feature
const checkTierFeature = async (userId, feature) => {
    const status = await getSubscriptionStatus(userId);
    return status.limits[feature] || false;
};

// Check tier limieten voor customers
const checkCustomerLimit = async (userId) => {
    const status = await getSubscriptionStatus(userId);
    const customerCount = await dbGet(
        'SELECT COUNT(*) as count FROM customers WHERE user_id = ?',
        [userId]
    );
    
    return {
        allowed: customerCount.count < status.limits.maxCustomers,
        current: customerCount.count,
        limit: status.limits.maxCustomers,
        tier: status.tier
    };
};

// Check tier limieten voor appointments (per jaar)
const checkAppointmentLimit = async (userId) => {
    const status = await getSubscriptionStatus(userId);
    const startOfYear = new Date();
    startOfYear.setMonth(0, 1);
    startOfYear.setHours(0, 0, 0, 0);
    
    const appointmentCount = await dbGet(
        'SELECT COUNT(*) as count FROM appointments WHERE user_id = ? AND created_at >= ?',
        [userId, startOfYear.toISOString()]
    );
    
    return {
        allowed: appointmentCount.count < status.limits.maxAppointmentsPerYear,
        current: appointmentCount.count,
        limit: status.limits.maxAppointmentsPerYear,
        tier: status.tier
    };
};

const updateSubscription = async (userId, subscriptionData) => {
    await dbRun(`
        UPDATE users 
        SET subscription_status = ?, subscription_id = ?, subscription_ends_at = ?, subscription_tier = ?, updated_at = ?
        WHERE id = ?
    `, [
        subscriptionData.status,
        subscriptionData.subscriptionId,
        subscriptionData.endsAt,
        subscriptionData.tier || 'free',
        new Date().toISOString(),
        userId
    ]);
};

// Set user tier directly (for admin or Stripe webhook)
const setUserTier = async (userId, tier) => {
    await dbRun(`
        UPDATE users SET subscription_tier = ?, updated_at = ? WHERE id = ?
    `, [tier, new Date().toISOString(), userId]);
};

const startTrial = async (userId) => {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 14); // 14 dagen trial
    
    await updateSubscription(userId, {
        status: 'trial',
        subscriptionId: null,
        endsAt: trialEnds.toISOString()
    });
};

// ==================== APPROVAL ====================

const approveUser = async (userId, approvedBy = null) => {
    await dbRun(`
        UPDATE users SET approval_status = 'approved', updated_at = ? WHERE id = ?
    `, [new Date().toISOString(), userId]);
    
    const user = await getUser(userId);
    console.log(`✅ User approved: ${user?.email}, approval_status: ${user?.approvalStatus}`);
    return { user };
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
    
    if (plan === 'active' || plan === 'pro' || plan === 'go') {
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
    } else if (plan === 'none' || plan === 'canceled' || plan === 'free') {
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

const createUserByAdmin = async ({ email, name, password, approvalStatus, plan, createdBy, timezone }) => {
    try {
        // Hash password
        const passwordHash = await hashPassword(password);
        
        // Generate ID
        const userId = 'admin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Create user
        await dbRun(`
            INSERT INTO users (id, email, name, password_hash, auth_type, approval_status, timezone, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'email', ?, ?, ?, ?)
        `, [userId, email, name, passwordHash, approvalStatus || 'approved', timezone || 'Europe/Amsterdam', new Date().toISOString(), new Date().toISOString()]);
        
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

const updateUserByAdmin = async (userId, { email, name, password, approvalStatus }) => {
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
        
        // Update approval status if provided
        if (approvalStatus) {
            updates.approval_status = approvalStatus;
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
    console.log('📅 updateCalendarSync called with:', { userId, settings });
    
    // First get existing settings to preserve values
    const existingSettings = await getCalendarSync(userId);
    
    const calendarSync = JSON.stringify({
        enabled: settings.enabled === true || settings.enabled === 'true',
        syncDirection: settings.syncDirection || existingSettings.syncDirection || 'both',
        googleCalendarId: settings.googleCalendarId || existingSettings.googleCalendarId || 'primary',
        lastSync: settings.lastSync || existingSettings.lastSync || null,
        updatedAt: new Date().toISOString()
    });
    
    console.log('📅 Saving calendar_sync:', calendarSync);
    
    await dbRun(`
        UPDATE users SET calendar_sync = ?, updated_at = ? WHERE id = ?
    `, [calendarSync, new Date().toISOString(), userId]);
    
    const user = await getUser(userId);
    console.log('📅 Updated user calendar_sync:', user?.calendarSync);
    return { user };
};

// ==================== PUBLIC BOOKING (SELF-SCHEDULER) ====================

// Genereer unieke slug voor boekingslink (fallback)
const generateBookingSlug = () => {
    return crypto.randomBytes(8).toString('hex');
};

// Maak slug van bedrijfsnaam (zoals pianoinfo.com)
// "Piano Service Amsterdam" -> "pianoserviceamsterdam"
const generateSlugFromName = (name) => {
    if (!name) return null;
    
    return name
        .toLowerCase()
        .normalize('NFD')                    // Normaliseer accenten (é -> e + ´)
        .replace(/[\u0300-\u036f]/g, '')     // Verwijder accent tekens
        .replace(/[^a-z0-9]/g, '')           // Alleen letters en cijfers
        .substring(0, 50);                    // Max 50 karakters
};

// Haal user op via booking slug
const getUserByBookingSlug = async (slug) => {
    const user = await dbGet('SELECT * FROM users WHERE booking_slug = ?', [slug]);
    if (!user) return null;
    return formatUser(user);
};

// Haal booking settings op
const getBookingSettings = async (userId) => {
    const user = await dbGet('SELECT booking_slug, booking_settings FROM users WHERE id = ?', [userId]);
    
    const defaultSettings = {
        enabled: false,
        slug: null,
        title: 'Afspraak inplannen',
        description: '',
        minAdvanceHours: 24,  // Minimaal 24 uur van tevoren
        maxAdvanceDays: 60,   // Maximaal 60 dagen vooruit
        requirePhone: true,
        requireEmail: true,
        confirmationMessage: 'Bedankt voor uw boeking! U ontvangt een bevestiging per email.',
        allowedServiceIds: []   // Leeg = alle actieve diensten
    };
    
    if (!user) return defaultSettings;
    
    let settings = defaultSettings;
    if (user.booking_settings) {
        try {
            settings = { ...defaultSettings, ...JSON.parse(user.booking_settings) };
        } catch (e) {
            // Gebruik defaults bij parse error
        }
    }
    settings.slug = user.booking_slug;
    return settings;
};

// Update booking settings
const updateBookingSettings = async (userId, settings, companyName = null) => {
    // Genereer slug als die nog niet bestaat en booking wordt ingeschakeld
    let slug = settings.slug;
    if (settings.enabled && !slug) {
        // Gebruik bedrijfsnaam als die is meegegeven, anders user naam
        if (companyName) {
            slug = generateSlugFromName(companyName);
        }
        
        if (!slug) {
            const user = await getUser(userId);
            slug = generateSlugFromName(user?.name);
        }
        
        // Fallback naar random als geen naam beschikbaar
        if (!slug) {
            slug = generateBookingSlug();
        }
        
        // Check of slug uniek is, voeg nummer toe als nodig
        let baseSlug = slug;
        let counter = 1;
        let existing = await getUserByBookingSlug(slug);
        while (existing && existing.id !== userId) {
            slug = `${baseSlug}${counter}`;
            counter++;
            existing = await getUserByBookingSlug(slug);
        }
    }
    
    const bookingSettings = JSON.stringify({
        enabled: settings.enabled || false,
        title: settings.title || 'Afspraak inplannen',
        description: settings.description || '',
        minAdvanceHours: settings.minAdvanceHours || 24,
        maxAdvanceDays: settings.maxAdvanceDays || 60,
        requirePhone: settings.requirePhone !== false,
        requireEmail: settings.requireEmail !== false,
        confirmationMessage: settings.confirmationMessage || 'Bedankt voor uw boeking!',
        allowedServiceIds: settings.allowedServiceIds || [],
        updatedAt: new Date().toISOString()
    });
    
    await dbRun(`
        UPDATE users SET booking_slug = ?, booking_settings = ?, updated_at = ? WHERE id = ?
    `, [slug, bookingSettings, new Date().toISOString(), userId]);
    
    return getBookingSettings(userId);
};

// Format database row naar camelCase
function formatUser(row) {
    if (!row) return null;
    
    let tokens = null;
    if (row.tokens) {
        try {
            // Probeer eerst te decrypten (nieuwe methode)
            const decrypted = decrypt(row.tokens);
            if (decrypted) {
                tokens = JSON.parse(decrypted);
            } else {
                // Fallback: oude onversleutelde JSON
                tokens = JSON.parse(row.tokens);
            }
        } catch (e) {
            // Als JSON parse faalt na decrypt, probeer direct
            try {
                tokens = JSON.parse(row.tokens);
            } catch (e2) {
                tokens = null;
            }
        }
    }
    
    let calendarSync = null;
    if (row.calendar_sync) {
        try {
            calendarSync = JSON.parse(row.calendar_sync);
        } catch (e) {
            calendarSync = null;
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
        approvalStatus: row.approval_status || 'pending',
        subscriptionStatus: row.subscription_status || 'trial',
        subscriptionId: row.subscription_id,
        subscriptionEndsAt: row.subscription_ends_at,
        stripeCustomerId: row.stripe_customer_id,
        calendarSync: calendarSync,
        appleCalendar: row.apple_calendar ? JSON.parse(row.apple_calendar) : null,
        appleCalendarSync: row.apple_calendar_sync ? JSON.parse(row.apple_calendar_sync) : null,
        bookingSlug: row.booking_slug,
        language: row.language || 'en',
        lastLogin: row.last_login,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

// ==================== APPLE CALENDAR ====================

/**
 * Sla Apple Calendar credentials op (wachtwoord wordt versleuteld)
 */
const saveAppleCalendarCredentials = async (userId, credentials) => {
    try {
        const appleCalendar = JSON.stringify({
            appleId: credentials.appleId,
            appPassword: encrypt(credentials.appPassword), // Encrypted!
            principalUrl: credentials.principalUrl,
            connected: credentials.connected || true,
            connectedAt: credentials.connectedAt || new Date().toISOString()
        });
        
        await dbRun(`
            UPDATE users SET apple_calendar = ?, updated_at = ? WHERE id = ?
        `, [appleCalendar, new Date().toISOString(), userId]);
        
        return { success: true };
    } catch (error) {
        console.error('Error saving Apple Calendar credentials:', error);
        return { error: error.message };
    }
};

/**
 * Haal Apple Calendar credentials op (wachtwoord wordt ontsleuteld)
 */
const getAppleCalendarCredentials = async (userId) => {
    const user = await dbGet('SELECT apple_calendar FROM users WHERE id = ?', [userId]);
    if (!user || !user.apple_calendar) return null;
    
    try {
        const credentials = JSON.parse(user.apple_calendar);
        // Decrypt het wachtwoord bij ophalen
        if (credentials.appPassword) {
            credentials.appPassword = decrypt(credentials.appPassword);
        }
        return credentials;
    } catch (e) {
        return null;
    }
};

/**
 * Verwijder Apple Calendar verbinding
 */
const removeAppleCalendarCredentials = async (userId) => {
    await dbRun(`
        UPDATE users SET apple_calendar = NULL, apple_calendar_sync = NULL, updated_at = ? WHERE id = ?
    `, [new Date().toISOString(), userId]);
    
    return { success: true };
};

/**
 * Haal Apple Calendar sync settings op
 */
const getAppleCalendarSync = async (userId) => {
    const user = await dbGet('SELECT apple_calendar_sync FROM users WHERE id = ?', [userId]);
    if (!user || !user.apple_calendar_sync) {
        return {
            enabled: false,
            syncDirection: 'both',
            appleCalendarUrl: null
        };
    }
    try {
        return JSON.parse(user.apple_calendar_sync);
    } catch (e) {
        return {
            enabled: false,
            syncDirection: 'both',
            appleCalendarUrl: null
        };
    }
};

/**
 * Update Apple Calendar sync settings
 */
const updateAppleCalendarSync = async (userId, settings) => {
    const existingSettings = await getAppleCalendarSync(userId);
    
    const appleCalendarSync = JSON.stringify({
        enabled: settings.enabled === true || settings.enabled === 'true',
        syncDirection: settings.syncDirection || existingSettings.syncDirection || 'both',
        appleCalendarUrl: settings.appleCalendarUrl || existingSettings.appleCalendarUrl,
        lastSync: settings.lastSync || existingSettings.lastSync || null,
        updatedAt: new Date().toISOString()
    });
    
    await dbRun(`
        UPDATE users SET apple_calendar_sync = ?, updated_at = ? WHERE id = ?
    `, [appleCalendarSync, new Date().toISOString(), userId]);
    
    return { success: true };
};

// ==================== MICROSOFT CALENDAR ====================

/**
 * Save Microsoft Calendar credentials
 */
const saveMicrosoftCalendarCredentials = async (userId, credentials) => {
    const microsoftCalendar = JSON.stringify({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
        email: credentials.email,
        displayName: credentials.displayName,
        connected: credentials.connected || true,
        updatedAt: new Date().toISOString()
    });
    
    await dbRun(`
        UPDATE users SET microsoft_calendar = ?, updated_at = ? WHERE id = ?
    `, [microsoftCalendar, new Date().toISOString(), userId]);
    
    return { success: true };
};

/**
 * Get Microsoft Calendar credentials
 */
const getMicrosoftCalendarCredentials = async (userId) => {
    const user = await dbGet('SELECT microsoft_calendar FROM users WHERE id = ?', [userId]);
    if (!user || !user.microsoft_calendar) return null;
    
    try {
        return JSON.parse(user.microsoft_calendar);
    } catch (e) {
        return null;
    }
};

/**
 * Remove Microsoft Calendar credentials
 */
const removeMicrosoftCalendarCredentials = async (userId) => {
    await dbRun(`
        UPDATE users SET microsoft_calendar = NULL, updated_at = ? WHERE id = ?
    `, [new Date().toISOString(), userId]);
    
    return { success: true };
};

// ==================== LAST LOGIN TRACKING ====================

const updateLastLogin = async (userId) => {
    try {
        await dbRun(`
            UPDATE users 
            SET last_login = ?
            WHERE id = ?
        `, [new Date().toISOString(), userId]);
        return { success: true };
    } catch (error) {
        console.error('Error updating last login:', error);
        return { success: false };
    }
};

module.exports = {
    // User CRUD
    createUser,
    getUser,
    getUserByEmail,
    getUserByGoogleId,
    updateUser,
    updateUserProfile,
    getUserProfile,
    updateUserLanguage,
    saveUser,
    getAllUsers,
    deleteUser,
    // Auth
    registerUser,
    loginWithEmail,
    changePassword,
    hashPassword,
    verifyPassword,
    // Password Reset
    createPasswordResetToken,
    verifyPasswordResetToken,
    resetPasswordWithToken,
    // Account Deletion
    deleteOwnAccount,
    // Sanitize
    sanitizeUser,
    sanitizeUsers,
    // Subscription & Tiers
    getSubscriptionStatus,
    updateSubscription,
    startTrial,
    getTierLimits,
    checkTierFeature,
    checkCustomerLimit,
    checkAppointmentLimit,
    setUserTier,
    TIER_LIMITS,
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
    // Calendar Sync (Google)
    getCalendarSync,
    updateCalendarSync,
    // Apple Calendar
    saveAppleCalendarCredentials,
    getAppleCalendarCredentials,
    removeAppleCalendarCredentials,
    getAppleCalendarSync,
    updateAppleCalendarSync,
    // Microsoft Calendar
    saveMicrosoftCalendarCredentials,
    getMicrosoftCalendarCredentials,
    removeMicrosoftCalendarCredentials,
    // Public Booking
    getUserByBookingSlug,
    getBookingSettings,
    updateBookingSettings,
    // Activity Tracking
    updateLastLogin
};
