/**
 * PianoPlanner PWA Initialization
 * Registers service worker and adds PWA meta tags
 */

(function() {
    'use strict';

    // PWA Configuration
    const PWA_CONFIG = {
        themeColor: '#007AFF',
        backgroundColor: '#f5f5f7',
        appName: 'PianoPlanner',
        appShortName: 'PianoPlanner',
        description: 'Professional piano tuner scheduling'
    };

    /**
     * Add PWA meta tags to head
     */
    function addPWAMetaTags() {
        const head = document.head;
        
        // Check if already added
        if (document.querySelector('link[rel="manifest"]')) return;

        const metaTags = [
            // Manifest
            { tag: 'link', rel: 'manifest', href: '/manifest.json' },
            
            // Theme color
            { tag: 'meta', name: 'theme-color', content: PWA_CONFIG.themeColor },
            
            // iOS Web App
            { tag: 'meta', name: 'apple-mobile-web-app-capable', content: 'yes' },
            { tag: 'meta', name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
            { tag: 'meta', name: 'apple-mobile-web-app-title', content: PWA_CONFIG.appShortName },
            
            // iOS Touch Icons
            { tag: 'link', rel: 'apple-touch-icon', href: '/assets/icons/apple-touch-icon.png' },
            { tag: 'link', rel: 'apple-touch-icon', sizes: '152x152', href: '/assets/icons/icon-152x152.png' },
            { tag: 'link', rel: 'apple-touch-icon', sizes: '180x180', href: '/assets/icons/icon-180x180.png' },
            { tag: 'link', rel: 'apple-touch-icon', sizes: '167x167', href: '/assets/icons/icon-167x167.png' },
            
            // iOS Splash Screens (all iPhone/iPad sizes)
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-640x1136.png', media: '(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)' },
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-750x1334.png', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)' },
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-1242x2208.png', media: '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)' },
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-1125x2436.png', media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)' },
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-1170x2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)' },
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-1179x2556.png', media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)' },
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-1284x2778.png', media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)' },
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-1290x2796.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)' },
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-1320x2868.png', media: '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)' },
            // iPad splash screens
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-1620x2160.png', media: '(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2)' },
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-1640x2360.png', media: '(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2)' },
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-1668x2388.png', media: '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)' },
            { tag: 'link', rel: 'apple-touch-startup-image', href: '/assets/splash/splash-2048x2732.png', media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)' },
            
            // iOS Standalone CSS
            { tag: 'link', rel: 'stylesheet', href: '/ios-standalone.css', media: 'all and (display-mode: standalone)' },
            
            // Android/Chrome
            { tag: 'meta', name: 'mobile-web-app-capable', content: 'yes' },
            { tag: 'meta', name: 'application-name', content: PWA_CONFIG.appShortName },
            
            // Microsoft
            { tag: 'meta', name: 'msapplication-TileColor', content: PWA_CONFIG.themeColor },
            { tag: 'meta', name: 'msapplication-TileImage', content: '/assets/icons/icon-144x144.png' },
            { tag: 'meta', name: 'msapplication-config', content: '/browserconfig.xml' }
            // Note: viewport is already set in HTML, no need to override here
        ];

        metaTags.forEach(config => {
            const element = document.createElement(config.tag);
            delete config.tag;
            Object.keys(config).forEach(key => {
                element.setAttribute(key, config[key]);
            });
            head.appendChild(element);
        });

        // Ensure viewport has viewport-fit=cover for iOS safe areas
        const existingViewport = document.querySelector('meta[name="viewport"]');
        if (existingViewport) {
            const currentContent = existingViewport.getAttribute('content') || '';
            if (!currentContent.includes('viewport-fit')) {
                existingViewport.setAttribute('content', currentContent + ', viewport-fit=cover');
            }
        }
    }

    /**
     * Register Service Worker
     */
    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('[PWA] Service Worker not supported');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });

            console.log('[PWA] Service Worker registered:', registration.scope);

            // Check for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version available
                        showUpdateNotification();
                    }
                });
            });

            // Handle controller change (new SW activated)
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                // Reload to use new service worker
                if (window.swUpdatePending) {
                    window.location.reload();
                }
            });

        } catch (error) {
            console.error('[PWA] Service Worker registration failed:', error);
        }
    }

    /**
     * Show update notification
     */
    function showUpdateNotification() {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'pwa-update-toast';
        toast.innerHTML = `
            <div class="pwa-update-content">
                <span>🔄 New version available!</span>
                <button onclick="window.swUpdatePending=true;navigator.serviceWorker.controller.postMessage('skipWaiting')">
                    Update Now
                </button>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .pwa-update-toast {
                position: fixed;
                bottom: 100px;
                left: 50%;
                transform: translateX(-50%);
                background: #1C1C1E;
                color: white;
                padding: 14px 20px;
                border-radius: 14px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 10000;
                animation: slideUp 0.3s ease;
            }
            .pwa-update-content {
                display: flex;
                align-items: center;
                gap: 16px;
            }
            .pwa-update-toast button {
                background: #007AFF;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
            }
            @keyframes slideUp {
                from { transform: translateX(-50%) translateY(100px); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(toast);
    }

    /**
     * Handle install prompt (Android)
     */
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show install button if not already installed
        if (!window.matchMedia('(display-mode: standalone)').matches) {
            showInstallButton();
        }
    });

    function showInstallButton() {
        // Only show on mobile
        if (window.innerWidth > 768) return;
        
        // Check if we've already shown this session
        if (sessionStorage.getItem('pwa-install-dismissed')) return;

        // Create install banner
        const banner = document.createElement('div');
        banner.className = 'pwa-install-banner';
        banner.innerHTML = `
            <div class="pwa-install-content">
                <img src="/assets/icons/icon-72x72.png" alt="PianoPlanner" class="pwa-install-icon">
                <div class="pwa-install-text">
                    <strong>Install PianoPlanner</strong>
                    <span>Add to your home screen</span>
                </div>
                <button class="pwa-install-btn" onclick="window.installPWA()">Install</button>
                <button class="pwa-install-close" onclick="this.parentElement.parentElement.remove();sessionStorage.setItem('pwa-install-dismissed','1')">×</button>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            .pwa-install-banner {
                position: fixed;
                bottom: 90px;
                left: 16px;
                right: 16px;
                background: white;
                border-radius: 16px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 9999;
                animation: slideUp 0.3s ease;
            }
            .pwa-install-content {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 14px 16px;
            }
            .pwa-install-icon {
                width: 48px;
                height: 48px;
                border-radius: 10px;
            }
            .pwa-install-text {
                flex: 1;
            }
            .pwa-install-text strong {
                display: block;
                font-size: 15px;
                color: #1C1C1E;
            }
            .pwa-install-text span {
                font-size: 13px;
                color: #8E8E93;
            }
            .pwa-install-btn {
                background: #007AFF;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 10px;
                font-weight: 600;
                font-size: 15px;
                cursor: pointer;
            }
            .pwa-install-close {
                background: none;
                border: none;
                font-size: 24px;
                color: #8E8E93;
                cursor: pointer;
                padding: 0 8px;
            }
            @media (prefers-color-scheme: dark) {
                .pwa-install-banner {
                    background: #2C2C2E;
                }
                .pwa-install-text strong {
                    color: white;
                }
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(banner);
    }

    // Global install function
    window.installPWA = async function() {
        if (!deferredPrompt) return;
        
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        console.log('[PWA] Install prompt outcome:', outcome);
        deferredPrompt = null;
        
        // Remove banner
        const banner = document.querySelector('.pwa-install-banner');
        if (banner) banner.remove();
    };

    /**
     * Check if running as installed PWA
     */
    function isInstalledPWA() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true ||
               document.referrer.includes('android-app://');
    }

    /**
     * Initialize PWA
     */
    function init() {
        // Add meta tags
        addPWAMetaTags();
        
        // Register service worker
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', registerServiceWorker);
        } else {
            registerServiceWorker();
        }

        // Add installed class to body if running as PWA
        if (isInstalledPWA()) {
            document.body.classList.add('pwa-installed');
        }

        // Handle online/offline status
        window.addEventListener('online', () => {
            document.body.classList.remove('is-offline');
            // Could show a toast here
        });

        window.addEventListener('offline', () => {
            document.body.classList.add('is-offline');
            // Could show a toast here
        });

        // Initial offline check
        if (!navigator.onLine) {
            document.body.classList.add('is-offline');
        }
        
        // iOS Standalone mode enhancements
        if (isInstalledPWA()) {
            initStandaloneMode();
        }
    }
    
    /**
     * Initialize iOS Standalone Mode enhancements
     */
    function initStandaloneMode() {
        console.log('[PWA] Running in standalone mode');
        
        // Add standalone class
        document.body.classList.add('ios-standalone');
        
        // Handle iOS keyboard showing/hiding
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
            initIOSKeyboardHandling();
        }
        
        // Prevent overscroll/bounce effect
        document.body.style.overscrollBehavior = 'none';
        
        // Handle navigation within standalone app (prevent opening in Safari)
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href) {
                const url = new URL(link.href);
                // Only intercept internal links
                if (url.origin === window.location.origin) {
                    // Allow normal navigation
                    return;
                }
                // External links - open in Safari
                if (link.target !== '_blank') {
                    e.preventDefault();
                    window.open(link.href, '_blank');
                }
            }
        });
        
        // iOS status bar tap to scroll to top
        let lastScrollTop = 0;
        document.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            // Check if tap is in status bar area (top 20px)
            if (touch.clientY < 20) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }
    
    /**
     * Handle iOS virtual keyboard
     */
    function initIOSKeyboardHandling() {
        const visualViewport = window.visualViewport;
        
        if (visualViewport) {
            let keyboardOpen = false;
            
            visualViewport.addEventListener('resize', () => {
                const heightDiff = window.innerHeight - visualViewport.height;
                const isKeyboardNowOpen = heightDiff > 150;
                
                if (isKeyboardNowOpen !== keyboardOpen) {
                    keyboardOpen = isKeyboardNowOpen;
                    
                    if (keyboardOpen) {
                        document.body.classList.add('keyboard-open');
                        // Scroll focused input into view
                        const activeElement = document.activeElement;
                        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                            setTimeout(() => {
                                activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, 100);
                        }
                    } else {
                        document.body.classList.remove('keyboard-open');
                    }
                }
            });
        }
    }

    // Run initialization
    init();
})();
