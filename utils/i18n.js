/**
 * PianoPlanner Server-side i18n
 * Loads translations for email templates and backend messages
 */

const fs = require('fs');
const path = require('path');

// Cache for loaded translations
const translationCache = {};

// Fallback language
const FALLBACK_LANG = 'en';

/**
 * Load translations for a language
 * @param {string} lang - Language code
 */
function loadTranslations(lang) {
    if (translationCache[lang]) {
        return translationCache[lang];
    }
    
    const langPath = path.join(__dirname, '..', 'public', 'lang', `${lang}.json`);
    const fallbackPath = path.join(__dirname, '..', 'public', 'lang', `${FALLBACK_LANG}.json`);
    
    try {
        if (fs.existsSync(langPath)) {
            translationCache[lang] = JSON.parse(fs.readFileSync(langPath, 'utf8'));
        } else if (fs.existsSync(fallbackPath)) {
            console.log(`⚠️ Language ${lang} not found, using fallback`);
            translationCache[lang] = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
        } else {
            translationCache[lang] = {};
        }
    } catch (e) {
        console.error(`Error loading translations for ${lang}:`, e.message);
        translationCache[lang] = {};
    }
    
    return translationCache[lang];
}

/**
 * Get translation by key
 * @param {string} lang - Language code
 * @param {string} key - Translation key (dot notation: "email.confirmationSubject")
 * @param {string} fallback - Fallback text if not found
 */
function t(lang, key, fallback = '') {
    const translations = loadTranslations(lang);
    const fallbackTranslations = loadTranslations(FALLBACK_LANG);
    
    const keys = key.split('.');
    
    // Try current language
    let value = translations;
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            value = null;
            break;
        }
    }
    
    if (typeof value === 'string') {
        return value;
    }
    
    // Try fallback language
    value = fallbackTranslations;
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            return fallback || key;
        }
    }
    
    return typeof value === 'string' ? value : (fallback || key);
}

/**
 * Locale configuration per language
 */
const localeConfig = {
    'en': { locale: 'en-GB', currency: 'GBP', timeFormat: '24h' },
    'en-US': { locale: 'en-US', currency: 'USD', timeFormat: '12h' },
    'nl': { locale: 'nl-NL', currency: 'EUR', timeFormat: '24h' },
    'de': { locale: 'de-DE', currency: 'EUR', timeFormat: '24h' },
    'de-AT': { locale: 'de-AT', currency: 'EUR', timeFormat: '24h' },
    'de-CH': { locale: 'de-CH', currency: 'CHF', timeFormat: '24h' },
    'fr': { locale: 'fr-FR', currency: 'EUR', timeFormat: '24h' },
    'es': { locale: 'es-ES', currency: 'EUR', timeFormat: '24h' },
    'it': { locale: 'it-IT', currency: 'EUR', timeFormat: '24h' },
    'pt': { locale: 'pt-PT', currency: 'EUR', timeFormat: '24h' },
    'pl': { locale: 'pl-PL', currency: 'PLN', timeFormat: '24h' },
    'da': { locale: 'da-DK', currency: 'DKK', timeFormat: '24h' },
    'sv': { locale: 'sv-SE', currency: 'SEK', timeFormat: '24h' },
    'no': { locale: 'nb-NO', currency: 'NOK', timeFormat: '24h' },
    'fi': { locale: 'fi-FI', currency: 'EUR', timeFormat: '24h' },
    'el': { locale: 'el-GR', currency: 'EUR', timeFormat: '24h' },
    'cs': { locale: 'cs-CZ', currency: 'CZK', timeFormat: '24h' },
    'hu': { locale: 'hu-HU', currency: 'HUF', timeFormat: '24h' },
    'et': { locale: 'et-EE', currency: 'EUR', timeFormat: '24h' },
    'lv': { locale: 'lv-LV', currency: 'EUR', timeFormat: '24h' },
    'lt': { locale: 'lt-LT', currency: 'EUR', timeFormat: '24h' },
    'ga': { locale: 'ga-IE', currency: 'EUR', timeFormat: '24h' },
    'gd': { locale: 'gd-GB', currency: 'GBP', timeFormat: '24h' }
};

/**
 * Get locale string for a language
 * @param {string} lang - Language code
 */
function getLocale(lang) {
    return localeConfig[lang]?.locale || 'en-GB';
}

/**
 * Format date according to locale
 * @param {Date|string} date - Date to format
 * @param {string} lang - Language code
 * @param {string} style - 'short', 'medium', 'long'
 */
function formatDate(date, lang, style = 'long') {
    const d = date instanceof Date ? date : new Date(date);
    const locale = getLocale(lang);
    
    const options = {
        short: { day: 'numeric', month: 'numeric', year: 'numeric' },
        medium: { day: 'numeric', month: 'short', year: 'numeric' },
        long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    };
    
    return d.toLocaleDateString(locale, options[style] || options.long);
}

/**
 * Format time according to locale
 * @param {Date|string} date - Date/time to format
 * @param {string} lang - Language code
 */
function formatTime(date, lang) {
    const d = date instanceof Date ? date : new Date(date);
    const locale = getLocale(lang);
    const config = localeConfig[lang] || {};
    
    return d.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: config.timeFormat === '12h'
    });
}

/**
 * Clear translation cache (useful for development)
 */
function clearCache() {
    Object.keys(translationCache).forEach(key => delete translationCache[key]);
}

module.exports = {
    t,
    loadTranslations,
    getLocale,
    formatDate,
    formatTime,
    clearCache,
    localeConfig
};
