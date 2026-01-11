/**
 * PianoPlanner Language Picker
 * Beautiful modal language selector for public pages
 */

const LanguagePicker = {
    languages: [
        // Western Europe
        { code: 'en', name: 'English', native: 'English', flag: '🇬🇧', region: 'Western Europe' },
        { code: 'en-US', name: 'English (US)', native: 'English', flag: '🇺🇸', region: 'Americas' },
        { code: 'nl', name: 'Dutch', native: 'Nederlands', flag: '🇳🇱', region: 'Western Europe' },
        { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪', region: 'Western Europe' },
        { code: 'de-AT', name: 'German (Austria)', native: 'Deutsch', flag: '🇦🇹', region: 'Western Europe' },
        { code: 'de-CH', name: 'German (Swiss)', native: 'Deutsch', flag: '🇨🇭', region: 'Western Europe' },
        { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷', region: 'Western Europe' },
        
        // Southern Europe
        { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸', region: 'Southern Europe' },
        { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹', region: 'Southern Europe' },
        { code: 'pt', name: 'Portuguese', native: 'Português', flag: '🇵🇹', region: 'Southern Europe' },
        { code: 'el', name: 'Greek', native: 'Ελληνικά', flag: '🇬🇷', region: 'Southern Europe' },
        
        // Northern Europe
        { code: 'da', name: 'Danish', native: 'Dansk', flag: '🇩🇰', region: 'Northern Europe' },
        { code: 'sv', name: 'Swedish', native: 'Svenska', flag: '🇸🇪', region: 'Northern Europe' },
        { code: 'no', name: 'Norwegian', native: 'Norsk', flag: '🇳🇴', region: 'Northern Europe' },
        { code: 'fi', name: 'Finnish', native: 'Suomi', flag: '🇫🇮', region: 'Northern Europe' },
        
        // Eastern Europe
        { code: 'pl', name: 'Polish', native: 'Polski', flag: '🇵🇱', region: 'Eastern Europe' },
        { code: 'cs', name: 'Czech', native: 'Čeština', flag: '🇨🇿', region: 'Eastern Europe' },
        { code: 'hu', name: 'Hungarian', native: 'Magyar', flag: '🇭🇺', region: 'Eastern Europe' },
        
        // Baltic
        { code: 'et', name: 'Estonian', native: 'Eesti', flag: '🇪🇪', region: 'Baltic' },
        { code: 'lv', name: 'Latvian', native: 'Latviešu', flag: '🇱🇻', region: 'Baltic' },
        { code: 'lt', name: 'Lithuanian', native: 'Lietuvių', flag: '🇱🇹', region: 'Baltic' },
        
        // Celtic
        { code: 'ga', name: 'Irish', native: 'Gaeilge', flag: '🇮🇪', region: 'Celtic' },
        { code: 'gd', name: 'Scottish Gaelic', native: 'Gàidhlig', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', region: 'Celtic' },
    ],
    
    currentLang: 'en',
    modal: null,
    
    /**
     * Initialize the language picker
     */
    init() {
        // Get current language
        this.currentLang = localStorage.getItem('pianoplanner-lang') || 
                          navigator.language.split('-')[0] || 
                          'en';
        
        // Create the modal
        this.createModal();
        
        // Create trigger buttons
        this.createTriggerButtons();
        
        // Apply translations if i18n is available
        this.applyLanguage();
    },
    
    /**
     * Create the modal HTML
     */
    createModal() {
        const modal = document.createElement('div');
        modal.id = 'language-modal';
        modal.className = 'lang-modal';
        modal.innerHTML = `
            <div class="lang-modal-backdrop" onclick="LanguagePicker.close()"></div>
            <div class="lang-modal-content">
                <div class="lang-modal-header">
                    <h2>🌍 Choose your language</h2>
                    <button class="lang-modal-close" onclick="LanguagePicker.close()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="lang-modal-search">
                    <input type="text" placeholder="Search language..." oninput="LanguagePicker.filter(this.value)">
                </div>
                <div class="lang-modal-grid" id="lang-grid">
                    ${this.renderLanguages()}
                </div>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .lang-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10000;
                align-items: center;
                justify-content: center;
            }
            
            .lang-modal.open {
                display: flex;
            }
            
            .lang-modal-backdrop {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
            }
            
            .lang-modal-content {
                position: relative;
                background: white;
                border-radius: 20px;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow: hidden;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                animation: langModalIn 0.3s ease;
            }
            
            @keyframes langModalIn {
                from {
                    opacity: 0;
                    transform: scale(0.95) translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }
            
            .lang-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 20px 24px;
                border-bottom: 1px solid #e5e5ea;
            }
            
            .lang-modal-header h2 {
                font-size: 20px;
                font-weight: 600;
                color: #1d1d1f;
                margin: 0;
            }
            
            .lang-modal-close {
                background: none;
                border: none;
                padding: 8px;
                cursor: pointer;
                color: #6e6e73;
                border-radius: 8px;
                transition: background 0.2s;
            }
            
            .lang-modal-close:hover {
                background: #f5f5f7;
            }
            
            .lang-modal-search {
                padding: 16px 24px;
                border-bottom: 1px solid #e5e5ea;
            }
            
            .lang-modal-search input {
                width: 100%;
                padding: 12px 16px;
                border: 1px solid #e5e5ea;
                border-radius: 10px;
                font-size: 15px;
                outline: none;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            
            .lang-modal-search input:focus {
                border-color: #007AFF;
                box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
            }
            
            .lang-modal-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                gap: 8px;
                padding: 16px 24px 24px;
                max-height: calc(80vh - 150px);
                overflow-y: auto;
            }
            
            .lang-option {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 14px;
                border: 2px solid transparent;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
                background: #f9fafb;
            }
            
            .lang-option:hover {
                background: #f0f5ff;
                border-color: #007AFF;
            }
            
            .lang-option.active {
                background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%);
                border-color: #007AFF;
            }
            
            .lang-option.hidden {
                display: none;
            }
            
            .lang-flag {
                font-size: 24px;
                line-height: 1;
            }
            
            .lang-info {
                flex: 1;
                min-width: 0;
            }
            
            .lang-native {
                font-weight: 600;
                color: #1d1d1f;
                font-size: 14px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .lang-name {
                font-size: 11px;
                color: #6e6e73;
            }
            
            .lang-check {
                color: #007AFF;
                opacity: 0;
                transition: opacity 0.2s;
            }
            
            .lang-option.active .lang-check {
                opacity: 1;
            }
            
            /* Trigger button styles */
            .lang-trigger {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                background: transparent;
                border: 1px solid #d2d2d7;
                border-radius: 980px;
                cursor: pointer;
                font-size: 13px;
                color: #6e6e73;
                transition: all 0.2s;
            }
            
            .lang-trigger:hover {
                background: #f5f5f7;
                border-color: #007AFF;
                color: #007AFF;
            }
            
            .lang-trigger .flag {
                font-size: 16px;
            }
            
            @media (max-width: 640px) {
                .lang-modal-content {
                    width: 95%;
                    max-height: 90vh;
                    border-radius: 16px;
                }
                
                .lang-modal-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
                
                .lang-trigger span:not(.flag) {
                    display: none;
                }
                
                .lang-trigger {
                    padding: 6px 10px;
                }
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(modal);
        this.modal = modal;
    },
    
    /**
     * Render all languages
     */
    renderLanguages() {
        return this.languages.map(lang => `
            <div class="lang-option ${lang.code === this.currentLang ? 'active' : ''}" 
                 data-code="${lang.code}" 
                 data-name="${lang.name.toLowerCase()} ${lang.native.toLowerCase()}"
                 onclick="LanguagePicker.select('${lang.code}')">
                <span class="lang-flag">${lang.flag}</span>
                <div class="lang-info">
                    <div class="lang-native">${lang.native}</div>
                    <div class="lang-name">${lang.name}</div>
                </div>
                <svg class="lang-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
        `).join('');
    },
    
    /**
     * Create trigger buttons in the nav
     */
    createTriggerButtons() {
        // Find or create trigger button placeholders
        const placeholders = document.querySelectorAll('.lang-picker-placeholder, [data-lang-picker]');
        
        placeholders.forEach(placeholder => {
            const button = this.createTriggerButton();
            placeholder.replaceWith(button);
        });
        
        // Also try to insert in nav if no placeholder exists
        if (placeholders.length === 0) {
            const nav = document.querySelector('.nav-links, .nav-content');
            if (nav) {
                const button = this.createTriggerButton();
                // Insert before the CTA or at the end
                const cta = nav.querySelector('.nav-cta');
                if (cta) {
                    cta.parentNode.insertBefore(button, cta);
                } else {
                    nav.appendChild(button);
                }
            }
        }
    },
    
    /**
     * Create a single trigger button
     */
    createTriggerButton() {
        const currentLangData = this.languages.find(l => l.code === this.currentLang) || this.languages[0];
        
        const button = document.createElement('button');
        button.className = 'lang-trigger';
        button.onclick = () => this.open();
        button.innerHTML = `
            <span class="flag">${currentLangData.flag}</span>
            <span>${currentLangData.native}</span>
        `;
        button.setAttribute('aria-label', 'Change language');
        button.setAttribute('title', 'Change language');
        
        return button;
    },
    
    /**
     * Open the modal
     */
    open() {
        this.modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        
        // Focus search input
        setTimeout(() => {
            const input = this.modal.querySelector('input');
            if (input) input.focus();
        }, 100);
    },
    
    /**
     * Close the modal
     */
    close() {
        this.modal.classList.remove('open');
        document.body.style.overflow = '';
        
        // Clear search
        const input = this.modal.querySelector('input');
        if (input) input.value = '';
        this.filter('');
    },
    
    /**
     * Filter languages by search term
     */
    filter(term) {
        const options = this.modal.querySelectorAll('.lang-option');
        const normalizedTerm = term.toLowerCase().trim();
        
        options.forEach(option => {
            const name = option.dataset.name;
            if (!normalizedTerm || name.includes(normalizedTerm)) {
                option.classList.remove('hidden');
            } else {
                option.classList.add('hidden');
            }
        });
    },
    
    /**
     * Select a language
     */
    async select(code) {
        this.currentLang = code;
        localStorage.setItem('pianoplanner-lang', code);
        
        // Update UI
        const options = this.modal.querySelectorAll('.lang-option');
        options.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.code === code);
        });
        
        // Update trigger buttons
        const currentLangData = this.languages.find(l => l.code === code);
        document.querySelectorAll('.lang-trigger').forEach(btn => {
            btn.innerHTML = `
                <span class="flag">${currentLangData.flag}</span>
                <span>${currentLangData.native}</span>
            `;
        });
        
        // Apply language via i18n if available
        await this.applyLanguage();
        
        // Close modal
        this.close();
    },
    
    /**
     * Apply the current language
     */
    async applyLanguage() {
        // If i18n system is available, use it
        if (typeof i18n !== 'undefined' && i18n.setLanguage) {
            await i18n.setLanguage(this.currentLang);
        }
        
        // Also update HTML lang attribute
        document.documentElement.lang = this.currentLang;
        
        // Dispatch event for custom handlers
        window.dispatchEvent(new CustomEvent('languageChanged', { 
            detail: { lang: this.currentLang } 
        }));
    },
    
    /**
     * Get current language code
     */
    getLang() {
        return this.currentLang;
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LanguagePicker.init());
} else {
    LanguagePicker.init();
}
