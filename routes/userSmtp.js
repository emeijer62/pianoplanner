/**
 * User SMTP Settings Routes
 * Allows users to configure their own email sending
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../utils/database');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Encryption key for SMTP passwords (use environment variable in production)
const ENCRYPTION_KEY = process.env.SMTP_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'default-key-change-me';

// Pre-configured SMTP providers
const SMTP_PROVIDERS = {
    gmail: {
        name: 'Gmail / Google Workspace',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        instructions: [
            'Ga naar <a href="https://myaccount.google.com/apppasswords" target="_blank">Google App Passwords</a>',
            'Log in met je Google account',
            'Klik op "Select app" → "Mail"',
            'Klik op "Select device" → "Other" en typ "PianoPlanner"',
            'Kopieer het 16-cijferige wachtwoord'
        ]
    },
    icloud: {
        name: 'iCloud / Apple Mail',
        host: 'smtp.mail.me.com',
        port: 587,
        secure: false,
        instructions: [
            'Ga naar <a href="https://appleid.apple.com" target="_blank">appleid.apple.com</a>',
            'Log in en ga naar "Sign-In and Security"',
            'Klik op "App-Specific Passwords"',
            'Genereer een wachtwoord voor "PianoPlanner"',
            'Kopieer het wachtwoord'
        ]
    },
    outlook: {
        name: 'Outlook / Microsoft 365',
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        instructions: [
            'Ga naar <a href="https://account.microsoft.com/security" target="_blank">Microsoft Security</a>',
            'Schakel 2-factor authenticatie in als dat nog niet is gedaan',
            'Ga naar "App passwords" en maak een nieuw wachtwoord aan',
            'Kopieer het wachtwoord'
        ]
    },
    custom: {
        name: 'Andere provider (handmatig)',
        host: '',
        port: 587,
        secure: false,
        instructions: [
            'Vraag de SMTP gegevens op bij je email provider',
            'Je hebt nodig: SMTP host, poort, en inloggegevens'
        ]
    }
};

// Simple encryption for storing passwords
function encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
    try {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error.message);
        return null;
    }
}

/**
 * GET /api/user-smtp/providers
 * Get list of available SMTP providers
 */
router.get('/providers', requireAuth, (req, res) => {
    const providers = Object.entries(SMTP_PROVIDERS).map(([key, value]) => ({
        id: key,
        name: value.name,
        instructions: value.instructions
    }));
    res.json({ providers });
});

/**
 * GET /api/user-smtp/settings
 * Get user's SMTP settings
 */
