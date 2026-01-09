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
// Elegant grayscale Apple-style design
const DEFAULT_TEMPLATES = {
    appointment_confirmation: {
        subject: 'Bevestiging: {{dienst}} op {{datum}}',
        body_html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff;">
                <!-- Header -->
                <div style="background: #1d1d1f; padding: 40px 32px; text-align: center;">
                    {{#if bedrijfslogo}}<div style="margin-bottom: 16px;">{{bedrijfslogo}}</div>{{/if}}
                    <h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #ffffff; letter-spacing: -0.5px;">Afspraak Bevestigd</h1>
                </div>
                
                <!-- Content -->
                <div style="padding: 40px 32px; background: #f5f5f7;">
                    <p style="margin: 0 0 24px; font-size: 17px; color: #1d1d1f; line-height: 1.5;">Beste {{klantnaam}},</p>
                    <p style="margin: 0 0 32px; font-size: 15px; color: #424245; line-height: 1.6;">Uw afspraak is bevestigd. Hieronder vindt u de details:</p>
                    
                    <!-- Details Card -->
                    <div style="background: #ffffff; border-radius: 16px; padding: 28px; margin: 0 0 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Datum</td>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{datum}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Tijd</td>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{tijd}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Dienst</td>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{dienst}}</td>
                            </tr>
                            {{#if locatie}}<tr>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Locatie</td>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 15px; color: #1d1d1f; text-align: right;">{{locatie}}</td>
                            </tr>{{/if}}
                            {{#if notities}}<tr>
                                <td style="padding: 12px 0; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Notities</td>
                                <td style="padding: 12px 0; font-size: 15px; color: #636366; text-align: right;">{{notities}}</td>
                            </tr>{{/if}}
                        </table>
                    </div>
                    
                    <p style="margin: 0 0 8px; font-size: 15px; color: #424245; line-height: 1.6;">Heeft u vragen? Neem gerust contact met ons op.</p>
                    <p style="margin: 24px 0 0; font-size: 15px; color: #1d1d1f; line-height: 1.6;">Met vriendelijke groet,<br><strong>{{bedrijfsnaam}}</strong></p>
                </div>
                
                <!-- Footer -->
                <div style="padding: 24px 32px; background: #e8e8ed; text-align: center;">
                    <p style="margin: 0; font-size: 13px; color: #8e8e93;">{{bedrijfsnaam}}</p>
                </div>
            </div>
        `
    },
    booking_notification: {
        subject: 'Nieuwe boeking: {{dienst}} - {{klantnaam}}',
        body_html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff;">
                <!-- Header -->
                <div style="background: #1d1d1f; padding: 40px 32px; text-align: center;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #ffffff; letter-spacing: -0.5px;">Nieuwe Boeking</h1>
                    <p style="margin: 12px 0 0; font-size: 15px; color: #aeaeb2;">Er is een nieuwe afspraak geboekt</p>
                </div>
                
                <!-- Content -->
                <div style="padding: 40px 32px; background: #f5f5f7;">
                    <!-- Customer Card -->
                    <div style="background: #ffffff; border-radius: 16px; padding: 28px; margin: 0 0 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                        <h2 style="margin: 0 0 20px; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Klantgegevens</h2>
                        <p style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #1d1d1f;">{{klantnaam}}</p>
                        <p style="margin: 0 0 4px; font-size: 15px; color: #636366;">{{klantemail}}</p>
                        {{#if klanttelefoon}}<p style="margin: 0; font-size: 15px; color: #636366;">{{klanttelefoon}}</p>{{/if}}
                    </div>
                    
                    <!-- Appointment Card -->
                    <div style="background: #ffffff; border-radius: 16px; padding: 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                        <h2 style="margin: 0 0 20px; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Afspraakdetails</h2>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 15px; color: #636366;">Dienst</td>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{dienst}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 15px; color: #636366;">Datum</td>
                                <td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{datum}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 0; font-size: 15px; color: #636366;">Tijd</td>
                                <td style="padding: 12px 0; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{tijd}}</td>
                            </tr>
                            {{#if notities}}<tr>
                                <td colspan="2" style="padding: 16px 0 0;">
                                    <p style="margin: 0 0 8px; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Opmerkingen</p>
                                    <p style="margin: 0; font-size: 15px; color: #424245; background: #f5f5f7; padding: 12px 16px; border-radius: 8px;">{{notities}}</p>
                                </td>
                            </tr>{{/if}}
                        </table>
                    </div>
                </div>
                
                <!-- Footer -->
                <div style="padding: 24px 32px; background: #e8e8ed; text-align: center;">
                    <p style="margin: 0; font-size: 13px; color: #8e8e93;">{{bedrijfsnaam}}</p>
                </div>
            </div>
        `
    },
    appointment_reminder: {
        subject: 'Herinnering: {{dienst}} morgen om {{tijd}}',
        body_html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff;">
                <!-- Header -->
                <div style="background: #1d1d1f; padding: 40px 32px; text-align: center;">
                    {{#if bedrijfslogo}}<div style="margin-bottom: 16px;">{{bedrijfslogo}}</div>{{/if}}
                    <h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #ffffff; letter-spacing: -0.5px;">Herinnering</h1>
                    <p style="margin: 12px 0 0; font-size: 15px; color: #aeaeb2;">Uw afspraak is morgen</p>
                </div>
                
                <!-- Content -->
                <div style="padding: 40px 32px; background: #f5f5f7;">
                    <p style="margin: 0 0 24px; font-size: 17px; color: #1d1d1f; line-height: 1.5;">Beste {{klantnaam}},</p>
                    <p style="margin: 0 0 32px; font-size: 15px; color: #424245; line-height: 1.6;">Dit is een herinnering voor uw afspraak morgen:</p>
                    
                    <!-- Highlight Card -->
                    <div style="background: #ffffff; border-radius: 16px; padding: 32px; margin: 0 0 32px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                        <p style="margin: 0 0 8px; font-size: 44px; font-weight: 600; color: #1d1d1f; letter-spacing: -1px;">{{tijd}}</p>
                        <p style="margin: 0 0 16px; font-size: 17px; color: #636366;">{{datum}}</p>
                        <div style="display: inline-block; background: #f5f5f7; padding: 8px 16px; border-radius: 20px;">
                            <span style="font-size: 15px; color: #1d1d1f; font-weight: 500;">{{dienst}}</span>
                        </div>
                        {{#if locatie}}<p style="margin: 20px 0 0; font-size: 15px; color: #8e8e93;">📍 {{locatie}}</p>{{/if}}
                    </div>
                    
                    <p style="margin: 0 0 8px; font-size: 15px; color: #424245; line-height: 1.6;">Tot morgen!</p>
                    <p style="margin: 24px 0 0; font-size: 15px; color: #1d1d1f; line-height: 1.6;">Met vriendelijke groet,<br><strong>{{bedrijfsnaam}}</strong></p>
                </div>
                
                <!-- Footer -->
                <div style="padding: 24px 32px; background: #e8e8ed; text-align: center;">
                    <p style="margin: 0; font-size: 13px; color: #8e8e93;">{{bedrijfsnaam}}</p>
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
    { key: '{{bedrijfslogo}}', description: 'Uw bedrijfslogo (als img tag)' },
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
