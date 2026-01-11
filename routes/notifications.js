/**
 * Push Notification Routes
 * Handles push subscription management and sending notifications
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');

// Storage file for subscriptions
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'push-subscriptions.json');

// VAPID keys - In production, use environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls';

// Try to load web-push if available
let webpush = null;
try {
    webpush = require('web-push');
    webpush.setVapidDetails(
        'mailto:info@pianoplanner.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
    console.log('✅ Web Push configured');
} catch (e) {
    console.log('⚠️ web-push not installed - push notifications disabled');
}

/**
 * Load subscriptions from file
 */
function loadSubscriptions() {
    try {
        if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
            return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading subscriptions:', error);
    }
    return {};
}

/**
 * Save subscriptions to file
 */
function saveSubscriptions(subscriptions) {
    try {
        fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
    } catch (error) {
        console.error('Error saving subscriptions:', error);
    }
}

/**
 * GET /api/notifications/vapid-key
 * Get the VAPID public key
 */
router.get('/vapid-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

/**
 * POST /api/notifications/subscribe
 * Subscribe to push notifications
 */
router.post('/subscribe', requireAuth, (req, res) => {
    try {
        const { subscription, settings } = req.body;
        const userId = req.session.userId;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription' });
        }

        const subscriptions = loadSubscriptions();
        
        // Store subscription by user ID
        subscriptions[userId] = {
            subscription,
            settings: settings || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        saveSubscriptions(subscriptions);

        console.log(`[Push] User ${userId} subscribed to notifications`);
        res.json({ success: true });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

/**
 * POST /api/notifications/unsubscribe
 * Unsubscribe from push notifications
 */
router.post('/unsubscribe', requireAuth, (req, res) => {
    try {
        const userId = req.session.userId;
        const subscriptions = loadSubscriptions();

        if (subscriptions[userId]) {
            delete subscriptions[userId];
            saveSubscriptions(subscriptions);
            console.log(`[Push] User ${userId} unsubscribed`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

/**
 * POST /api/notifications/settings
 * Update notification settings
 */
router.post('/settings', requireAuth, (req, res) => {
    try {
        const userId = req.session.userId;
        const settings = req.body;
        const subscriptions = loadSubscriptions();

        if (subscriptions[userId]) {
            subscriptions[userId].settings = settings;
            subscriptions[userId].updatedAt = new Date().toISOString();
            saveSubscriptions(subscriptions);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Settings update error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

/**
 * GET /api/notifications/settings
 * Get notification settings for current user
 */
router.get('/settings', requireAuth, (req, res) => {
    try {
        const userId = req.session.userId;
        const subscriptions = loadSubscriptions();

        const userSub = subscriptions[userId];
        if (userSub) {
            res.json({
                subscribed: true,
                settings: userSub.settings
            });
        } else {
            res.json({
                subscribed: false,
                settings: {}
            });
        }
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

/**
 * Send push notification to a user
 * @param {string} userId - User ID to send to
 * @param {object} payload - Notification payload
 */
async function sendPushToUser(userId, payload) {
    if (!webpush) {
        console.log('[Push] web-push not available');
        return false;
    }

    const subscriptions = loadSubscriptions();
    const userSub = subscriptions[userId];

    if (!userSub || !userSub.subscription) {
        console.log(`[Push] No subscription for user ${userId}`);
        return false;
    }

    try {
        await webpush.sendNotification(
            userSub.subscription,
            JSON.stringify(payload)
        );
        console.log(`[Push] Sent notification to user ${userId}`);
        return true;
    } catch (error) {
        console.error(`[Push] Failed to send to user ${userId}:`, error.message);
        
        // Remove invalid subscription
        if (error.statusCode === 410 || error.statusCode === 404) {
            delete subscriptions[userId];
            saveSubscriptions(subscriptions);
            console.log(`[Push] Removed invalid subscription for user ${userId}`);
        }
        return false;
    }
}

/**
 * Send appointment reminder
 */
async function sendAppointmentReminder(userId, appointment) {
    const subscriptions = loadSubscriptions();
    const userSub = subscriptions[userId];

    // Check if user wants reminders
    if (!userSub?.settings?.appointmentReminders) {
        return false;
    }

    const time = new Date(appointment.start).toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit'
    });

    return sendPushToUser(userId, {
        title: `⏰ Afspraak om ${time}`,
        body: `${appointment.customerName || 'Klant'} - ${appointment.serviceName || 'Dienst'}`,
        icon: '/assets/icons/icon-192x192.png',
        badge: '/assets/icons/badge-72x72.png',
        tag: `reminder-${appointment.id}`,
        data: {
            type: 'appointment-reminder',
            appointmentId: appointment.id,
            url: `/dashboard.html?date=${appointment.start.split('T')[0]}`
        }
    });
}

/**
 * Send new booking notification
 */
async function sendNewBookingNotification(userId, booking) {
    const subscriptions = loadSubscriptions();
    const userSub = subscriptions[userId];

    if (!userSub?.settings?.newBookings) {
        return false;
    }

    // Support both booking.start (ISO string) and booking.date/time
    let dateStr;
    let dateForUrl;
    if (booking.start) {
        const startDate = new Date(booking.start);
        dateStr = startDate.toLocaleDateString('nl-NL', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
        dateForUrl = booking.start.split('T')[0];
    } else if (booking.date && booking.time) {
        const startDate = new Date(`${booking.date}T${booking.time}`);
        dateStr = startDate.toLocaleDateString('nl-NL', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        }) + ` ${booking.time}`;
        dateForUrl = booking.date;
    } else {
        dateStr = 'binnenkort';
        dateForUrl = new Date().toISOString().split('T')[0];
    }

    return sendPushToUser(userId, {
        title: '📅 Nieuwe boeking!',
        body: `${booking.customerName} - ${booking.serviceName || 'afspraak'} op ${dateStr}`,
        icon: '/assets/icons/icon-192x192.png',
        tag: `booking-${booking.id || Date.now()}`,
        data: {
            type: 'new-booking',
            appointmentId: booking.id,
            url: `/dashboard.html?date=${dateForUrl}`
        }
    });
}

/**
 * Send cancellation notification
 */
async function sendCancellationNotification(userId, appointment) {
    const subscriptions = loadSubscriptions();
    const userSub = subscriptions[userId];

    if (!userSub?.settings?.cancellations) {
        return false;
    }

    return sendPushToUser(userId, {
        title: '❌ Afspraak geannuleerd',
        body: `${appointment.customerName} heeft geannuleerd`,
        icon: '/assets/icons/icon-192x192.png',
        tag: `cancel-${appointment.id}`,
        data: {
            type: 'cancellation',
            appointmentId: appointment.id,
            url: '/dashboard.html'
        }
    });
}

/**
 * POST /api/notifications/test
 * Send a test notification
 */
router.post('/test', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        const success = await sendPushToUser(userId, {
            title: '🎹 Test Notification',
            body: 'Push notifications are working correctly!',
            icon: '/assets/icons/icon-192x192.png',
            tag: 'test-notification',
            data: {
                type: 'test',
                url: '/dashboard.html'
            }
        });

        if (success) {
            res.json({ success: true, message: 'Test notification sent' });
        } else {
            res.json({ success: false, message: 'Could not send notification' });
        }
    } catch (error) {
        console.error('Test notification error:', error);
        res.status(500).json({ error: 'Failed to send test notification' });
    }
});

// Export functions for use in other modules
module.exports = router;
module.exports.sendPushToUser = sendPushToUser;
module.exports.sendAppointmentReminder = sendAppointmentReminder;
module.exports.sendNewBookingNotification = sendNewBookingNotification;
module.exports.sendCancellationNotification = sendCancellationNotification;

/**
 * Reminder Scheduler
 * Checks for upcoming appointments and sends reminders
 * Runs every 5 minutes
 */
let reminderSchedulerRunning = false;

async function checkAndSendReminders() {
    if (!webpush) return;
    
    const subscriptions = loadSubscriptions();
    const now = new Date();
    
    // Check each user's subscriptions
    for (const [userId, userData] of Object.entries(subscriptions)) {
        // Skip if user doesn't want reminders
        if (!userData?.settings?.appointmentReminders) continue;
        
        try {
            // Get appointments for today
            const appointmentStore = require('../utils/appointmentStore');
            const date = now.toISOString().split('T')[0];
            const appointments = await appointmentStore.getAppointmentsForDay(userId, date);
            
            // Find appointments starting in the next 15-20 minutes
            for (const apt of appointments) {
                const aptStart = new Date(apt.start);
                const minutesUntil = (aptStart - now) / 60000;
                
                // Send reminder 15 minutes before
                if (minutesUntil > 10 && minutesUntil <= 15) {
                    // Check if we already sent this reminder
                    const reminderKey = `reminder-${apt.id}-${date}`;
                    if (!sentReminders.has(reminderKey)) {
                        await sendAppointmentReminder(userId, apt);
                        sentReminders.add(reminderKey);
                        console.log(`📱 Sent 15-min reminder for appointment ${apt.id}`);
                    }
                }
                
                // Send reminder 1 hour before
                if (minutesUntil > 55 && minutesUntil <= 60) {
                    const reminderKey = `reminder-1h-${apt.id}-${date}`;
                    if (!sentReminders.has(reminderKey)) {
                        await sendPushToUser(userId, {
                            title: `📅 Afspraak over 1 uur`,
                            body: `${apt.customerName || 'Klant'} - ${apt.serviceName || 'Dienst'}`,
                            icon: '/assets/icons/icon-192x192.png',
                            badge: '/assets/icons/badge-72x72.png',
                            tag: `reminder-1h-${apt.id}`,
                            data: {
                                type: 'appointment-reminder',
                                appointmentId: apt.id,
                                url: `/dashboard.html?date=${date}`
                            }
                        });
                        sentReminders.add(reminderKey);
                        console.log(`📱 Sent 1-hour reminder for appointment ${apt.id}`);
                    }
                }
            }
        } catch (err) {
            console.error(`Error checking reminders for user ${userId}:`, err.message);
        }
    }
    
    // Clear old reminders at midnight
    const hour = now.getHours();
    if (hour === 0 && now.getMinutes() < 5) {
        sentReminders.clear();
    }
}

// Track sent reminders to avoid duplicates
const sentReminders = new Set();

/**
 * Start the reminder scheduler
 */
function startReminderScheduler() {
    if (reminderSchedulerRunning) return;
    reminderSchedulerRunning = true;
    
    console.log('📱 Reminder scheduler started');
    
    // Run every 5 minutes
    setInterval(() => {
        checkAndSendReminders().catch(err => {
            console.error('Reminder scheduler error:', err.message);
        });
    }, 5 * 60 * 1000);
    
    // Run immediately on startup (after 10 seconds to allow app to fully load)
    setTimeout(() => {
        checkAndSendReminders().catch(err => {
            console.error('Initial reminder check error:', err.message);
        });
    }, 10000);
}

module.exports.startReminderScheduler = startReminderScheduler;
