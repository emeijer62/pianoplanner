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

module.exports = {
    getSettings,
    getCompanySettings: getSettings,  // Alias voor duidelijkheid
    saveSettings,
    getOriginAddress,
    getDefaultSettings,
    getTravelSettings,
    saveTravelSettings
};