router.get('/settings', requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.session.user.id;

        const settings = await db.get('SELECT * FROM user_smtp_settings WHERE user_id = ?', [userId]);

        if (!settings) {
            return res.json({
                enabled: false,
                provider: 'gmail',
                configured: false
            });
        }

        // Don't send the actual password back
        res.json({
            enabled: !!settings.enabled,
            provider: settings.provider || 'gmail',
            smtpHost: settings.smtp_host,
            smtpPort: settings.smtp_port,
            smtpSecure: !!settings.smtp_secure,
            smtpUser: settings.smtp_user,
            hasPassword: !!settings.smtp_pass_encrypted,
            fromName: settings.from_name,
            fromEmail: settings.from_email,
            verified: !!settings.verified,
            lastTestAt: settings.last_test_at,
            lastTestResult: settings.last_test_result,
            configured: !!settings.smtp_user && !!settings.smtp_pass_encrypted
        });
    } catch (error) {
        console.error('Get SMTP settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/user-smtp/settings
 * Save user's SMTP settings
 */
router.post('/settings', requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.session.user.id;
        const { 
            enabled, 
            provider, 
            smtpHost, 
            smtpPort, 
            smtpSecure, 
            smtpUser, 
            smtpPass,
            fromName,
            fromEmail 
        } = req.body;

        // Get provider defaults if not custom
        const providerConfig = SMTP_PROVIDERS[provider] || SMTP_PROVIDERS.custom;
        const host = provider === 'custom' ? smtpHost : providerConfig.host;
        const port = provider === 'custom' ? (smtpPort || 587) : providerConfig.port;
        const secure = provider === 'custom' ? smtpSecure : providerConfig.secure;

        // Encrypt password if provided
        let encryptedPass = null;
        if (smtpPass) {
            encryptedPass = encrypt(smtpPass);
        }

        // Check if settings exist
        const existing = await db.get('SELECT id, smtp_pass_encrypted FROM user_smtp_settings WHERE user_id = ?', [userId]);

        if (existing) {
            // Update existing settings
            await db.run(`
                UPDATE user_smtp_settings SET
                    enabled = ?,
                    provider = ?,
                    smtp_host = ?,
                    smtp_port = ?,
                    smtp_secure = ?,
                    smtp_user = ?,
                    smtp_pass_encrypted = COALESCE(?, smtp_pass_encrypted),
                    from_name = ?,
                    from_email = ?,
                    verified = 0,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `, [
                enabled ? 1 : 0,
                provider,
                host,
                port,
                secure ? 1 : 0,
                smtpUser,
                encryptedPass,
                fromName || null,
                fromEmail || smtpUser,
                userId
            ]);
        } else {
            // Insert new settings
            await db.run(`
                INSERT INTO user_smtp_settings 
                (user_id, enabled, provider, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_encrypted, from_name, from_email)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                userId,
                enabled ? 1 : 0,
                provider,
                host,
                port,
                secure ? 1 : 0,
                smtpUser,
                encryptedPass,
                fromName || null,
                fromEmail || smtpUser
            ]);
        }

        console.log(`📧 SMTP settings saved for user ${req.session.user.email}`);
        res.json({ success: true, message: 'SMTP instellingen opgeslagen' });
    } catch (error) {
        console.error('Save SMTP settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/user-smtp/test
 * Test SMTP connection and send test email
 */
router.post('/test', requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.session.user.id;
        const userEmail = req.session.user.email;

        // Get settings from database
        const settings = await db.get('SELECT * FROM user_smtp_settings WHERE user_id = ?', [userId]);

        if (!settings || !settings.smtp_user || !settings.smtp_pass_encrypted) {
            return res.status(400).json({ 
                error: 'SMTP niet geconfigureerd',
                message: 'Sla eerst je SMTP instellingen op'
            });
        }

        // Decrypt password
        const password = decrypt(settings.smtp_pass_encrypted);
        if (!password) {
            return res.status(400).json({ error: 'Kon wachtwoord niet ontsleutelen' });
        }

        // Create transporter
        const transporter = nodemailer.createTransport({
            host: settings.smtp_host,
            port: settings.smtp_port,
            secure: !!settings.smtp_secure,
            auth: {
                user: settings.smtp_user,
                pass: password
            }
        });

        // Test connection
        await transporter.verify();

        // Send test email
        const fromField = settings.from_name 
            ? `"${settings.from_name}" <${settings.from_email || settings.smtp_user}>`
            : settings.from_email || settings.smtp_user;

        await transporter.sendMail({
            from: fromField,
            to: userEmail,
            subject: '✓ PianoPlanner SMTP Test Geslaagd',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                        .container { max-width: 500px; margin: 0 auto; padding: 20px; }
                        .success { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; text-align: center; }
                        .icon { font-size: 48px; margin-bottom: 16px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="success">
                            <div class="icon">✅</div>
                            <h2>SMTP Configuratie Succesvol!</h2>
                            <p>Je eigen email is correct geconfigureerd.</p>
                            <p>Alle emails naar klanten worden nu verstuurd vanaf:<br>
                            <strong>${fromField}</strong></p>
                        </div>
                    </div>
                </body>
                </html>
            `
        });

        // Update verified status
        await db.run(`
            UPDATE user_smtp_settings SET 
                verified = 1, 
                last_test_at = CURRENT_TIMESTAMP,
                last_test_result = 'success'
            WHERE user_id = ?
        `, [userId]);

        console.log(`✅ SMTP test successful for user ${userEmail}`);
        res.json({ 
            success: true, 
            message: `Test email verzonden naar ${userEmail}` 
        });

    } catch (error) {
        console.error('SMTP test error:', error);

        // Update test result
        const db = getDb();
        try {
            await db.run(`
                UPDATE user_smtp_settings SET 
                    verified = 0,
                    last_test_at = CURRENT_TIMESTAMP,
                    last_test_result = ?
                WHERE user_id = ?
            `, [error.message, req.session.user.id]);
        } catch (e) {
            console.error('Failed to update test result:', e);
        }

        // Return user-friendly error
        let errorMessage = 'Kon geen verbinding maken';
        if (error.message.includes('Invalid login')) {
            errorMessage = 'Ongeldige inloggegevens. Controleer je email en app-wachtwoord.';
        } else if (error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Kan niet verbinden met de SMTP server. Controleer host en poort.';
        } else if (error.message.includes('self signed')) {
            errorMessage = 'SSL/TLS certificaat probleem. Probeer een andere poort.';
        }

        res.status(400).json({ 
            error: errorMessage,
            details: error.message 
        });
    }
});

/**
 * DELETE /api/user-smtp/settings
 * Remove user's SMTP settings (revert to PianoPlanner default)
 */
router.delete('/settings', requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.session.user.id;

        await db.run('DELETE FROM user_smtp_settings WHERE user_id = ?', [userId]);

        console.log(`📧 SMTP settings removed for user ${req.session.user.email}`);
        res.json({ success: true, message: 'SMTP instellingen verwijderd' });
    } catch (error) {
        console.error('Delete SMTP settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get user's SMTP transporter (for use by emailService)
 * Returns null if user has no custom SMTP configured
 */
async function getUserTransporter(userId) {
    try {
        const db = getDb();
        
        const settings = await db.get(
            'SELECT * FROM user_smtp_settings WHERE user_id = ? AND enabled = 1 AND verified = 1',
            [userId]
        );

        if (!settings || !settings.smtp_pass_encrypted) {
            return null;
        }

        const password = decrypt(settings.smtp_pass_encrypted);
        if (!password) {
            return null;
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtp_host,
            port: settings.smtp_port,
            secure: !!settings.smtp_secure,
            auth: {
                user: settings.smtp_user,
                pass: password
            }
        });

        return {
            transporter,
            fromName: settings.from_name,
            fromEmail: settings.from_email || settings.smtp_user
        };
    } catch (error) {
        console.error('Error getting user transporter:', error);
        return null;
    }
}

module.exports = router;
module.exports.getUserTransporter = getUserTransporter;
module.exports.SMTP_PROVIDERS = SMTP_PROVIDERS;
