/**
 * Calendar Feed Routes - iCal/ICS Feed voor PianoPlanner
 * Genereert een subscribable calendar feed voor externe kalender apps
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbRun, dbGet, dbAll } = require('../utils/database');
const { requireAuth } = require('../middleware/auth');
const appointmentStore = require('../utils/appointmentStore');

/**
 * Generate a secure random token for the calendar feed
 */
function generateFeedToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Format date to iCal format: 20260107T143000Z
 */
function formatICalDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Format date for all-day events: 20260107
 */
function formatICalDateOnly(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * Escape special characters in iCal text
 */
function escapeICalText(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

/**
 * Generate iCal content from appointments
 */
function generateICalContent(appointments, calendarName) {
    const now = new Date();
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//PianoPlanner//Calendar Feed//NL',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeICalText(calendarName || 'PianoPlanner')}`,
        'X-WR-TIMEZONE:Europe/Amsterdam'
    ];

    // Add timezone definition
    lines.push(
        'BEGIN:VTIMEZONE',
        'TZID:Europe/Amsterdam',
        'BEGIN:DAYLIGHT',
        'DTSTART:19700329T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
        'TZOFFSETFROM:+0100',
        'TZOFFSETTO:+0200',
        'TZNAME:CEST',
        'END:DAYLIGHT',
        'BEGIN:STANDARD',
        'DTSTART:19701025T030000',
        'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
        'TZOFFSETFROM:+0200',
        'TZOFFSETTO:+0100',
        'TZNAME:CET',
        'END:STANDARD',
        'END:VTIMEZONE'
    );

    // Add events
    for (const apt of appointments) {
        const isAllDay = apt.allDay || (!apt.start?.includes('T'));
        
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${apt.id}@pianoplanner.com`);
        lines.push(`DTSTAMP:${formatICalDate(now)}`);
        
        if (isAllDay) {
            lines.push(`DTSTART;VALUE=DATE:${formatICalDateOnly(apt.start)}`);
            lines.push(`DTEND;VALUE=DATE:${formatICalDateOnly(apt.end)}`);
        } else {
            lines.push(`DTSTART;TZID=Europe/Amsterdam:${formatICalDate(apt.start).replace('Z', '')}`);
            lines.push(`DTEND;TZID=Europe/Amsterdam:${formatICalDate(apt.end).replace('Z', '')}`);
        }
        
        lines.push(`SUMMARY:${escapeICalText(apt.title)}`);
        
        if (apt.description) {
            lines.push(`DESCRIPTION:${escapeICalText(apt.description)}`);
        }
        
        if (apt.location) {
            lines.push(`LOCATION:${escapeICalText(apt.location)}`);
        }
        
        // Add customer info if available
        if (apt.customerName) {
            const existingDesc = apt.description || '';
            const customerInfo = `Klant: ${apt.customerName}`;
            if (!existingDesc.includes(apt.customerName)) {
                lines.push(`DESCRIPTION:${escapeICalText(existingDesc ? existingDesc + '\\n' + customerInfo : customerInfo)}`);
            }
        }
        
        // Status mapping
        if (apt.status === 'cancelled') {
            lines.push('STATUS:CANCELLED');
        } else if (apt.status === 'completed') {
            lines.push('STATUS:CONFIRMED');
        } else {
            lines.push('STATUS:CONFIRMED');
        }
        
        lines.push(`CREATED:${formatICalDate(apt.createdAt || now)}`);
        lines.push(`LAST-MODIFIED:${formatICalDate(apt.updatedAt || now)}`);
        lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    
    // iCal requires CRLF line endings
    return lines.join('\r\n');
}

// ==================== PUBLIC FEED ENDPOINT ====================

/**
 * GET /api/calendar-feed/:token.ics
 * Public endpoint - returns iCal feed for calendar subscription
 * No authentication required - token provides access
 */
router.get('/:token.ics', async (req, res) => {
    try {
        const { token } = req.params;

        // Find user by feed token
        const user = await dbGet(
            'SELECT id, name, email, calendar_feed_start_date, calendar_feed_months_ahead FROM users WHERE calendar_feed_token = ?',
            [token]
        );

        if (!user) {
            return res.status(404).send('Calendar feed not found');
        }

        // Determine date range based on user settings
        let startDate;
        if (user.calendar_feed_start_date) {
            startDate = new Date(user.calendar_feed_start_date);
        } else {
            // Default: 30 days ago
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
        }
        
        const monthsAhead = user.calendar_feed_months_ahead || 12;
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + monthsAhead);

        const appointments = await appointmentStore.getAppointmentsByDateRange(
            user.id,
            startDate.toISOString(),
            endDate.toISOString()
        );

        // Generate calendar name
        const calendarName = user.name ? `${user.name} - PianoPlanner` : 'PianoPlanner';

        // Generate iCal content
        const icalContent = generateICalContent(appointments, calendarName);

        // Set headers for iCal file
        res.set({
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="pianoplanner.ics"',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.send(icalContent);
    } catch (error) {
        console.error('Calendar feed error:', error);
        res.status(500).send('Error generating calendar feed');
    }
});

// ==================== AUTHENTICATED ENDPOINTS ====================

/**
 * GET /api/calendar-feed/settings
 * Get user's calendar feed settings
 */
router.get('/settings', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // First check if the column exists
        const columnCheck = await dbGet(
            "SELECT COUNT(*) as count FROM pragma_table_info('users') WHERE name='calendar_feed_token'",
            []
        );
        
        const columnExists = columnCheck && columnCheck.count > 0;

        if (!columnExists) {
            // Column doesn't exist yet, return disabled state
            console.log('📅 calendar_feed_token column not found, returning disabled');
            return res.json({
                enabled: false,
                feedUrl: null
            });
        }

        const user = await dbGet(
            'SELECT calendar_feed_token, calendar_feed_start_date, calendar_feed_months_ahead FROM users WHERE id = ?',
            [userId]
        );

        if (!user) {
            return res.json({
                enabled: false,
                feedUrl: null
            });
        }

        const hasToken = !!user.calendar_feed_token;
        const feedUrl = hasToken 
            ? `${getBaseUrl(req)}/api/calendar-feed/${user.calendar_feed_token}.ics`
            : null;

        res.json({
            enabled: hasToken,
            feedUrl,
            syncStartDate: user.calendar_feed_start_date || null,
            syncMonthsAhead: user.calendar_feed_months_ahead || 12
        });
    } catch (error) {
        console.error('Get feed settings error:', error);
        // Return a safe default instead of 500 error
        res.json({
            enabled: false,
            feedUrl: null,
            error: 'Could not load settings'
        });
    }
});

/**
 * PUT /api/calendar-feed/settings
 * Update sync range settings
 */
router.put('/settings', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { syncStartDate, syncMonthsAhead } = req.body;

        // Ensure columns exist
        await dbRun(`
            ALTER TABLE users ADD COLUMN calendar_feed_start_date TEXT
        `).catch(() => {});
        await dbRun(`
            ALTER TABLE users ADD COLUMN calendar_feed_months_ahead INTEGER DEFAULT 12
        `).catch(() => {});

        await dbRun(
            'UPDATE users SET calendar_feed_start_date = ?, calendar_feed_months_ahead = ? WHERE id = ?',
            [syncStartDate || null, syncMonthsAhead || 12, userId]
        );

        console.log(`📅 Calendar feed range updated for user ${req.session.user.email}: ${syncStartDate} + ${syncMonthsAhead} months`);

        res.json({
            success: true,
            message: 'Sync range updated'
        });
    } catch (error) {
        console.error('Update feed settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/calendar-feed/enable
 * Enable calendar feed and generate token
 */
router.post('/enable', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Generate new token
        const token = generateFeedToken();

        await dbRun(
            'UPDATE users SET calendar_feed_token = ? WHERE id = ?',
            [token, userId]
        );

        const feedUrl = `${getBaseUrl(req)}/api/calendar-feed/${token}.ics`;

        console.log(`📅 Calendar feed enabled for user ${req.session.user.email}`);

        res.json({
            success: true,
            feedUrl,
            message: 'Agenda feed is nu actief'
        });
    } catch (error) {
        console.error('Enable feed error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/calendar-feed/regenerate
 * Generate a new token (invalidates old links)
 */
router.post('/regenerate', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Generate new token
        const token = generateFeedToken();

        await dbRun(
            'UPDATE users SET calendar_feed_token = ? WHERE id = ?',
            [token, userId]
        );

        const feedUrl = `${getBaseUrl(req)}/api/calendar-feed/${token}.ics`;

        console.log(`📅 Calendar feed regenerated for user ${req.session.user.email}`);

        res.json({
            success: true,
            feedUrl,
            message: 'Nieuwe feed link gegenereerd. Oude links werken niet meer.'
        });
    } catch (error) {
        console.error('Regenerate feed error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/calendar-feed/disable
 * Disable calendar feed
 */
router.delete('/disable', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        await dbRun(
            'UPDATE users SET calendar_feed_token = NULL WHERE id = ?',
            [userId]
        );

        console.log(`📅 Calendar feed disabled for user ${req.session.user.email}`);

        res.json({
            success: true,
            message: 'Agenda feed is uitgeschakeld'
        });
    } catch (error) {
        console.error('Disable feed error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/calendar-feed/export
 * Download calendar as .ics file (backup/export)
 * Requires authentication
 */
router.get('/export', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userName = req.session.user.name || 'PianoPlanner';
        
        // Get date range from query params, default to all
        const { from, to, format } = req.query;
        
        let startDate, endDate;
        
        if (from) {
            startDate = new Date(from);
        } else {
            // Default: 1 year ago
            startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 1);
        }
        
        if (to) {
            endDate = new Date(to);
        } else {
            // Default: 1 year from now
            endDate = new Date();
            endDate.setFullYear(endDate.getFullYear() + 1);
        }

        // Get appointments
        const appointments = await appointmentStore.getAppointmentsByDateRange(
            userId,
            startDate.toISOString(),
            endDate.toISOString()
        );

        // Generate calendar name with date
        const dateStr = new Date().toISOString().split('T')[0];
        const calendarName = `${userName} - PianoPlanner Export ${dateStr}`;

        // Generate iCal content
        const icalContent = generateICalContent(appointments, calendarName);

        // Set headers for download
        const filename = `pianoplanner-backup-${dateStr}.ics`;
        res.set({
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-cache'
        });

        console.log(`📅 Calendar exported for user ${req.session.user.email}: ${appointments.length} appointments`);

        res.send(icalContent);
    } catch (error) {
        console.error('Calendar export error:', error);
        res.status(500).json({ error: 'Kon agenda niet exporteren: ' + error.message });
    }
});

/**
 * Get base URL for feed links
 */
function getBaseUrl(req) {
    // In production, use the actual domain
    if (process.env.NODE_ENV === 'production') {
        return process.env.APP_URL || 'https://www.pianoplanner.com';
    }
    // In development, construct from request
    return `${req.protocol}://${req.get('host')}`;
}

module.exports = router;
