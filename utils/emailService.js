/**
 * Email Service for PianoPlanner
 * Supports both central SMTP and per-user SMTP configuration
 */

const nodemailer = require('nodemailer');

// Email configuration for PianoPlanner central SMTP (TransIP)
const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.transip.email',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT) === 465, // true for 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
};

let emailTransporter = null;
let emailConfigured = false;

// Lazy-load user SMTP module to avoid circular dependency
let getUserTransporter = null;

// Lazy-load database module to avoid circular dependency
let dbGet = null;

/**
 * Initialize database getter lazily
 */
function getDbGet() {
    if (!dbGet) {
        try {
            dbGet = require('./database').dbGet;
        } catch (e) {
            console.log('⚠️ Database module not available for email templates');
        }
    }
    return dbGet;
}

/**
 * Default email templates (fallback when no custom template exists)
 * Elegant grayscale Apple-style design
 */
const DEFAULT_TEMPLATES = {
    appointment_confirmation: {
        subject: 'Bevestiging: {{dienst}} op {{datum}}',
        body_html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff;">
<div style="background: #1d1d1f; padding: 40px 32px; text-align: center;">
<h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #ffffff; letter-spacing: -0.5px;">Afspraak Bevestigd</h1>
</div>
<div style="padding: 40px 32px; background: #f5f5f7;">
<p style="margin: 0 0 24px; font-size: 17px; color: #1d1d1f; line-height: 1.5;">Beste {{klantnaam}},</p>
<p style="margin: 0 0 32px; font-size: 15px; color: #424245; line-height: 1.6;">Uw afspraak is bevestigd. Hier zijn de details:</p>
<div style="background: #ffffff; border-radius: 16px; padding: 28px; margin: 0 0 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
<table style="width: 100%; border-collapse: collapse;">
<tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Datum</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{datum}}</td></tr>
<tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Tijd</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{tijd}}</td></tr>
<tr><td style="padding: 12px 0; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Dienst</td><td style="padding: 12px 0; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{dienst}}</td></tr>
</table>
{{#notities}}<p style="margin: 16px 0 0; padding: 12px 16px; background: #f5f5f7; border-radius: 8px; font-size: 14px; color: #636366;">{{notities}}</p>{{/notities}}
</div>
<p style="margin: 0 0 8px; font-size: 15px; color: #424245; line-height: 1.6;">Heeft u vragen? Neem gerust contact met ons op.</p>
<p style="margin: 24px 0 0; font-size: 15px; color: #1d1d1f; line-height: 1.6;">Met vriendelijke groet,<br><strong>{{bedrijfsnaam}}</strong></p>
</div>
<div style="padding: 24px 32px; background: #e8e8ed; text-align: center;">
<p style="margin: 0; font-size: 13px; color: #8e8e93;">{{bedrijfsnaam}}</p>
</div>
</div>`
    },
    booking_notification: {
        subject: 'Nieuwe boeking: {{klantnaam}} - {{dienst}}',
        body_html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff;">
<div style="background: #1d1d1f; padding: 40px 32px; text-align: center;">
<h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #ffffff; letter-spacing: -0.5px;">Nieuwe Boeking</h1>
<p style="margin: 12px 0 0; font-size: 15px; color: #aeaeb2;">Er is een nieuwe afspraak geboekt</p>
</div>
<div style="padding: 40px 32px; background: #f5f5f7;">
<div style="background: #ffffff; border-radius: 16px; padding: 28px; margin: 0 0 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
<h2 style="margin: 0 0 20px; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Klantgegevens</h2>
<p style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #1d1d1f;">{{klantnaam}}</p>
<p style="margin: 0 0 4px; font-size: 15px; color: #636366;">{{klantemail}}</p>
<p style="margin: 0; font-size: 15px; color: #636366;">{{klanttelefoon}}</p>
</div>
<div style="background: #ffffff; border-radius: 16px; padding: 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
<h2 style="margin: 0 0 20px; font-size: 13px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Afspraakdetails</h2>
<table style="width: 100%; border-collapse: collapse;">
<tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 15px; color: #636366;">Dienst</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{dienst}}</td></tr>
<tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 15px; color: #636366;">Datum</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e8ed; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{datum}}</td></tr>
<tr><td style="padding: 12px 0; font-size: 15px; color: #636366;">Tijd</td><td style="padding: 12px 0; font-size: 17px; color: #1d1d1f; text-align: right; font-weight: 500;">{{tijd}}</td></tr>
</table>
{{#notities}}<p style="margin: 16px 0 0; padding: 12px 16px; background: #f5f5f7; border-radius: 8px; font-size: 14px; color: #424245;">{{notities}}</p>{{/notities}}
</div>
</div>
<div style="padding: 24px 32px; background: #e8e8ed; text-align: center;">
<p style="margin: 0; font-size: 13px; color: #8e8e93;">{{bedrijfsnaam}}</p>
</div>
</div>`
    },
    appointment_reminder: {
        subject: 'Herinnering: {{dienst}} op {{datum}}',
        body_html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff;">
<div style="background: #1d1d1f; padding: 40px 32px; text-align: center;">
<h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #ffffff; letter-spacing: -0.5px;">Herinnering</h1>
<p style="margin: 12px 0 0; font-size: 15px; color: #aeaeb2;">Uw afspraak is morgen</p>
</div>
<div style="padding: 40px 32px; background: #f5f5f7;">
<p style="margin: 0 0 24px; font-size: 17px; color: #1d1d1f; line-height: 1.5;">Beste {{klantnaam}},</p>
<p style="margin: 0 0 32px; font-size: 15px; color: #424245; line-height: 1.6;">Dit is een herinnering voor uw afspraak:</p>
<div style="background: #ffffff; border-radius: 16px; padding: 32px; margin: 0 0 32px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
<p style="margin: 0 0 8px; font-size: 44px; font-weight: 600; color: #1d1d1f; letter-spacing: -1px;">{{tijd}}</p>
<p style="margin: 0 0 16px; font-size: 17px; color: #636366;">{{datum}}</p>
<div style="display: inline-block; background: #f5f5f7; padding: 8px 16px; border-radius: 20px;">
<span style="font-size: 15px; color: #1d1d1f; font-weight: 500;">{{dienst}}</span>
</div>
{{#locatie}}<p style="margin: 20px 0 0; font-size: 15px; color: #8e8e93;">{{locatie}}</p>{{/locatie}}
</div>
<p style="margin: 0 0 8px; font-size: 15px; color: #424245; line-height: 1.6;">Wij kijken ernaar uit u te zien!</p>
<p style="margin: 24px 0 0; font-size: 15px; color: #1d1d1f; line-height: 1.6;">Met vriendelijke groet,<br><strong>{{bedrijfsnaam}}</strong></p>
</div>
<div style="padding: 24px 32px; background: #e8e8ed; text-align: center;">
<p style="margin: 0; font-size: 13px; color: #8e8e93;">{{bedrijfsnaam}}</p>
</div>
</div>`
    }
};

/**
 * Get email template for a user (custom or default)
 * @param {string} userId - User ID
 * @param {string} templateType - Type of template (appointment_confirmation, booking_notification, etc.)
 */
async function getUserTemplate(userId, templateType) {
    const getter = getDbGet();
    if (!getter) {
        return DEFAULT_TEMPLATES[templateType] || null;
    }
    
    try {
        const customTemplate = await getter(
            `SELECT subject, body_html, is_active FROM email_templates WHERE user_id = ? AND template_type = ?`,
            [userId, templateType]
        );
        
        if (customTemplate && customTemplate.is_active) {
            return {
                subject: customTemplate.subject,
                body_html: customTemplate.body_html
            };
        }
    } catch (e) {
        console.log('⚠️ Could not load custom template:', e.message);
    }
    
    return DEFAULT_TEMPLATES[templateType] || null;
}

/**
 * Get company logo URL for a user
 * @param {string} userId - User ID
 */
async function getCompanyLogo(userId) {
    const getter = getDbGet();
    if (!getter) return null;
    
    try {
        const company = await getter(
            `SELECT logo_url FROM company_settings WHERE user_id = ?`,
            [userId]
        );
        return company?.logo_url || null;
    } catch (e) {
        return null;
    }
}

/**
 * Generate logo HTML tag or empty string
 * @param {string} logoUrl - Logo URL
 * @param {string} baseUrl - Base URL for the logo (production URL)
 */
function generateLogoHtml(logoUrl, baseUrl = 'https://pianoplanner.com') {
    if (!logoUrl) return '';
    
    // Make sure URL is absolute
    const fullUrl = logoUrl.startsWith('http') ? logoUrl : `${baseUrl}${logoUrl}`;
    
    return `<img src="${fullUrl}" alt="Logo" style="max-width: 120px; max-height: 60px; margin-bottom: 16px;">`;
}

/**
 * Replace template variables with actual values
 * @param {string} text - Template text with {{variables}}
 * @param {Object} data - Data object with values
 */
function replaceTemplateVariables(text, data) {
    let result = text;
    
    // Replace simple variables: {{klantnaam}}
    for (const [key, value] of Object.entries(data)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(regex, value || '');
    }
    
    // Handle conditional blocks: {{#notities}}...{{/notities}}
    for (const [key, value] of Object.entries(data)) {
        const condRegex = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
        if (value && value.toString().trim()) {
            // Value exists - keep content, remove tags
            result = result.replace(condRegex, '$1');
        } else {
            // No value - remove entire block including content
            result = result.replace(condRegex, '');
        }
    }
    
    return result;
}

/**
 * Initialize email transporter
 */
function initializeEmail() {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        emailTransporter = nodemailer.createTransport(emailConfig);
        // Mark as configured immediately if credentials exist
        emailConfigured = true;
        
        // Test email configuration (async, just for logging)
        emailTransporter.verify((error, success) => {
            if (error) {
                console.log('❌ Email configuration error:', error.message);
                // Keep emailConfigured true - we'll handle errors when sending
            } else {
                console.log('✅ Email server ready:', process.env.SMTP_USER);
            }
        });
    } else {
        console.log('ℹ️ Email not configured (SMTP_USER and SMTP_PASS missing)');
    }
    
    // Lazy load user SMTP module
    try {
        getUserTransporter = require('../routes/userSmtp').getUserTransporter;
    } catch (e) {
        console.log('ℹ️ User SMTP module not available');
    }
}

/**
 * Check if email is configured
 */
function isEmailConfigured() {
    return emailConfigured && emailTransporter !== null;
}

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content
 * @param {string} [options.from] - Sender email (defaults to SMTP_USER)
 * @param {string} [options.replyTo] - Reply-to email address (for customer replies)
 * @param {string} [options.fromName] - Display name for sender (e.g. "Jan de Pianist")
 * @param {string} [options.userId] - User ID to check for custom SMTP settings
 */
async function sendEmail({ to, subject, html, text, from, replyTo, fromName, skipBcc, userId }) {
    try {
        // Check if user has their own SMTP configured
        let transporter = emailTransporter;
        // SMTP_FROM allows sending from a different address than SMTP_USER (e.g. alias)
        let senderEmail = from || process.env.SMTP_FROM || process.env.SMTP_USER;
        let senderName = fromName;
        let useUserSmtp = false;
        
        if (userId && getUserTransporter) {
            try {
                // Add timeout to prevent hanging
                const timeoutPromise = new Promise((resolve) => {
                    setTimeout(() => resolve(null), 3000);
                });
                const userSmtp = await Promise.race([
                    getUserTransporter(userId),
                    timeoutPromise
                ]);
                if (userSmtp && userSmtp.transporter) {
                    transporter = userSmtp.transporter;
                    senderEmail = userSmtp.fromEmail;
                    senderName = userSmtp.fromName || fromName;
                    useUserSmtp = true;
                }
            } catch (e) {
                // Use default SMTP on error
            }
        }
        
        if (!transporter) {
            console.log('📧 Email not sent (not configured):', subject);
            return { success: false, reason: 'Email not configured' };
        }

        // Build the "From" field with optional display name
        // Format: "Display Name <email@example.com>"
        let fromField;
        if (useUserSmtp) {
            // User's own SMTP - no "via PianoPlanner" needed
            fromField = senderName 
                ? `"${senderName}" <${senderEmail}>`
                : senderEmail;
        } else {
            // Central PianoPlanner SMTP - keep it simple to avoid spam filters
            fromField = senderName 
                ? `"${senderName}" <${senderEmail}>`
                : senderEmail;
        }
        
        const mailOptions = {
            from: fromField,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for plain text
            bcc: 'info@pianoplanner.com' // BCC voor admin monitoring
        };
        
        // Add Reply-To so customer replies go to the teacher/business
        // Only needed when using central SMTP
        if (replyTo && !useUserSmtp) {
            mailOptions.replyTo = replyTo;
        }
        
        const result = await transporter.sendMail(mailOptions);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('❌ Email sending failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send appointment confirmation email to customer
 * @param {string} replyTo - Email address for customer replies (teacher's email)
 * @param {string} fromName - Display name for sender (teacher/company name)
 * @param {string} userId - User ID to check for custom SMTP settings and templates
 */
async function sendAppointmentConfirmation({ customerEmail, customerName, appointmentDate, appointmentTime, serviceName, technicianName, companyName, notes, replyTo, fromName, userId, location }) {
    const formattedDate = new Date(appointmentDate).toLocaleDateString('nl-NL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Get company logo
    const logoUrl = await getCompanyLogo(userId);
    const logoHtml = generateLogoHtml(logoUrl);

    // Prepare template variables
    const templateData = {
        klantnaam: customerName || '',
        klantemail: customerEmail || '',
        datum: formattedDate,
        tijd: appointmentTime || '',
        dienst: serviceName || '',
        bedrijfsnaam: companyName || '',
        bedrijfslogo: logoHtml,
        notities: notes || '',
        locatie: location || ''
    };

    // Try to get custom template
    let subject, html;
    const template = await getUserTemplate(userId, 'appointment_confirmation');
    
    if (template) {
        subject = replaceTemplateVariables(template.subject, templateData);
        html = replaceTemplateVariables(template.body_html, templateData);
    } else {
        // Fallback to hardcoded template
        subject = `Afspraak Bevestigd - ${formattedDate}`;
        html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #1d1d1f 0%, #2d2d2f 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
                    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                    .content { background: #f5f5f7; padding: 30px; border-radius: 0 0 12px 12px; }
                    .appointment-card { background: white; border-radius: 12px; padding: 24px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
                    .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e5e5; }
                    .detail-row:last-child { border-bottom: none; }
                    .detail-label { color: #86868b; font-size: 14px; }
                    .detail-value { font-weight: 500; color: #1d1d1f; }
                    .footer { text-align: center; padding: 20px; color: #86868b; font-size: 12px; }
                    .icon { font-size: 48px; margin-bottom: 16px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="icon">🎹</div>
                        <h1>Afspraak Bevestigd</h1>
                    </div>
                    <div class="content">
                        <p>Beste ${customerName},</p>
                        <p>Uw afspraak is gepland. Hier zijn de details:</p>
                        
                        <div class="appointment-card">
                            <div class="detail-row">
                                <span class="detail-label">Datum</span>
                                <span class="detail-value">${formattedDate}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Tijd</span>
                                <span class="detail-value">${appointmentTime}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Dienst</span>
                                <span class="detail-value">${serviceName}</span>
                            </div>
                            ${technicianName ? `
                            <div class="detail-row">
                                <span class="detail-label">Technician</span>
                                <span class="detail-value">${technicianName}</span>
                            </div>
                            ` : ''}
                            ${notes ? `
                            <div class="detail-row">
                                <span class="detail-label">Notities</span>
                                <span class="detail-value">${notes}</span>
                            </div>
                            ` : ''}
                        </div>
                        
                        <p>Als u de afspraak wilt verzetten of annuleren, neem dan zo snel mogelijk contact met ons op.</p>
                        <p>Met vriendelijke groet,<br><strong>${companyName}</strong></p>
                    </div>
                    <div class="footer">
                        <p>Deze email is verzonden door ${companyName} via PianoPlanner</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    return sendEmail({
        to: customerEmail,
        subject,
        html,
        replyTo: replyTo,
        fromName: fromName || companyName,
        userId: userId
    });
}

/**
 * Send appointment reminder email to customer
 */
async function sendAppointmentReminder({ customerEmail, customerName, appointmentDate, appointmentTime, serviceName, technicianName, companyName, hoursUntil, replyTo, fromName, userId, location }) {
    const formattedDate = new Date(appointmentDate).toLocaleDateString('nl-NL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const timeUntilText = hoursUntil === 24 ? 'morgen' : `over ${hoursUntil} uur`;

    // Get company logo
    const logoUrl = await getCompanyLogo(userId);
    const logoHtml = generateLogoHtml(logoUrl);

    // Prepare template variables
    const templateData = {
        klantnaam: customerName || '',
        klantemail: customerEmail || '',
        datum: formattedDate,
        tijd: appointmentTime || '',
        dienst: serviceName || '',
        bedrijfsnaam: companyName || '',
        bedrijfslogo: logoHtml,
        locatie: location || ''
    };

    // Try to get custom template
    let subject, html;
    const template = await getUserTemplate(userId, 'appointment_reminder');
    
    if (template) {
        subject = replaceTemplateVariables(template.subject, templateData);
        html = replaceTemplateVariables(template.body_html, templateData);
    } else {
        // Fallback to hardcoded template
        subject = `Herinnering: Uw afspraak is ${timeUntilText} - ${formattedDate}`;
        html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #007aff 0%, #5856d6 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
                    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                    .content { background: #f5f5f7; padding: 30px; border-radius: 0 0 12px 12px; }
                    .appointment-card { background: white; border-radius: 12px; padding: 24px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
                    .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e5e5; }
                    .detail-row:last-child { border-bottom: none; }
                    .detail-label { color: #86868b; font-size: 14px; }
                    .detail-value { font-weight: 500; color: #1d1d1f; }
                    .reminder-badge { background: #ff9500; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-block; margin-bottom: 16px; }
                    .footer { text-align: center; padding: 20px; color: #86868b; font-size: 12px; }
                    .icon { font-size: 48px; margin-bottom: 16px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="icon">⏰</div>
                        <h1>Herinnering</h1>
                    </div>
                    <div class="content">
                        <p>Beste ${customerName},</p>
                        <span class="reminder-badge">${timeUntilText}</span>
                        <p>Dit is een herinnering voor uw afspraak:</p>
                        
                        <div class="appointment-card">
                            <div class="detail-row">
                                <span class="detail-label">Datum</span>
                                <span class="detail-value">${formattedDate}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Tijd</span>
                                <span class="detail-value">${appointmentTime}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Dienst</span>
                                <span class="detail-value">${serviceName}</span>
                            </div>
                            ${technicianName ? `
                            <div class="detail-row">
                                <span class="detail-label">Technician</span>
                                <span class="detail-value">${technicianName}</span>
                            </div>
                            ` : ''}
                        </div>
                        
                        <p>Wij kijken ernaar uit u te zien!</p>
                        <p>Met vriendelijke groet,<br><strong>${companyName}</strong></p>
                    </div>
                    <div class="footer">
                        <p>Deze email is verzonden door ${companyName} via PianoPlanner</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    return sendEmail({
        to: customerEmail,
        subject,
        html,
        replyTo: replyTo,
        fromName: fromName || companyName,
        userId: userId
    });
}

/**
 * Send cancellation notification to customer
 */
async function sendAppointmentCancellation({ customerEmail, customerName, appointmentDate, appointmentTime, serviceName, companyName, reason, replyTo, fromName, userId }) {
    const formattedDate = new Date(appointmentDate).toLocaleDateString('nl-NL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #ff3b30 0%, #ff6b6b 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                .content { background: #f5f5f7; padding: 30px; border-radius: 0 0 12px 12px; }
                .appointment-card { background: white; border-radius: 12px; padding: 24px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
                .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e5e5; }
                .detail-row:last-child { border-bottom: none; }
                .detail-label { color: #86868b; font-size: 14px; }
                .detail-value { font-weight: 500; color: #1d1d1f; text-decoration: line-through; color: #86868b; }
                .footer { text-align: center; padding: 20px; color: #86868b; font-size: 12px; }
                .icon { font-size: 48px; margin-bottom: 16px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="icon">❌</div>
                    <h1>Appointment Cancelled</h1>
                </div>
                <div class="content">
                    <p>Dear ${customerName},</p>
                    <p>Your appointment has been cancelled:</p>
                    
                    <div class="appointment-card">
                        <div class="detail-row">
                            <span class="detail-label">Date</span>
                            <span class="detail-value">${formattedDate}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Time</span>
                            <span class="detail-value">${appointmentTime}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Service</span>
                            <span class="detail-value">${serviceName}</span>
                        </div>
                    </div>
                    
                    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                    
                    <p>If you would like to reschedule, please contact us.</p>
                    <p>Best regards,<br><strong>${companyName}</strong></p>
                </div>
                <div class="footer">
                    <p>This email was sent by ${companyName} via PianoPlanner</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return sendEmail({
        to: customerEmail,
        subject: `Appointment Cancelled - ${formattedDate}`,
        html,
        replyTo: replyTo,
        fromName: fromName || companyName,
        userId: userId
    });
}

/**
 * Send new booking notification to technician
 */
async function sendNewBookingNotification({ technicianEmail, customerName, customerEmail, customerPhone, appointmentDate, appointmentTime, serviceName, notes, companyName }) {
    const formattedDate = new Date(appointmentDate).toLocaleDateString('nl-NL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #34c759 0%, #30d158 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                .content { background: #f5f5f7; padding: 30px; border-radius: 0 0 12px 12px; }
                .appointment-card { background: white; border-radius: 12px; padding: 24px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
                .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e5e5; }
                .detail-row:last-child { border-bottom: none; }
                .detail-label { color: #86868b; font-size: 14px; }
                .detail-value { font-weight: 500; color: #1d1d1f; }
                .new-badge { background: #34c759; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-block; margin-bottom: 16px; }
                .footer { text-align: center; padding: 20px; color: #86868b; font-size: 12px; }
                .icon { font-size: 48px; margin-bottom: 16px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="icon">📅</div>
                    <h1>New Booking</h1>
                </div>
                <div class="content">
                    <span class="new-badge">NEW</span>
                    <p>A new appointment has been booked:</p>
                    
                    <div class="appointment-card">
                        <div class="detail-row">
                            <span class="detail-label">Date</span>
                            <span class="detail-value">${formattedDate}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Time</span>
                            <span class="detail-value">${appointmentTime}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Service</span>
                            <span class="detail-value">${serviceName}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Customer</span>
                            <span class="detail-value">${customerName}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Email</span>
                            <span class="detail-value">${customerEmail}</span>
                        </div>
                        ${customerPhone ? `
                        <div class="detail-row">
                            <span class="detail-label">Phone</span>
                            <span class="detail-value">${customerPhone}</span>
                        </div>
                        ` : ''}
                        ${notes ? `
                        <div class="detail-row">
                            <span class="detail-label">Notes</span>
                            <span class="detail-value">${notes}</span>
                        </div>
                        ` : ''}
                    </div>
                    
                    <p>Log in to PianoPlanner to view and manage this appointment.</p>
                </div>
                <div class="footer">
                    <p>This notification was sent by PianoPlanner</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return sendEmail({
        to: technicianEmail,
        subject: `🎹 New Booking: ${customerName} - ${formattedDate}`,
        html
    });
}

/**
 * Send test email
 */
async function sendTestEmail(to) {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #1d1d1f 0%, #2d2d2f 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                .content { background: #f5f5f7; padding: 30px; border-radius: 0 0 12px 12px; }
                .success-badge { background: #34c759; color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; display: inline-block; }
                .icon { font-size: 48px; margin-bottom: 16px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="icon">🎹</div>
                    <h1>PianoPlanner</h1>
                </div>
                <div class="content">
                    <span class="success-badge">✓ Email Working</span>
                    <p style="margin-top: 20px;">Congratulations! Your email configuration is working correctly.</p>
                    <p>You can now send:</p>
                    <ul>
                        <li>Appointment confirmations</li>
                        <li>Appointment reminders</li>
                        <li>Cancellation notifications</li>
                        <li>New booking alerts</li>
                    </ul>
                    <p>Sent at: ${new Date().toLocaleString('nl-NL')}</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return sendEmail({
        to,
        subject: '✓ PianoPlanner Email Test Successful',
        html
    });
}

// Initialize on module load
initializeEmail();

module.exports = {
    initializeEmail,
    isEmailConfigured,
    sendEmail,
    sendAppointmentConfirmation,
    sendAppointmentReminder,
    sendAppointmentCancellation,
    sendNewBookingNotification,
    sendTestEmail,
    getCompanyLogo
};
