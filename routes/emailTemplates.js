/**
 * Email Templates Routes
 * Beheer van aanpasbare email sjablonen per gebruiker
 */

const express = require('express');
const router = express.Router();
const { dbGet, dbAll, dbRun } = require('../utils/database');
const { requireAuth } = require('../middleware/auth');

// Alle routes vereisen authenticatie
router.use(requireAuth);

// Standaard templates (fallback als gebruiker geen custom heeft)
const DEFAULT_TEMPLATES = {
    appointment_confirmation: {
        subject: 'Bevestiging: {{dienst}} op {{datum}}',
        body_html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #1d1d1f 0%, #2d2d2f 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">Afspraak Bevestigd</h1>
                </div>
                <div style="background: #f5f5f7; padding: 30px; border-radius: 0 0 12px 12px;">
                    <p>Beste {{klantnaam}},</p>
                    <p>Uw afspraak is bevestigd. Hieronder vindt u de details:</p>
                    
                    <div style="background: white; border-radius: 12px; padding: 24px; margin: 20px 0;">
                        <p><strong>Datum:</strong> {{datum}}</p>
                        <p><strong>Tijd:</strong> {{tijd}}</p>
                        <p><strong>Dienst:</strong> {{dienst}}</p>
                        {{#if locatie}}<p><strong>Locatie:</strong> {{locatie}}</p>{{/if}}
                        {{#if notities}}<p><strong>Opmerkingen:</strong> {{notities}}</p>{{/if}}
                    </div>
                    
                    <p>Heeft u vragen? Neem gerust contact met ons op.</p>
                    <p>Met vriendelijke groet,<br>{{bedrijfsnaam}}</p>
                </div>
            </div>
        `
    },
    booking_notification: {
        subject: 'Nieuwe boeking: {{dienst}} - {{klantnaam}}',
        body_html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">📅 Nieuwe Boeking</h1>
                </div>
                <div style="background: #f5f5f7; padding: 30px; border-radius: 0 0 12px 12px;">
                    <p>Er is een nieuwe afspraak geboekt:</p>
                    
                    <div style="background: white; border-radius: 12px; padding: 24px; margin: 20px 0;">
                        <p><strong>Klant:</strong> {{klantnaam}}</p>
                        <p><strong>Email:</strong> {{klantemail}}</p>
                        {{#if klanttelefoon}}<p><strong>Telefoon:</strong> {{klanttelefoon}}</p>{{/if}}
                        <p><strong>Dienst:</strong> {{dienst}}</p>
                        <p><strong>Datum:</strong> {{datum}}</p>
                        <p><strong>Tijd:</strong> {{tijd}}</p>
                        {{#if notities}}<p><strong>Opmerkingen:</strong> {{notities}}</p>{{/if}}
                    </div>
                </div>
            </div>
        `
    },
    appointment_reminder: {
        subject: 'Herinnering: {{dienst}} morgen om {{tijd}}',
        body_html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">⏰ Herinnering</h1>
                </div>
                <div style="background: #f5f5f7; padding: 30px; border-radius: 0 0 12px 12px;">
                    <p>Beste {{klantnaam}},</p>
                    <p>Dit is een herinnering voor uw afspraak morgen:</p>
                    
                    <div style="background: white; border-radius: 12px; padding: 24px; margin: 20px 0;">
                        <p><strong>Datum:</strong> {{datum}}</p>
                        <p><strong>Tijd:</strong> {{tijd}}</p>
                        <p><strong>Dienst:</strong> {{dienst}}</p>
                        {{#if locatie}}<p><strong>Locatie:</strong> {{locatie}}</p>{{/if}}
                    </div>
                    
                    <p>Tot morgen!</p>
                    <p>Met vriendelijke groet,<br>{{bedrijfsnaam}}</p>
                </div>
            </div>
        `
    }
};

// Beschikbare variabelen voor templates
const AVAILABLE_VARIABLES = [
    { key: '{{klantnaam}}', description: 'Naam van de klant' },
    { key: '{{klantemail}}', description: 'Email van de klant' },
    { key: '{{klanttelefoon}}', description: 'Telefoon van de klant' },
    { key: '{{datum}}', description: 'Datum van de afspraak' },
    { key: '{{tijd}}', description: 'Tijd van de afspraak' },
    { key: '{{dienst}}', description: 'Naam van de dienst' },
    { key: '{{bedrijfsnaam}}', description: 'Uw bedrijfsnaam' },
    { key: '{{locatie}}', description: 'Locatie/adres' },
    { key: '{{notities}}', description: 'Opmerkingen/notities' }
];

// GET /api/email-templates - Haal alle templates op voor gebruiker
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Haal custom templates van gebruiker
        const customTemplates = await dbAll(
            'SELECT * FROM email_templates WHERE user_id = ?',
            [userId]
        );
        
        // Combineer met defaults
        const templates = Object.entries(DEFAULT_TEMPLATES).map(([type, defaultTemplate]) => {
            const custom = customTemplates.find(t => t.template_type === type);
            return {
                type,
                subject: custom?.subject || defaultTemplate.subject,
                body_html: custom?.body_html || defaultTemplate.body_html,
                is_active: custom?.is_active ?? 1,
                is_custom: !!custom,
                updated_at: custom?.updated_at || null
            };
        });
        
        res.json({
            templates,
            variables: AVAILABLE_VARIABLES
        });
    } catch (error) {
        console.error('Error fetching email templates:', error);
        res.status(500).json({ error: 'Kon templates niet ophalen' });
    }
});

// GET /api/email-templates/:type - Haal specifiek template op
router.get('/:type', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { type } = req.params;
        
        if (!DEFAULT_TEMPLATES[type]) {
            return res.status(404).json({ error: 'Template type niet gevonden' });
        }
        
        const custom = await dbGet(
            'SELECT * FROM email_templates WHERE user_id = ? AND template_type = ?',
            [userId, type]
        );
        
        const defaultTemplate = DEFAULT_TEMPLATES[type];
        
        res.json({
            type,
            subject: custom?.subject || defaultTemplate.subject,
            body_html: custom?.body_html || defaultTemplate.body_html,
            is_active: custom?.is_active ?? 1,
            is_custom: !!custom,
            default_subject: defaultTemplate.subject,
            default_body_html: defaultTemplate.body_html,
            variables: AVAILABLE_VARIABLES
        });
    } catch (error) {
        console.error('Error fetching email template:', error);
        res.status(500).json({ error: 'Kon template niet ophalen' });
    }
});

// PUT /api/email-templates/:type - Update template
router.put('/:type', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { type } = req.params;
        const { subject, body_html, is_active } = req.body;
        
        if (!DEFAULT_TEMPLATES[type]) {
            return res.status(404).json({ error: 'Template type niet gevonden' });
        }
        
        if (!subject || !body_html) {
            return res.status(400).json({ error: 'Onderwerp en inhoud zijn verplicht' });
        }
        
        const now = new Date().toISOString();
        
        // Upsert: update if exists, insert if not
        await dbRun(`
            INSERT INTO email_templates (user_id, template_type, subject, body_html, is_active, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, template_type) 
            DO UPDATE SET subject = ?, body_html = ?, is_active = ?, updated_at = ?
        `, [userId, type, subject, body_html, is_active ? 1 : 0, now, subject, body_html, is_active ? 1 : 0, now]);
        
        console.log(`📧 Email template '${type}' updated for user ${userId}`);
        
        res.json({
            success: true,
            message: 'Template opgeslagen',
            template: {
                type,
                subject,
                body_html,
                is_active: is_active ? 1 : 0,
                is_custom: true,
                updated_at: now
            }
        });
    } catch (error) {
        console.error('Error updating email template:', error);
        res.status(500).json({ error: 'Kon template niet opslaan' });
    }
});

// DELETE /api/email-templates/:type - Reset naar standaard
router.delete('/:type', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { type } = req.params;
        
        if (!DEFAULT_TEMPLATES[type]) {
            return res.status(404).json({ error: 'Template type niet gevonden' });
        }
        
        await dbRun(
            'DELETE FROM email_templates WHERE user_id = ? AND template_type = ?',
            [userId, type]
        );
        
        console.log(`📧 Email template '${type}' reset to default for user ${userId}`);
        
        const defaultTemplate = DEFAULT_TEMPLATES[type];
        
        res.json({
            success: true,
            message: 'Template gereset naar standaard',
            template: {
                type,
                subject: defaultTemplate.subject,
                body_html: defaultTemplate.body_html,
                is_active: 1,
                is_custom: false
            }
        });
    } catch (error) {
        console.error('Error resetting email template:', error);
        res.status(500).json({ error: 'Kon template niet resetten' });
    }
});

// POST /api/email-templates/:type/preview - Preview met voorbeeld data
router.post('/:type/preview', async (req, res) => {
    try {
        const { type } = req.params;
        const { subject, body_html } = req.body;
        
        if (!DEFAULT_TEMPLATES[type]) {
            return res.status(404).json({ error: 'Template type niet gevonden' });
        }
        
        // Voorbeeld data
        const sampleData = {
            klantnaam: 'Jan de Vries',
            klantemail: 'jan@voorbeeld.nl',
            klanttelefoon: '06-12345678',
            datum: 'woensdag 15 januari 2026',
            tijd: '14:00',
            dienst: 'Piano stemmen',
            bedrijfsnaam: 'Uw Bedrijfsnaam',
            locatie: 'Voorbeeldstraat 123, Amsterdam',
            notities: 'Graag aanbellen bij de achterdeur'
        };
        
        // Vervang variabelen
        let previewSubject = subject;
        let previewBody = body_html;
        
        for (const [key, value] of Object.entries(sampleData)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            previewSubject = previewSubject.replace(regex, value);
            previewBody = previewBody.replace(regex, value);
        }
        
        // Verwijder ongebruikte conditionals (simpele versie)
        previewBody = previewBody.replace(/{{#if \w+}}(.*?){{\/if}}/gs, '$1');
        
        res.json({
            subject: previewSubject,
            body_html: previewBody
        });
    } catch (error) {
        console.error('Error previewing email template:', error);
        res.status(500).json({ error: 'Kon preview niet genereren' });
    }
});

// Export default templates voor gebruik in emailService
router.getDefaultTemplate = (type) => DEFAULT_TEMPLATES[type];
router.DEFAULT_TEMPLATES = DEFAULT_TEMPLATES;

module.exports = router;
