/**
 * Calendar Feed Routes - iCal/ICS Feed voor PianoPlanner
 * Genereert een subscribable calendar feed voor externe kalender apps
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../utils/database');
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
        const db = getDb();

        // Find user by feed token
        const user = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id, name, email FROM users WHERE calendar_feed_token = ?',
                [token],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            return res.status(404).send('Calendar feed not found');
        }

        // Get all appointments for this user (future and recent past - 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

        const appointments = await appointmentStore.getAppointmentsByDateRange(
            user.id,
            thirtyDaysAgo.toISOString(),
            oneYearFromNow.toISOString()
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
        const db = getDb();
        const userId = req.session.user.id;

        const user = await new Promise((resolve, reject) => {
            db.get(
                'SELECT calendar_feed_token FROM users WHERE id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const hasToken = !!user.calendar_feed_token;
        const feedUrl = hasToken 
            ? `${getBaseUrl(req)}/api/calendar-feed/${user.calendar_feed_token}.ics`
            : null;

        res.json({
            enabled: hasToken,
            feedUrl,
            // Don't expose the actual token, just the full URL
        });
    } catch (error) {
        console.error('Get feed settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/calendar-feed/enable
 * Enable calendar feed and generate token
 */
router.post('/enable', requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.session.user.id;

        // Generate new token
        const token = generateFeedToken();

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET calendar_feed_token = ? WHERE id = ?',
                [token, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

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
        const db = getDb();
        const userId = req.session.user.id;

        // Generate new token
        const token = generateFeedToken();

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET calendar_feed_token = ? WHERE id = ?',
                [token, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

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
        const db = getDb();
        const userId = req.session.user.id;

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET calendar_feed_token = NULL WHERE id = ?',
                [userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

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
