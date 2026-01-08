/**
 * Company Store - SQLite versie
 * Bedrijfsinstellingen per gebruiker
 */

const { dbRun, dbGet } = require('./database');

// ==================== COMPANY SETTINGS CRUD ====================

const getSettings = async (userId) => {
    const settings = await dbGet(
        'SELECT * FROM company_settings WHERE user_id = ?',
        [userId]
    );
    
    if (!settings) {
        return getDefaultSettings();
    }
    
    return formatSettings(settings);
};

const saveSettings = async (userId, settingsData) => {
    const existing = await dbGet('SELECT id FROM company_settings WHERE user_id = ?', [userId]);
    
    if (existing) {
        // Update
        await dbRun(`
            UPDATE company_settings SET
                name = ?, owner_name = ?, email = ?, phone = ?,
                street = ?, postal_code = ?, city = ?, country = ?,
                kvk_number = ?, btw_number = ?, iban = ?,
                website = ?, logo_url = ?, travel_origin = ?,
                working_hours = ?, updated_at = ?
            WHERE user_id = ?
        `, [
            settingsData.name || null,
            settingsData.ownerName || null,
            settingsData.email || null,
            settingsData.phone || null,
            settingsData.address?.street || settingsData.street || null,
            settingsData.address?.postalCode || settingsData.postalCode || null,
            settingsData.address?.city || settingsData.city || null,
            settingsData.address?.country || settingsData.country || 'NL',
            settingsData.kvkNumber || null,
            settingsData.btwNumber || null,
            settingsData.iban || null,
            settingsData.website || null,
            settingsData.logoUrl || null,
            settingsData.travelOrigin || null,
            settingsData.workingHours ? JSON.stringify(settingsData.workingHours) : null,
            new Date().toISOString(),
            userId
        ]);
    } else {
        // Insert
        await dbRun(`
            INSERT INTO company_settings (
                user_id, name, owner_name, email, phone,
                street, postal_code, city, country,
                kvk_number, btw_number, iban,
                website, logo_url, travel_origin, working_hours, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId,
            settingsData.name || null,
            settingsData.ownerName || null,
            settingsData.email || null,
            settingsData.phone || null,
            settingsData.address?.street || settingsData.street || null,
            settingsData.address?.postalCode || settingsData.postalCode || null,
            settingsData.address?.city || settingsData.city || null,
            settingsData.address?.country || settingsData.country || 'NL',
            settingsData.kvkNumber || null,
            settingsData.btwNumber || null,
            settingsData.iban || null,
            settingsData.website || null,
            settingsData.logoUrl || null,
            settingsData.travelOrigin || null,
            settingsData.workingHours ? JSON.stringify(settingsData.workingHours) : null,
            new Date().toISOString()
        ]);
    }
    
    return getSettings(userId);
};

const getOriginAddress = async (userId) => {
    const settings = await getSettings(userId);
    
    if (settings.travelOrigin) {
        return settings.travelOrigin;
    }
    
    // Fallback naar bedrijfsadres
    const parts = [settings.address?.street, settings.address?.postalCode, settings.address?.city]
        .filter(Boolean);
    
    return parts.length > 0 ? parts.join(', ') : null;
};

// Default instellingen
function getDefaultSettings() {
    return {
        name: '',
        ownerName: '',
        email: '',
        phone: '',
        address: {
            street: '',
            postalCode: '',
            city: '',
            country: 'NL'
        },
        kvkNumber: '',
        btwNumber: '',
        iban: '',
        website: '',
        logoUrl: '',
        travelOrigin: '',
        workingHours: {
            monday: { start: '09:00', end: '17:00', enabled: true },
            tuesday: { start: '09:00', end: '17:00', enabled: true },
            wednesday: { start: '09:00', end: '17:00', enabled: true },
            thursday: { start: '09:00', end: '17:00', enabled: true },
            friday: { start: '09:00', end: '17:00', enabled: true },
            saturday: { start: '09:00', end: '13:00', enabled: false },
            sunday: { start: '09:00', end: '17:00', enabled: false }
        }
    };
}

// Format database row naar camelCase
function formatSettings(row) {
    let workingHours = null;
    if (row.working_hours) {
        try {
            workingHours = JSON.parse(row.working_hours);
        } catch (e) {
            workingHours = getDefaultSettings().workingHours;
        }
    } else {
        workingHours = getDefaultSettings().workingHours;
    }
    
    return {
        name: row.name || '',
        ownerName: row.owner_name || '',
        email: row.email || '',
        phone: row.phone || '',
        address: {
            street: row.street || '',
            postalCode: row.postal_code || '',
            city: row.city || '',
            country: row.country || 'NL'
        },
        kvkNumber: row.kvk_number || '',
        btwNumber: row.btw_number || '',
        iban: row.iban || '',
        website: row.website || '',
        logoUrl: row.logo_url || '',
        travelOrigin: row.travel_origin || '',
        workingHours: workingHours,
        updatedAt: row.updated_at
    };
}

// ==================== TRAVEL SETTINGS ====================

const getTravelSettings = async (userId) => {
    const settings = await dbGet(
        `SELECT 
            travel_settings_enabled as enabled,
            max_booking_travel_minutes as maxBookingTravelMinutes,
            far_location_message as farLocationMessage,
            max_between_travel_minutes as maxBetweenTravelMinutes
         FROM company_settings WHERE user_id = ?`,
        [userId]
    );
    
    if (!settings) {
        return {
            enabled: false,
            maxBookingTravelMinutes: null,
            farLocationMessage: 'For locations further away, please contact us directly to schedule an appointment.',
            maxBetweenTravelMinutes: null
        };
    }
    
    return {
        enabled: Boolean(settings.enabled),
        maxBookingTravelMinutes: settings.maxBookingTravelMinutes,
        farLocationMessage: settings.farLocationMessage || 'For locations further away, please contact us directly to schedule an appointment.',
        maxBetweenTravelMinutes: settings.maxBetweenTravelMinutes
    };
};

const saveTravelSettings = async (userId, travelData) => {
    // Ensure company_settings row exists
    const existing = await dbGet('SELECT id FROM company_settings WHERE user_id = ?', [userId]);
    
    if (existing) {
        await dbRun(`
            UPDATE company_settings SET
                travel_settings_enabled = ?,
                max_booking_travel_minutes = ?,
                far_location_message = ?,
                max_between_travel_minutes = ?,
                updated_at = ?
            WHERE user_id = ?
        `, [
            travelData.enabled ? 1 : 0,
            travelData.maxBookingTravelMinutes || null,
            travelData.farLocationMessage || null,
            travelData.maxBetweenTravelMinutes || null,
            new Date().toISOString(),
            userId
        ]);
    } else {
        // Create minimal company_settings with travel data
        await dbRun(`
            INSERT INTO company_settings (
                user_id, travel_settings_enabled, max_booking_travel_minutes,
                far_location_message, max_between_travel_minutes, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            userId,
            travelData.enabled ? 1 : 0,
            travelData.maxBookingTravelMinutes || null,
            travelData.farLocationMessage || null,
            travelData.maxBetweenTravelMinutes || null,
            new Date().toISOString()
        ]);
    }
    
    return getTravelSettings(userId);
};

