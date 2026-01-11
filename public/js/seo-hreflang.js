/**
 * PianoPlanner SEO - Hreflang Tags
 * Automatically adds hreflang tags for all supported languages
 * This helps search engines serve the right language to users
 */

(function() {
    // All supported languages with their hreflang codes
    const languages = [
        { code: 'en', hreflang: 'en-GB', name: 'English (UK)' },
        { code: 'en-US', hreflang: 'en-US', name: 'English (US)' },
        { code: 'nl', hreflang: 'nl-NL', name: 'Dutch' },
        { code: 'de', hreflang: 'de-DE', name: 'German' },
        { code: 'de-AT', hreflang: 'de-AT', name: 'German (Austria)' },
        { code: 'de-CH', hreflang: 'de-CH', name: 'German (Swiss)' },
        { code: 'fr', hreflang: 'fr-FR', name: 'French' },
        { code: 'es', hreflang: 'es-ES', name: 'Spanish' },
        { code: 'it', hreflang: 'it-IT', name: 'Italian' },
        { code: 'pt', hreflang: 'pt-PT', name: 'Portuguese' },
        { code: 'pl', hreflang: 'pl-PL', name: 'Polish' },
        { code: 'da', hreflang: 'da-DK', name: 'Danish' },
        { code: 'sv', hreflang: 'sv-SE', name: 'Swedish' },
        { code: 'no', hreflang: 'nb-NO', name: 'Norwegian' },
        { code: 'fi', hreflang: 'fi-FI', name: 'Finnish' },
        { code: 'el', hreflang: 'el-GR', name: 'Greek' },
        { code: 'cs', hreflang: 'cs-CZ', name: 'Czech' },
        { code: 'hu', hreflang: 'hu-HU', name: 'Hungarian' },
        { code: 'et', hreflang: 'et-EE', name: 'Estonian' },
        { code: 'lv', hreflang: 'lv-LV', name: 'Latvian' },
        { code: 'lt', hreflang: 'lt-LT', name: 'Lithuanian' },
        { code: 'ga', hreflang: 'ga-IE', name: 'Irish' },
        { code: 'gd', hreflang: 'gd-GB', name: 'Scottish Gaelic' }
    ];
    
    /**
     * Add hreflang tags to the document head
     */
    function addHreflangTags() {
        const baseUrl = 'https://pianoplanner.com';
        const currentPath = window.location.pathname;
        const head = document.head;
        
        // Remove any existing hreflang tags (to avoid duplicates)
        document.querySelectorAll('link[hreflang]').forEach(el => el.remove());
        
        // Add hreflang for each language
        languages.forEach(lang => {
            const link = document.createElement('link');
            link.rel = 'alternate';
            link.hreflang = lang.hreflang;
            // All languages point to same URL since language is client-side
            link.href = `${baseUrl}${currentPath}`;
            head.appendChild(link);
        });
        
        // Add x-default (fallback for unmatched languages)
        const defaultLink = document.createElement('link');
        defaultLink.rel = 'alternate';
        defaultLink.hreflang = 'x-default';
        defaultLink.href = `${baseUrl}${currentPath}`;
        head.appendChild(defaultLink);
    }
    
    /**
     * Add Open Graph locale tags
     */
    function addOGLocaleTags() {
        // Get current language
        const currentLang = localStorage.getItem('pianoplanner-lang') || 'en';
        const langConfig = languages.find(l => l.code === currentLang) || languages[0];
        
        // Remove existing og:locale tags
        document.querySelectorAll('meta[property^="og:locale"]').forEach(el => el.remove());
        
        // Add og:locale for current language
        const ogLocale = document.createElement('meta');
        ogLocale.setAttribute('property', 'og:locale');
        ogLocale.content = langConfig.hreflang.replace('-', '_');
        document.head.appendChild(ogLocale);
        
        // Add og:locale:alternate for other languages
        languages.forEach(lang => {
            if (lang.code !== currentLang) {
                const altLocale = document.createElement('meta');
                altLocale.setAttribute('property', 'og:locale:alternate');
                altLocale.content = lang.hreflang.replace('-', '_');
                document.head.appendChild(altLocale);
            }
        });
    }
    
    /**
     * Update document language attribute
     */
    function updateDocumentLang() {
        const currentLang = localStorage.getItem('pianoplanner-lang') || navigator.language.split('-')[0] || 'en';
        document.documentElement.lang = currentLang;
    }
    
    // Initialize when DOM is ready
    function init() {
        addHreflangTags();
        addOGLocaleTags();
        updateDocumentLang();
        
        // Listen for language changes
        window.addEventListener('languageChanged', (e) => {
            addOGLocaleTags();
            updateDocumentLang();
        });
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
