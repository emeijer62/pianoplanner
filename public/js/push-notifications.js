/**
 * PianoPlanner Push Notifications
 * Handles push notification subscription and display
 */

(function() {
    'use strict';

    // VAPID public key - generate your own for production
    // Run: npx web-push generate-vapid-keys
    const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

    // Notification settings
    const NOTIFICATION_SETTINGS_KEY = 'pianoplanner-notifications';

    /**
     * Check if push notifications are supported
     */
    function isSupported() {
        return 'serviceWorker' in navigator && 
               'PushManager' in window && 
               'Notification' in window;
    }

    /**
     * Get current permission status
     */
    function getPermissionStatus() {
        if (!isSupported()) return 'unsupported';
        return Notification.permission; // 'granted', 'denied', 'default'
    }

    /**
     * Request notification permission
     */
    async function requestPermission() {
        if (!isSupported()) {
            console.log('[Notifications] Not supported');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            console.log('[Notifications] Permission:', permission);
            
            if (permission === 'granted') {
                await subscribeUser();
                return true;
            }
            return false;
        } catch (error) {
            console.error('[Notifications] Permission request failed:', error);
            return false;
        }
    }

    /**
     * Subscribe user to push notifications
     */
    async function subscribeUser() {
        try {
            const registration = await navigator.serviceWorker.ready;
            
            // Check for existing subscription
            let subscription = await registration.pushManager.getSubscription();
            
            if (!subscription) {
                // Create new subscription
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });
                console.log('[Notifications] New subscription created');
            }

            // Send subscription to server
            await saveSubscription(subscription);
            
            return subscription;
        } catch (error) {
            console.error('[Notifications] Subscription failed:', error);
            throw error;
        }
    }

    /**
     * Save subscription to server
     */
    async function saveSubscription(subscription) {
        try {
            const response = await fetch('/api/notifications/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: subscription.toJSON(),
                    settings: getSettings()
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to save subscription');
            }
            
            console.log('[Notifications] Subscription saved to server');
        } catch (error) {
            console.error('[Notifications] Failed to save subscription:', error);
        }
    }

    /**
     * Unsubscribe from push notifications
     */
    async function unsubscribe() {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            
            if (subscription) {
                await subscription.unsubscribe();
                
                // Notify server
                await fetch('/api/notifications/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: subscription.endpoint })
                });
                
                console.log('[Notifications] Unsubscribed');
            }
        } catch (error) {
            console.error('[Notifications] Unsubscribe failed:', error);
        }
    }

    /**
     * Get notification settings
     */
    function getSettings() {
        const defaults = {
            enabled: true,
            appointmentReminders: true,
            reminderTimes: [60, 1440], // 1 hour and 1 day before
            newBookings: true,
            cancellations: true,
            sound: true,
            vibrate: true
        };

        try {
            const saved = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
            return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
        } catch {
            return defaults;
        }
    }

    /**
     * Save notification settings
     */
    function saveSettings(settings) {
        try {
            localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
            
            // Update server with new settings
            if (getPermissionStatus() === 'granted') {
                fetch('/api/notifications/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settings)
                }).catch(console.error);
            }
        } catch (error) {
            console.error('[Notifications] Failed to save settings:', error);
        }
    }

    /**
     * Show local notification (for testing/immediate notifications)
     */
    async function showLocalNotification(title, options = {}) {
        if (getPermissionStatus() !== 'granted') {
            console.log('[Notifications] Permission not granted');
            return;
        }

        const registration = await navigator.serviceWorker.ready;
        const settings = getSettings();

        const defaultOptions = {
            icon: '/assets/icons/icon-192x192.png',
            badge: '/assets/icons/badge-72x72.png',
            vibrate: settings.vibrate ? [100, 50, 100] : undefined,
            silent: !settings.sound,
            tag: 'pianoplanner-notification',
            renotify: true,
            requireInteraction: false,
            data: {
                url: '/dashboard.html',
                timestamp: Date.now()
            }
        };

        return registration.showNotification(title, { ...defaultOptions, ...options });
    }

    /**
     * Show appointment reminder
     */
    async function showAppointmentReminder(appointment) {
        const time = new Date(appointment.start).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        return showLocalNotification(`Afspraak om ${time}`, {
            body: `${appointment.customerName} - ${appointment.serviceName}`,
            tag: `appointment-${appointment.id}`,
            data: {
                url: `/dashboard.html?date=${appointment.start.split('T')[0]}`,
                appointmentId: appointment.id
            },
            actions: [
                { action: 'view', title: 'Bekijken' },
                { action: 'navigate', title: 'Navigeren' }
            ]
        });
    }

    /**
     * Convert VAPID key to Uint8Array
     */
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    /**
     * Create notification settings UI
     */
    function createSettingsUI() {
        const settings = getSettings();
        const permission = getPermissionStatus();

        return `
            <div class="notification-settings">
                <div class="notification-header">
                    <div class="notification-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                    </div>
                    <div class="notification-status">
                        <h3>Push Notifications</h3>
                        <span class="status-badge ${permission}">${
                            permission === 'granted' ? 'Active' :
                            permission === 'denied' ? 'Blocked' :
                            permission === 'unsupported' ? 'Not supported' : 'Not enabled'
                        }</span>
                    </div>
                </div>

                ${permission === 'default' ? `
                    <button class="enable-notifications-btn" onclick="PushNotifications.requestPermission()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                            <line x1="12" y1="2" x2="12" y2="4"></line>
                        </svg>
                        Enable Notifications
                    </button>
                ` : ''}

                ${permission === 'denied' ? `
                    <p class="notification-blocked-msg">
                        Notifications are blocked. Please enable them in your browser settings.
                    </p>
                ` : ''}

                ${permission === 'granted' ? `
                    <div class="notification-options">
                        <label class="notification-option">
                            <span>Appointment reminders</span>
                            <input type="checkbox" ${settings.appointmentReminders ? 'checked' : ''} 
                                   onchange="PushNotifications.updateSetting('appointmentReminders', this.checked)">
                        </label>
                        
                        <label class="notification-option">
                            <span>New bookings</span>
                            <input type="checkbox" ${settings.newBookings ? 'checked' : ''} 
                                   onchange="PushNotifications.updateSetting('newBookings', this.checked)">
                        </label>
                        
                        <label class="notification-option">
                            <span>Cancellations</span>
                            <input type="checkbox" ${settings.cancellations ? 'checked' : ''} 
                                   onchange="PushNotifications.updateSetting('cancellations', this.checked)">
                        </label>
                        
                        <div class="notification-option reminder-times">
                            <span>Remind me</span>
                            <select onchange="PushNotifications.updateReminderTimes(this.value)">
                                <option value="60" ${settings.reminderTimes.includes(60) ? 'selected' : ''}>1 hour before</option>
                                <option value="120" ${settings.reminderTimes.includes(120) ? 'selected' : ''}>2 hours before</option>
                                <option value="1440" ${settings.reminderTimes.includes(1440) ? 'selected' : ''}>1 day before</option>
                            </select>
                        </div>
                        
                        <button class="test-notification-btn" onclick="PushNotifications.testNotification()">
                            Send Test Notification
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Update a single setting
     */
    function updateSetting(key, value) {
        const settings = getSettings();
        settings[key] = value;
        saveSettings(settings);
    }

    /**
     * Update reminder times
     */
    function updateReminderTimes(value) {
        const settings = getSettings();
        settings.reminderTimes = [parseInt(value)];
        saveSettings(settings);
    }

    /**
     * Test notification
     */
    async function testNotification() {
        await showLocalNotification('🎹 Test Notification', {
            body: 'Push notifications are working!',
            tag: 'test-notification'
        });
    }

    /**
     * Initialize notification prompt (non-intrusive)
     */
    function showEnablePrompt() {
        if (getPermissionStatus() !== 'default') return;
        if (sessionStorage.getItem('notification-prompt-shown')) return;

        // Show after 30 seconds of use
        setTimeout(() => {
            if (getPermissionStatus() !== 'default') return;
            
            const prompt = document.createElement('div');
            prompt.className = 'notification-prompt';
            prompt.innerHTML = `
                <div class="notification-prompt-content">
                    <div class="prompt-icon">🔔</div>
                    <div class="prompt-text">
                        <strong>Stay updated</strong>
                        <span>Get reminders for your appointments</span>
                    </div>
                    <div class="prompt-actions">
                        <button class="prompt-enable" onclick="PushNotifications.requestPermission();this.closest('.notification-prompt').remove()">
                            Enable
                        </button>
                        <button class="prompt-dismiss" onclick="this.closest('.notification-prompt').remove();sessionStorage.setItem('notification-prompt-shown','1')">
                            Later
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(prompt);

            // Auto-dismiss after 10 seconds
            setTimeout(() => prompt.remove(), 10000);
        }, 30000);
    }

    // Add styles
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .notification-settings {
                padding: 20px;
            }
            .notification-header {
                display: flex;
                align-items: center;
                gap: 16px;
                margin-bottom: 20px;
            }
            .notification-icon {
                width: 48px;
                height: 48px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
            }
            .notification-icon svg {
                width: 24px;
                height: 24px;
            }
            .notification-status h3 {
                margin: 0 0 4px;
                font-size: 17px;
            }
            .status-badge {
                font-size: 12px;
                padding: 2px 8px;
                border-radius: 4px;
                font-weight: 500;
            }
            .status-badge.granted {
                background: #dcfce7;
                color: #166534;
            }
            .status-badge.denied {
                background: #fee2e2;
                color: #991b1b;
            }
            .status-badge.default {
                background: #f3f4f6;
                color: #6b7280;
            }
            .enable-notifications-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                width: 100%;
                padding: 14px;
                background: #007AFF;
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
            }
            .enable-notifications-btn svg {
                width: 20px;
                height: 20px;
            }
            .notification-options {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .notification-option {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                background: #f5f5f7;
                border-radius: 10px;
            }
            .notification-option input[type="checkbox"] {
                width: 51px;
                height: 31px;
            }
            .notification-option select {
                padding: 8px 12px;
                border-radius: 8px;
                border: 1px solid #d1d5db;
            }
            .test-notification-btn {
                padding: 12px;
                background: #f3f4f6;
                border: none;
                border-radius: 10px;
                font-size: 15px;
                color: #007AFF;
                cursor: pointer;
                margin-top: 8px;
            }
            .notification-blocked-msg {
                padding: 16px;
                background: #fee2e2;
                border-radius: 10px;
                color: #991b1b;
                font-size: 14px;
            }
            
            /* Notification prompt */
            .notification-prompt {
                position: fixed;
                bottom: 100px;
                left: 16px;
                right: 16px;
                z-index: 9998;
                animation: slideUp 0.3s ease;
            }
            .notification-prompt-content {
                background: white;
                border-radius: 16px;
                padding: 16px;
                display: flex;
                align-items: center;
                gap: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            }
            .prompt-icon {
                font-size: 32px;
            }
            .prompt-text {
                flex: 1;
            }
            .prompt-text strong {
                display: block;
                font-size: 15px;
            }
            .prompt-text span {
                font-size: 13px;
                color: #6b7280;
            }
            .prompt-actions {
                display: flex;
                gap: 8px;
            }
            .prompt-enable {
                padding: 8px 16px;
                background: #007AFF;
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: 600;
            }
            .prompt-dismiss {
                padding: 8px 12px;
                background: none;
                border: none;
                color: #6b7280;
            }
            @keyframes slideUp {
                from { transform: translateY(100px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            @media (prefers-color-scheme: dark) {
                .notification-prompt-content {
                    background: #2c2c2e;
                }
                .notification-option {
                    background: #1c1c1e;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Initialize
    function init() {
        if (!isSupported()) {
            console.log('[Notifications] Not supported in this browser');
            return;
        }

        addStyles();

        // Show enable prompt after delay (non-intrusive)
        if (document.querySelector('.dashboard')) {
            showEnablePrompt();
        }
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose API
    window.PushNotifications = {
        isSupported,
        getPermissionStatus,
        requestPermission,
        unsubscribe,
        getSettings,
        saveSettings,
        updateSetting,
        updateReminderTimes,
        showLocalNotification,
        showAppointmentReminder,
        testNotification,
        createSettingsUI
    };

})();
