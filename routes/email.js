/**
 * Email Routes for PianoPlanner
 * Handles email settings and sending
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const emailService = require('../utils/emailService');
const { getDb } = require('../utils/database');

/**
 * GET /api/email/status
 * Check if email is configured
 */
router.get('/status', requireAuth, (req, res) => {
    res.json({
        configured: emailService.isEmailConfigured(),
        smtpUser: process.env.SMTP_USER ? process.env.SMTP_USER.replace(/(.{3}).*(@.*)/, '$1***$2') : null
    });
});

/**
 * POST /api/email/test
 * Send a test email
 */
router.post('/test', requireAuth, async (req, res) => {
    try {
        if (!emailService.isEmailConfigured()) {
            return res.status(400).json({ 
                error: 'Email not configured',
                message: 'SMTP_USER and SMTP_PASS environment variables are required'
            });
        }

        const { email } = req.body;
        const testEmail = email || req.session.user.email;

        if (!testEmail) {
            return res.status(400).json({ error: 'No email address provided' });
        }

        const result = await emailService.sendTestEmail(testEmail);
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: `Test email sent to ${testEmail}`,
                messageId: result.messageId
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to send test email',
                message: result.error
            });
        }
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/email/settings
 * Get user's email notification settings
 */
router.get('/settings', requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.session.user.id;

        // Get or create email settings for user
        let settings = await db.get(
            'SELECT * FROM email_settings WHERE user_id = ?',
            [userId]
        );

        if (!settings) {
            // Create default settings
            await db.run(`
                INSERT INTO email_settings (user_id, send_confirmations, send_reminders, reminder_hours, send_cancellations, notify_new_bookings)
                VALUES (?, 1, 1, 24, 1, 1)
            `, [userId]);

            settings = {
                send_confirmations: 1,
                send_reminders: 1,
                reminder_hours: 24,
                send_cancellations: 1,
                notify_new_bookings: 1
            };
        }

        res.json({
            sendConfirmations: !!settings.send_confirmations,
            sendReminders: !!settings.send_reminders,
            reminderHours: settings.reminder_hours || 24,
            sendCancellations: !!settings.send_cancellations,
            notifyNewBookings: !!settings.notify_new_bookings
        });
    } catch (error) {
        console.error('Get email settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/email/settings
 * Update user's email notification settings
 */
router.put('/settings', requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.session.user.id;
        const { sendConfirmations, sendReminders, reminderHours, sendCancellations, notifyNewBookings } = req.body;

        // Upsert settings
        await db.run(`
            INSERT INTO email_settings (user_id, send_confirmations, send_reminders, reminder_hours, send_cancellations, notify_new_bookings)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                send_confirmations = excluded.send_confirmations,
                send_reminders = excluded.send_reminders,
                reminder_hours = excluded.reminder_hours,
                send_cancellations = excluded.send_cancellations,
                notify_new_bookings = excluded.notify_new_bookings,
                updated_at = CURRENT_TIMESTAMP
        `, [
            userId,
            sendConfirmations ? 1 : 0,
            sendReminders ? 1 : 0,
            reminderHours || 24,
            sendCancellations ? 1 : 0,
            notifyNewBookings ? 1 : 0
        ]);

        res.json({ success: true, message: 'Email settings updated' });
    } catch (error) {
        console.error('Update email settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/email/send-confirmation
 * Send appointment confirmation to customer
 */
router.post('/send-confirmation', requireAuth, async (req, res) => {
    try {
        if (!emailService.isEmailConfigured()) {
            return res.status(400).json({ error: 'Email not configured' });
        }

        const { appointmentId } = req.body;
        const db = getDb();
        const userId = req.session.user.id;

        // Get appointment details
        const appointment = await db.get(`
            SELECT a.*, c.name as customer_name, c.email as customer_email
            FROM appointments a
            LEFT JOIN customers c ON a.customer_id = c.id
            WHERE a.id = ? AND a.user_id = ?
        `, [appointmentId, userId]);

        if (!appointment) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        if (!appointment.customer_email) {
            return res.status(400).json({ error: 'Customer has no email address' });
        }

        // Get company name
        const company = await db.get('SELECT company_name FROM company_settings WHERE user_id = ?', [userId]);
        const companyName = company?.company_name || req.session.user.name || 'PianoPlanner';

        const result = await emailService.sendAppointmentConfirmation({
            customerEmail: appointment.customer_email,
            customerName: appointment.customer_name,
            appointmentDate: appointment.date,
            appointmentTime: appointment.start_time,
            serviceName: appointment.service || 'Piano Service',
            companyName,
            notes: appointment.notes,
            // Privacy: customer replies go to the teacher, not PianoPlanner
            replyTo: req.session.user.email,
            fromName: companyName,
            userId: userId
        });

        if (result.success) {
            // Mark confirmation as sent
            await db.run('UPDATE appointments SET confirmation_sent = 1 WHERE id = ?', [appointmentId]);
            res.json({ success: true, message: 'Confirmation email sent' });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (error) {
        console.error('Send confirmation error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/email/send-reminder
 * Send appointment reminder to customer
 */
router.post('/send-reminder', requireAuth, async (req, res) => {
    try {
        if (!emailService.isEmailConfigured()) {
            return res.status(400).json({ error: 'Email not configured' });
        }

        const { appointmentId } = req.body;
        const db = getDb();
        const userId = req.session.user.id;

        // Get appointment details
        const appointment = await db.get(`
            SELECT a.*, c.name as customer_name, c.email as customer_email
            FROM appointments a
            LEFT JOIN customers c ON a.customer_id = c.id
            WHERE a.id = ? AND a.user_id = ?
        `, [appointmentId, userId]);

        if (!appointment) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        if (!appointment.customer_email) {
            return res.status(400).json({ error: 'Customer has no email address' });
        }

        // Get company name
        const company = await db.get('SELECT company_name FROM company_settings WHERE user_id = ?', [userId]);
        const companyName = company?.company_name || req.session.user.name || 'PianoPlanner';

        // Calculate hours until appointment
        const appointmentDateTime = new Date(`${appointment.date}T${appointment.start_time}`);
        const hoursUntil = Math.round((appointmentDateTime - new Date()) / (1000 * 60 * 60));

        const result = await emailService.sendAppointmentReminder({
            customerEmail: appointment.customer_email,
            customerName: appointment.customer_name,
            appointmentDate: appointment.date,
            appointmentTime: appointment.start_time,
            serviceName: appointment.service || 'Piano Service',
            companyName,
            hoursUntil,
            // Privacy: customer replies go to the teacher, not PianoPlanner
            replyTo: req.session.user.email,
            fromName: companyName,
            userId: userId
        });

        if (result.success) {
            // Mark reminder as sent
            await db.run('UPDATE appointments SET reminder_sent = 1 WHERE id = ?', [appointmentId]);
            res.json({ success: true, message: 'Reminder email sent' });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (error) {
        console.error('Send reminder error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
