/**
 * Offline UI Indicator
 * Shows offline status and sync information to users
 */

(function() {
    'use strict';

    let offlineBanner = null;
    let syncStatusElement = null;

    /**
     * Create the offline banner UI
     */
    function createOfflineBanner() {
        if (offlineBanner) return;

        offlineBanner = document.createElement('div');
        offlineBanner.id = 'offline-banner';
        offlineBanner.className = 'offline-banner';
        offlineBanner.innerHTML = `
            <div class="offline-banner-content">
                <span class="offline-icon">📴</span>
                <span class="offline-text">Je bent offline</span>
                <span class="offline-subtext">Data wordt lokaal opgeslagen</span>
            </div>
            <button class="offline-sync-btn" onclick="OfflineUI.syncNow()" style="display:none;">
                <span class="sync-icon">🔄</span> Sync
            </button>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .offline-banner {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: linear-gradient(135deg, #FF9500, #FF6B00);
                color: white;
                padding: 8px 16px;
                padding-top: calc(env(safe-area-inset-top, 0px) + 8px);
                display: flex;
                align-items: center;
                justify-content: space-between;
                z-index: 100000;
                transform: translateY(-100%);
                transition: transform 0.3s ease;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }
            
            .offline-banner.visible {
                transform: translateY(0);
            }
            
            .offline-banner-content {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .offline-icon {
                font-size: 18px;
            }
            
            .offline-text {
                font-weight: 600;
                font-size: 14px;
            }
            
            .offline-subtext {
                font-size: 12px;
                opacity: 0.9;
            }
            
            .offline-sync-btn {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            
            .offline-sync-btn:active {
                background: rgba(255,255,255,0.3);
            }
            
            .sync-icon {
                font-size: 14px;
            }
            
            .offline-sync-btn.syncing .sync-icon {
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            /* Sync toast */
            .sync-toast {
                position: fixed;
                bottom: 100px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: #1C1C1E;
                color: white;
                padding: 12px 20px;
                border-radius: 12px;
                font-size: 14px;
                z-index: 100001;
                opacity: 0;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .sync-toast.visible {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
            
            .sync-toast.success {
                background: #34C759;
            }
            
            .sync-toast.error {
                background: #FF3B30;
            }
            
            /* Pending changes badge */
            .pending-badge {
                background: #FF3B30;
                color: white;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 10px;
                margin-left: 4px;
            }
            
            /* Adjust body when offline banner is visible */
            body.is-offline .ios-nav-header,
            body.is-offline .header {
                margin-top: 44px;
            }
            
            @media (max-width: 480px) {
                .offline-subtext {
                    display: none;
                }
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(offlineBanner);
    }

    /**
     * Show/hide offline banner
     */
    function updateOfflineStatus() {
        createOfflineBanner();
        
        if (navigator.onLine) {
            offlineBanner.classList.remove('visible');
            document.body.classList.remove('is-offline');
        } else {
            offlineBanner.classList.add('visible');
            document.body.classList.add('is-offline');
        }
    }

    /**
     * Show sync button when there are pending changes
     */
    async function updateSyncButton() {
        if (!window.OfflineStore) return;
        
        const syncBtn = offlineBanner?.querySelector('.offline-sync-btn');
        if (!syncBtn) return;
        
        const pending = await OfflineStore.getPendingSync();
        
        if (pending.length > 0 && navigator.onLine) {
            syncBtn.style.display = 'flex';
            syncBtn.innerHTML = `<span class="sync-icon">🔄</span> Sync <span class="pending-badge">${pending.length}</span>`;
        } else {
            syncBtn.style.display = 'none';
        }
    }

    /**
     * Manual sync trigger
     */
    async function syncNow() {
        const syncBtn = offlineBanner?.querySelector('.offline-sync-btn');
        if (syncBtn) {
            syncBtn.classList.add('syncing');
            syncBtn.disabled = true;
        }
        
        try {
            const result = await OfflineFetch.syncNow();
            
            if (result.success) {
                showToast('✅ Data gesynchroniseerd', 'success');
            } else {
                showToast('⚠️ Sync mislukt: ' + (result.reason || 'Unknown'), 'error');
            }
        } catch (error) {
            showToast('❌ Sync error: ' + error.message, 'error');
        } finally {
            if (syncBtn) {
                syncBtn.classList.remove('syncing');
                syncBtn.disabled = false;
            }
            updateSyncButton();
        }
    }

    /**
     * Show a toast notification
     */
    function showToast(message, type = 'info') {
        const existing = document.querySelector('.sync-toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = `sync-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });
        
        // Auto remove
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Initialize on page load
     */
    function init() {
        // Initial state
        updateOfflineStatus();
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            updateOfflineStatus();
            showToast('✅ Weer online', 'success');
            updateSyncButton();
            
            // Auto-sync when coming back online
            if (window.OfflineFetch) {
                setTimeout(() => OfflineFetch.syncNow(), 1000);
            }
        });
        
        window.addEventListener('offline', () => {
            updateOfflineStatus();
            showToast('📴 Je bent offline', 'info');
        });
        
        // Check for pending sync periodically
        setInterval(updateSyncButton, 30000);
        
        // Initial sync button update
        setTimeout(updateSyncButton, 2000);
    }

    // Public API
    window.OfflineUI = {
        init,
        syncNow,
        showToast,
        updateSyncButton
    };

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
