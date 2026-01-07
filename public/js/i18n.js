/**
 * PianoPlanner Internationalization (i18n)
 * Simple translation system using JSON language files
 */

const i18n = {
    currentLang: 'en',
    translations: {},
    fallback: {},
    
    /**
     * Initialize i18n - load language from localStorage or browser
     */
    async init() {
        // Get saved language or detect from browser
        const savedLang = localStorage.getItem('pianoplanner-lang');
        const browserLang = navigator.language.split('-')[0];
        
        // Supported languages
        const supported = ['en', 'nl', 'de', 'fr'];
        
        // Priority: saved > browser > default (en)
        if (savedLang && supported.includes(savedLang)) {
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
