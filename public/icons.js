/**
 * PianoPlanner Icon System
 * Replaces emojis with Lucide Icons in golden metallic style
 * 
 * Usage: Include this script after Lucide Icons CDN
 * Icons are automatically replaced on DOMContentLoaded
 */

// Icon mapping: emoji -> Lucide icon name
const ICON_MAP = {
    // Music & Piano
    '🎹': 'piano',
    '🎵': 'music',
    '🎼': 'music-2',
    '🎉': 'party-popper',
    
    // Status & Actions
    '✅': 'check-circle',
    '✓': 'check',
    '✔': 'check',
    '❌': 'x-circle',
    '✕': 'x',
    '✗': 'x',
    '⛔': 'ban',
    '⚠': 'alert-triangle',
    '⚠️': 'alert-triangle',
    
    // Navigation & Actions
    '🔄': 'refresh-cw',
    '↩': 'undo',
    '↩️': 'undo',
    '➡': 'arrow-right',
    '➡️': 'arrow-right',
    '➕': 'plus',
    '✏': 'pencil',
    '✏️': 'pencil',
    '🗑': 'trash-2',
    '🗑️': 'trash-2',
    '💾': 'save',
    '📤': 'upload',
    '📥': 'download',
    '🔍': 'search',
    '🔗': 'link',
    
    // Calendar & Time
    '📅': 'calendar',
    '📆': 'calendar-days',
    '🕐': 'clock',
    '🕐️': 'clock',
    
    // People & Business
    '👤': 'user',
    '👥': 'users',
    '👁': 'eye',
    '🏢': 'building-2',
    '🏦': 'landmark',
    
    // Communication
    '📧': 'mail',
    '✉': 'mail',
    '✉️': 'mail',
    '📱': 'smartphone',
    '📞': 'phone',
    '💬': 'message-circle',
    '🔔': 'bell',
    
    // Location & Travel
    '📍': 'map-pin',
    '🗺': 'map',
    '🗺️': 'map',
    '🚗': 'car',
    '🌍': 'globe',
    '🌐': 'globe-2',
    
    // Documents & Data
    '📋': 'clipboard-list',
    '📝': 'file-text',
    '📊': 'bar-chart-3',
    '🖼': 'image',
    '🖼️': 'image',
    
    // Settings & Security
    '⚙': 'settings',
    '⚙️': 'settings',
    '🔐': 'lock',
    '🔧': 'wrench',
    
    // Finance
    '💰': 'coins',
    '💳': 'credit-card',
    '💶': 'euro',
    
    // Misc
    '🍎': 'apple',
    '💡': 'lightbulb',
    '✨': 'sparkles',
    '🧪': 'flask-conical',
    '🧹': 'brush',
    '🎭': 'theater',
    '🧠': 'brain',
    '❓': 'help-circle',
    '❔': 'help-circle',
    
    // Status Dots
    '🔴': 'circle',
    '🟢': 'circle',
    '🟠': 'circle',
    '🔵': 'circle',
    '🟣': 'circle',
    '⚫': 'circle',
    '⚪': 'circle',
};

// Status dot color mapping
const DOT_COLORS = {
    '🔴': '#dc3545',
    '🟢': '#28a745',
    '🟠': '#fd7e14',
    '🔵': '#007bff',
    '🟣': '#6f42c1',
    '⚫': '#343a40',
    '⚪': '#f8f9fa',
};

/**
 * Create an icon element
 * @param {string} iconName - Lucide icon name
 * @param {string} [color] - Optional color override
 * @param {string} [size] - Size class (icon-sm, icon-md, icon-lg, etc.)
 * @returns {HTMLElement}
 */
function createIcon(iconName, color = null, size = '') {
    const span = document.createElement('span');
    span.className = `icon icon-gold ${size}`.trim();
    span.setAttribute('data-lucide', iconName);
    span.setAttribute('aria-hidden', 'true');
    
    if (color) {
        span.style.setProperty('--icon-color', color);
        span.innerHTML = `<svg style="stroke: ${color}"></svg>`;
    }
    
    return span;
}

/**
 * Replace emoji with icon in text node
 * @param {Node} node - Text node to process
 */
function replaceEmojisInNode(node) {
    if (node.nodeType !== Node.TEXT_NODE) return;
    
    const text = node.textContent;
    const emojiRegex = new RegExp(Object.keys(ICON_MAP).map(e => 
        e.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    ).join('|'), 'g');
    
    if (!emojiRegex.test(text)) return;
    
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    
    // Reset regex
    emojiRegex.lastIndex = 0;
    
    while ((match = emojiRegex.exec(text)) !== null) {
        // Add text before emoji
        if (match.index > lastIndex) {
            fragment.appendChild(
                document.createTextNode(text.slice(lastIndex, match.index))
            );
        }
        
        const emoji = match[0];
        const iconName = ICON_MAP[emoji];
        
        if (iconName) {
            const color = DOT_COLORS[emoji] || null;
            const icon = createIcon(iconName, color);
            fragment.appendChild(icon);
        } else {
            fragment.appendChild(document.createTextNode(emoji));
        }
        
        lastIndex = match.index + emoji.length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
        fragment.appendChild(
            document.createTextNode(text.slice(lastIndex))
        );
    }
    
    node.parentNode.replaceChild(fragment, node);
}

/**
 * Process element and all descendants
 * @param {HTMLElement} element - Root element to process
 */
function processElement(element) {
    // Skip script, style, and already processed elements
    if (element.tagName === 'SCRIPT' || 
        element.tagName === 'STYLE' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'INPUT' ||
        element.classList?.contains('icon')) {
        return;
    }
    
    // Process child nodes (clone to avoid live collection issues)
    const childNodes = Array.from(element.childNodes);
    childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
            replaceEmojisInNode(child);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            processElement(child);
        }
    });
}

/**
 * Initialize icons after Lucide is loaded
 */
function initIcons() {
    // Replace all emojis in the document
    processElement(document.body);
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Flag to prevent infinite loops
let isProcessing = false;

/**
 * Observer for dynamically added content
 */
function observeDynamicContent() {
    const observer = new MutationObserver((mutations) => {
        // Prevent infinite loop
        if (isProcessing) return;
        
        // Check if any mutations are worth processing
        let hasNewContent = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE && 
                    !node.classList?.contains('icon') &&
                    !node.closest?.('[data-lucide]') &&
                    node.tagName !== 'SVG' &&
                    node.tagName !== 'svg') {
                    hasNewContent = true;
                    break;
                }
            }
            if (hasNewContent) break;
        }
        
        if (!hasNewContent) return;
        
        isProcessing = true;
        
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE &&
                    !node.classList?.contains('icon') &&
                    node.tagName !== 'SVG' &&
                    node.tagName !== 'svg') {
                    processElement(node);
                }
            });
        });
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
        // Reset flag after a short delay
        setTimeout(() => {
            isProcessing = false;
        }, 50);
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initIcons();
        observeDynamicContent();
    });
} else {
    initIcons();
    observeDynamicContent();
}

// Export for manual use
window.PianoIcons = {
    createIcon,
    processElement,
    initIcons,
    ICON_MAP
};