// ==================== BUSINESS SLUG ====================

// Genereer een slug van een bedrijfsnaam
const generateSlug = (name) => {
    if (!name) return null;
    return name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
        .replace(/\s+/g, '-') // Spaces to hyphens
        .replace(/-+/g, '-') // Multiple hyphens to single
        .replace(/^-|-$/g, '') // Trim hyphens
        .substring(0, 50); // Max 50 chars
};

// Check of een slug beschikbaar is
const isSlugAvailable = async (slug, excludeUserId = null) => {
    if (!slug) return false;
    
    let query = 'SELECT user_id FROM company_settings WHERE business_slug = ?';
    let params = [slug];
    
    if (excludeUserId) {
        query += ' AND user_id != ?';
        params.push(excludeUserId);
    }
    
    const existing = await dbGet(query, params);
    return !existing;
};

// Haal bedrijf op via slug
const getCompanyBySlug = async (slug) => {
    if (!slug) return null;
    
    const result = await dbGet(`
        SELECT cs.*, u.id as owner_id, u.email as owner_email
        FROM company_settings cs
        JOIN users u ON cs.user_id = u.id
        WHERE cs.business_slug = ?
    `, [slug]);
    
    if (!result) return null;
    
    return {
        settings: formatSettings(result),
        ownerId: result.owner_id,
        ownerEmail: result.owner_email
    };
};

// Sla business slug op
const saveBusinessSlug = async (userId, slug) => {
    // Valideer slug format
    const cleanSlug = generateSlug(slug);
    if (!cleanSlug || cleanSlug.length < 3) {
        return { error: 'Slug moet minimaal 3 karakters zijn' };
    }
    
    // Check beschikbaarheid
    const available = await isSlugAvailable(cleanSlug, userId);
    if (!available) {
        return { error: 'Deze URL is al in gebruik' };
    }
    
    // Ensure company_settings row exists
    const existing = await dbGet('SELECT id FROM company_settings WHERE user_id = ?', [userId]);
    
    if (existing) {
        await dbRun(`
            UPDATE company_settings SET business_slug = ?, updated_at = ?
            WHERE user_id = ?
        `, [cleanSlug, new Date().toISOString(), userId]);
    } else {
        await dbRun(`
            INSERT INTO company_settings (user_id, business_slug, updated_at)
            VALUES (?, ?, ?)
        `, [userId, cleanSlug, new Date().toISOString()]);
    }
    
    return { success: true, slug: cleanSlug };
};

// Haal business slug op
const getBusinessSlug = async (userId) => {
    const result = await dbGet(
        'SELECT business_slug FROM company_settings WHERE user_id = ?',
        [userId]
    );
    return result?.business_slug || null;
};

module.exports = {
    getSettings,
    getCompanySettings: getSettings,  // Alias voor duidelijkheid
    saveSettings,
    getOriginAddress,
    getDefaultSettings,
    getTravelSettings,
    saveTravelSettings,
    // Business slug functies
    generateSlug,
    isSlugAvailable,
    getCompanyBySlug,
    saveBusinessSlug,
    getBusinessSlug
};
