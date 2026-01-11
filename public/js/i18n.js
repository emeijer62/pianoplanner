/**
 * PianoPlanner Internationalization (i18n)
 * Simple translation system using JSON language files
 */

const i18n = {
    currentLang: 'en',
    translations: {},
    fallback: {},
    
    // Locale configuration per language
    localeConfig: {
        'en': { locale: 'en-GB', currency: 'GBP', dateFormat: 'short', timeFormat: '24h', currencySymbol: '£' },
        'en-US': { locale: 'en-US', currency: 'USD', dateFormat: 'short', timeFormat: '12h', currencySymbol: '$' },
        'nl': { locale: 'nl-NL', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'de': { locale: 'de-DE', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'de-AT': { locale: 'de-AT', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'de-CH': { locale: 'de-CH', currency: 'CHF', dateFormat: 'short', timeFormat: '24h', currencySymbol: 'CHF' },
        'fr': { locale: 'fr-FR', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'es': { locale: 'es-ES', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'it': { locale: 'it-IT', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'pt': { locale: 'pt-PT', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'pl': { locale: 'pl-PL', currency: 'PLN', dateFormat: 'short', timeFormat: '24h', currencySymbol: 'zł' },
        'da': { locale: 'da-DK', currency: 'DKK', dateFormat: 'short', timeFormat: '24h', currencySymbol: 'kr' },
        'sv': { locale: 'sv-SE', currency: 'SEK', dateFormat: 'short', timeFormat: '24h', currencySymbol: 'kr' },
        'no': { locale: 'nb-NO', currency: 'NOK', dateFormat: 'short', timeFormat: '24h', currencySymbol: 'kr' },
        'fi': { locale: 'fi-FI', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'el': { locale: 'el-GR', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'cs': { locale: 'cs-CZ', currency: 'CZK', dateFormat: 'short', timeFormat: '24h', currencySymbol: 'Kč' },
        'hu': { locale: 'hu-HU', currency: 'HUF', dateFormat: 'short', timeFormat: '24h', currencySymbol: 'Ft' },
        'et': { locale: 'et-EE', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'lv': { locale: 'lv-LV', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'lt': { locale: 'lt-LT', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'ga': { locale: 'ga-IE', currency: 'EUR', dateFormat: 'short', timeFormat: '24h', currencySymbol: '€' },
        'gd': { locale: 'gd-GB', currency: 'GBP', dateFormat: 'short', timeFormat: '24h', currencySymbol: '£' }
    },
    
    /**
     * Initialize i18n - load language from server (if logged in) or localStorage/browser
     */
    async init() {
        // Supported languages
        const supported = ['en', 'en-US', 'nl', 'de', 'de-AT', 'de-CH', 'fr', 'es', 'it', 'pl', 'da', 'el', 'sv', 'no', 'pt', 'cs', 'hu', 'fi', 'et', 'lv', 'lt', 'gd', 'ga'];
        
        // Try to get language from server first (if logged in)
        let serverLang = null;
        try {
            const res = await fetch('/api/settings/language');
            if (res.ok) {
                const data = await res.json();
                if (data.language && supported.includes(data.language)) {
                    serverLang = data.language;
                }
            }
        } catch (e) {
            // Not logged in or error - use localStorage/browser
        }
        
        // Get saved language or detect from browser
        const savedLang = localStorage.getItem('pianoplanner-lang');
        const browserLang = navigator.language.split('-')[0];
        
        // Priority: server > saved > browser > default (en)
        if (serverLang) {
            this.currentLang = serverLang;
            localStorage.setItem('pianoplanner-lang', serverLang);
        } else if (savedLang && supported.includes(savedLang)) {
            this.currentLang = savedLang;
        } else if (supported.includes(browserLang)) {
            this.currentLang = browserLang;
        }
        
        // Always load English as fallback
        try {
            const fallbackRes = await fetch('/lang/en.json');
            this.fallback = await fallbackRes.json();
        } catch (e) {
            console.warn('Could not load fallback language');
        }
        
        // Load current language
        await this.loadLanguage(this.currentLang);
        
        // Apply translations to page
        this.translatePage();
        
        // Update language selector if present
        this.updateSelector();
        
        return this;
    },
    
    /**
     * Load a language file
     */
    async loadLanguage(lang) {
        try {
            const res = await fetch(`/lang/${lang}.json`);
            if (res.ok) {
                this.translations = await res.json();
                this.currentLang = lang;
                localStorage.setItem('pianoplanner-lang', lang);
            }
        } catch (e) {
            console.warn(`Could not load language: ${lang}`);
            this.translations = this.fallback;
        }
    },
    
    /**
     * Get translation by key (supports dot notation: "nav.dashboard")
     */
    t(key, fallbackText) {
        const keys = key.split('.');
        let value = this.translations;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                // Try fallback
                value = this.fallback;
                for (const fk of keys) {
                    if (value && typeof value === 'object' && fk in value) {
                        value = value[fk];
                    } else {
                        return fallbackText || key;
                    }
                }
                break;
            }
        }
        
        return typeof value === 'string' ? value : (fallbackText || key);
    },
    
    /**
     * Translate all elements with data-i18n attribute
     */
    translatePage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            
            // Check if it's for placeholder, title, or text content
            if (el.hasAttribute('data-i18n-attr')) {
                const attr = el.getAttribute('data-i18n-attr');
                el.setAttribute(attr, translation);
            } else if (el.hasAttribute('data-i18n-html')) {
                // Allow HTML for specific elements (like bold text)
                el.innerHTML = translation;
            } else if (el.tagName === 'INPUT' && el.type !== 'submit') {
                el.placeholder = translation;
            } else {
                el.textContent = translation;
            }
        });
    },
    
    /**
     * Change language
     */
    async setLanguage(lang) {
        await this.loadLanguage(lang);
        this.translatePage();
        this.updateSelector();
        
        // Save to server (if logged in)
        try {
            await fetch('/api/settings/language', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: lang })
            });
        } catch (e) {
            // Not logged in or error - only saved to localStorage
        }
        
        // Dispatch event for components that need to know
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    },
    
    /**
     * Update language selector dropdown
     */
    updateSelector() {
        const selector = document.getElementById('language-selector');
        if (selector) {
            selector.value = this.currentLang;
        }
    },
    
    /**
     * Get current language
     */
    getLang() {
        return this.currentLang;
    },
    
    /**
     * Get all available languages
     */
    getAvailableLanguages() {
        return [
            { code: 'en', name: 'English', flag: '🇬🇧' },
            { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
            { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
            { code: 'fr', name: 'Français', flag: '🇫🇷' }
        ];
    },
    
    /**
     * Get the locale string for current language
     */
    getLocale() {
        return this.localeConfig[this.currentLang]?.locale || 'en-GB';
    },
    
    /**
     * Format a date according to locale
     * @param {Date|string} date - Date to format
     * @param {string} style - 'short', 'medium', 'long', 'full'
     */
    formatDate(date, style = 'medium') {
        const d = date instanceof Date ? date : new Date(date);
        const locale = this.getLocale();
        
        const options = {
            short: { day: 'numeric', month: 'numeric', year: 'numeric' },
            medium: { day: 'numeric', month: 'short', year: 'numeric' },
            long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
            full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
        };
        
        return d.toLocaleDateString(locale, options[style] || options.medium);
    },
    
    /**
     * Format a time according to locale (24h or 12h)
     * @param {Date|string} date - Date/time to format
     * @param {boolean} includeSeconds - Include seconds
     */
    formatTime(date, includeSeconds = false) {
        const d = date instanceof Date ? date : new Date(date);
        const locale = this.getLocale();
        const config = this.localeConfig[this.currentLang] || {};
        
        const options = {
            hour: '2-digit',
            minute: '2-digit',
            hour12: config.timeFormat === '12h'
        };
        
        if (includeSeconds) {
            options.second = '2-digit';
        }
        
        return d.toLocaleTimeString(locale, options);
    },
    
    /**
     * Format a date and time together
     * @param {Date|string} date - Date/time to format
     * @param {string} dateStyle - 'short', 'medium', 'long'
     */
    formatDateTime(date, dateStyle = 'medium') {
        return `${this.formatDate(date, dateStyle)} ${this.formatTime(date)}`;
    },
    
    /**
     * Format currency amount
     * @param {number} amount - Amount to format
     * @param {string} currency - Override currency code
     */
    formatCurrency(amount, currency = null) {
        const locale = this.getLocale();
        const config = this.localeConfig[this.currentLang] || {};
        const currencyCode = currency || config.currency || 'EUR';
        
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currencyCode
        }).format(amount);
    },
    
    /**
     * Format a number with locale-appropriate separators
     * @param {number} number - Number to format
     * @param {number} decimals - Number of decimal places
     */
    formatNumber(number, decimals = 0) {
        const locale = this.getLocale();
        return new Intl.NumberFormat(locale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(number);
    },
    
    /**
     * Get relative time (e.g., "2 days ago", "in 3 hours")
     * @param {Date|string} date - Date to compare
     */
    formatRelativeTime(date) {
        const d = date instanceof Date ? date : new Date(date);
        const locale = this.getLocale();
        const now = new Date();
        const diffMs = d - now;
        const diffSecs = Math.round(diffMs / 1000);
        const diffMins = Math.round(diffSecs / 60);
        const diffHours = Math.round(diffMins / 60);
        const diffDays = Math.round(diffHours / 24);
        
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
        
        if (Math.abs(diffDays) >= 1) {
            return rtf.format(diffDays, 'day');
        } else if (Math.abs(diffHours) >= 1) {
            return rtf.format(diffHours, 'hour');
        } else if (Math.abs(diffMins) >= 1) {
            return rtf.format(diffMins, 'minute');
        } else {
            return rtf.format(diffSecs, 'second');
        }
    },
    
    /**
     * Get weekday name
     * @param {number} dayIndex - 0-6 (Sunday-Saturday)
     * @param {string} style - 'long', 'short', 'narrow'
     */
    getWeekdayName(dayIndex, style = 'long') {
        const locale = this.getLocale();
        const date = new Date(2024, 0, dayIndex); // Jan 2024 starts on Monday
        // Adjust to get correct day
        date.setDate(date.getDate() + dayIndex);
        return date.toLocaleDateString(locale, { weekday: style });
    },
    
    /**
     * Get month name
     * @param {number} monthIndex - 0-11
     * @param {string} style - 'long', 'short', 'narrow'
     */
    getMonthName(monthIndex, style = 'long') {
        const locale = this.getLocale();
        const date = new Date(2024, monthIndex, 1);
        return date.toLocaleDateString(locale, { month: style });
    },
    
    /**
     * Get currency symbol for current locale
     */
    getCurrencySymbol() {
        const config = this.localeConfig[this.currentLang] || {};
        return config.currencySymbol || '€';
    }
};

// Global helper function
function t(key, fallback) {
    return i18n.t(key, fallback);
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => i18n.init());
} else {
    i18n.init();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = i18n;
}
