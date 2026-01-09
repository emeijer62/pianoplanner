/**
 * Microsoft 365 / Outlook Calendar Integration via Microsoft Graph API
 * 
 * Uses OAuth 2.0 for authentication and Microsoft Graph API for calendar access.
 * Supports both personal Microsoft accounts and work/school (Office 365) accounts.
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const userStore = require('../utils/userStore');
const { requireAuth } = require('../middleware/auth');
const { requireTierFeature } = require('../middleware/subscription');

// Middleware: calendar sync requires Go tier
const requireCalendarSync = requireTierFeature('calendarSync');

// Microsoft OAuth endpoints
const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';

// Scopes needed for calendar access
const SCOPES = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'Calendars.ReadWrite',
    'User.Read'
].join(' ');

// Get Microsoft credentials from environment
const getCredentials = () => ({
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || `${process.env.BASE_URL || 'https://pianoplanner.nl'}/api/microsoft/callback`
});

// ==================== OAUTH FLOW ====================

/**
 * Start Microsoft OAuth flow (Go tier required)
 * GET /api/microsoft/auth
 */
router.get('/auth', requireAuth, requireCalendarSync, (req, res) => {
    const { clientId, redirectUri } = getCredentials();
    
    if (!clientId) {
        return res.status(500).json({ error: 'Microsoft integration not configured' });
    }
    
    // Store user ID in state for callback
    const state = Buffer.from(JSON.stringify({
        userId: req.session.user.id,
        returnUrl: req.query.returnUrl || '/settings.html'
    })).toString('base64');
    
    const authUrl = new URL(MICROSOFT_AUTH_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('prompt', 'consent'); // Always show consent to get refresh token
    
    console.log('🔵 Microsoft OAuth: Redirecting to Microsoft login');
    res.redirect(authUrl.toString());
});

/**
 * OAuth callback from Microsoft
 * GET /api/microsoft/callback
 */
router.get('/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    
    // Parse state
    let stateData = {};
    try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
        console.error('🔵 Microsoft OAuth: Invalid state');
    }
    
    const returnUrl = stateData.returnUrl || '/settings.html';
    
    if (error) {
        console.error('🔵 Microsoft OAuth error:', error, error_description);
        return res.redirect(`${returnUrl}?error=microsoft_auth_failed&message=${encodeURIComponent(error_description || error)}`);
    }
    
    if (!code) {
        return res.redirect(`${returnUrl}?error=no_code`);
    }
    
    try {
        const { clientId, clientSecret, redirectUri } = getCredentials();
        
        // Exchange code for tokens
        const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
                scope: SCOPES
            })
        });
        
        const tokens = await tokenResponse.json();
        
        if (tokens.error) {
            console.error('🔵 Microsoft token error:', tokens.error, tokens.error_description);
            return res.redirect(`${returnUrl}?error=token_exchange_failed`);
        }
        
        // Get user info from Microsoft
        const userResponse = await fetch(`${GRAPH_API_URL}/me`, {
            headers: {
                'Authorization': `Bearer ${tokens.access_token}`
            }
        });
        
        const microsoftUser = await userResponse.json();
        
        console.log(`🔵 Microsoft OAuth success for: ${microsoftUser.mail || microsoftUser.userPrincipalName}`);
        
        // Save tokens to user
        const userId = stateData.userId || req.session?.user?.id;
        if (userId) {
            await userStore.saveMicrosoftCalendarCredentials(userId, {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: Date.now() + (tokens.expires_in * 1000),
                email: microsoftUser.mail || microsoftUser.userPrincipalName,
                displayName: microsoftUser.displayName,
                connected: true
            });
            
            console.log(`🔵 Microsoft Calendar connected for user ${userId}`);
        }
        
        res.redirect(`${returnUrl}?success=microsoft_connected`);
        
    } catch (error) {
        console.error('🔵 Microsoft OAuth callback error:', error);
        res.redirect(`${returnUrl}?error=callback_failed`);
    }
});

/**
 * Disconnect Microsoft Calendar
 * POST /api/microsoft/disconnect
 */
router.post('/disconnect', requireAuth, async (req, res) => {
    try {
        await userStore.removeMicrosoftCalendarCredentials(req.session.user.id);
        console.log(`🔵 Microsoft Calendar disconnected for user ${req.session.user.id}`);
        res.json({ success: true });
    } catch (error) {
        console.error('🔵 Microsoft disconnect error:', error);
        res.status(500).json({ error: 'Could not disconnect Microsoft Calendar' });
    }
});

/**
 * Get connection status
 * GET /api/microsoft/status
 */
router.get('/status', requireAuth, async (req, res) => {
    try {
        const credentials = await userStore.getMicrosoftCalendarCredentials(req.session.user.id);
        
        if (!credentials || !credentials.connected) {
            return res.json({ connected: false });
        }
        
        res.json({
            connected: true,
            email: credentials.email,
            displayName: credentials.displayName
        });
    } catch (error) {
        console.error('🔵 Microsoft status error:', error);
        res.json({ connected: false });
    }
});

// ==================== TOKEN REFRESH ====================

/**
 * Refresh Microsoft access token
 */
async function refreshMicrosoftTokens(userId, credentials) {
    const { clientId, clientSecret } = getCredentials();
    
    if (!credentials.refreshToken) {
        throw new Error('No refresh token available');
    }
    
    const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: credentials.refreshToken,
            grant_type: 'refresh_token',
            scope: SCOPES
        })
    });
    
    const tokens = await tokenResponse.json();
    
    if (tokens.error) {
        console.error('🔵 Microsoft token refresh error:', tokens.error);
        throw new Error('Token refresh failed');
    }
    
    // Update stored credentials
    const updatedCredentials = {
        ...credentials,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || credentials.refreshToken,
        expiresAt: Date.now() + (tokens.expires_in * 1000)
    };
    
    await userStore.saveMicrosoftCalendarCredentials(userId, updatedCredentials);
    console.log(`🔵 Microsoft tokens refreshed for user ${userId}`);
    
    return updatedCredentials;
}

/**
 * Get valid access token (refresh if needed)
 */
async function getValidAccessToken(userId) {
    let credentials = await userStore.getMicrosoftCalendarCredentials(userId);
    
    if (!credentials || !credentials.connected) {
        return null;
    }
    
    // Refresh if expired or about to expire (5 min buffer)
    if (credentials.expiresAt && credentials.expiresAt < Date.now() + 300000) {
        try {
            credentials = await refreshMicrosoftTokens(userId, credentials);
        } catch (error) {
            console.error('🔵 Failed to refresh Microsoft tokens:', error);
            return null;
        }
    }
    
    return credentials.accessToken;
}

// ==================== CALENDARS ====================

/**
 * Get user's calendars
 * GET /api/microsoft/calendars
 */
router.get('/calendars', requireAuth, async (req, res) => {
    try {
        const accessToken = await getValidAccessToken(req.session.user.id);
        
        if (!accessToken) {
            return res.status(401).json({ error: 'Not connected to Microsoft Calendar' });
        }
        
        const response = await fetch(`${GRAPH_API_URL}/me/calendars`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.error) {
            console.error('🔵 Microsoft calendars error:', data.error);
            return res.status(500).json({ error: 'Could not fetch calendars' });
        }
        
        res.json(data.value || []);
    } catch (error) {
        console.error('🔵 Microsoft calendars error:', error);
        res.status(500).json({ error: 'Could not fetch calendars' });
    }
});

// ==================== EVENTS ====================

/**
 * Get events from Microsoft Calendar
 * GET /api/microsoft/events
 */
router.get('/events', requireAuth, async (req, res) => {
    try {
        const { start, end, calendarId } = req.query;
        const accessToken = await getValidAccessToken(req.session.user.id);
        
        if (!accessToken) {
            return res.status(401).json({ error: 'Not connected to Microsoft Calendar' });
        }
        
        // Default to primary calendar
        const calendar = calendarId || 'primary';
        const endpoint = calendar === 'primary' 
            ? `${GRAPH_API_URL}/me/calendar/events`
            : `${GRAPH_API_URL}/me/calendars/${calendarId}/events`;
        
        const url = new URL(endpoint);
        
        // Add date filter
        const startDate = start ? new Date(start) : new Date();
        const endDate = end ? new Date(end) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        
        url.searchParams.set('$filter', `start/dateTime ge '${startDate.toISOString()}' and end/dateTime le '${endDate.toISOString()}'`);
        url.searchParams.set('$orderby', 'start/dateTime');
        url.searchParams.set('$top', '100');
        
        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Prefer': 'outlook.timezone="Europe/Amsterdam"'
            }
        });
        
        const data = await response.json();
        
        if (data.error) {
            console.error('🔵 Microsoft events error:', data.error);
            return res.status(500).json({ error: 'Could not fetch events' });
        }
        
        // Transform to common format
        const events = (data.value || []).map(event => ({
            id: event.id,
            summary: event.subject,
            description: event.bodyPreview,
            location: event.location?.displayName,
            start: event.start?.dateTime,
            end: event.end?.dateTime,
            isAllDay: event.isAllDay
        }));
        
        res.json({ events });
    } catch (error) {
        console.error('🔵 Microsoft events error:', error);
        res.status(500).json({ error: 'Could not fetch events' });
    }
});

/**
 * Create event in Microsoft Calendar
 * POST /api/microsoft/events
 */
router.post('/events', requireAuth, async (req, res) => {
    try {
        const { summary, description, location, start, end, calendarId } = req.body;
        const accessToken = await getValidAccessToken(req.session.user.id);
        
        if (!accessToken) {
            return res.status(401).json({ error: 'Not connected to Microsoft Calendar' });
        }
        
        const calendar = calendarId || 'primary';
        const endpoint = calendar === 'primary'
            ? `${GRAPH_API_URL}/me/calendar/events`
            : `${GRAPH_API_URL}/me/calendars/${calendarId}/events`;
        
        const event = {
            subject: summary,
            body: {
                contentType: 'text',
                content: description || ''
            },
            start: {
                dateTime: new Date(start).toISOString(),
                timeZone: 'Europe/Amsterdam'
            },
            end: {
                dateTime: new Date(end).toISOString(),
                timeZone: 'Europe/Amsterdam'
            }
        };
        
        if (location) {
            event.location = { displayName: location };
        }
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });
        
        const data = await response.json();
        
        if (data.error) {
            console.error('🔵 Microsoft create event error:', data.error);
            return res.status(500).json({ error: 'Could not create event' });
        }
        
        console.log(`🔵 Microsoft event created: ${summary}`);
        
        res.json({
            id: data.id,
            summary: data.subject,
            start: data.start?.dateTime,
            end: data.end?.dateTime
        });
    } catch (error) {
        console.error('🔵 Microsoft create event error:', error);
        res.status(500).json({ error: 'Could not create event' });
    }
});

/**
 * Delete event from Microsoft Calendar
 * DELETE /api/microsoft/events/:eventId
 */
router.delete('/events/:eventId', requireAuth, async (req, res) => {
    try {
        const { eventId } = req.params;
        const accessToken = await getValidAccessToken(req.session.user.id);
        
        if (!accessToken) {
            return res.status(401).json({ error: 'Not connected to Microsoft Calendar' });
        }
        
        const response = await fetch(`${GRAPH_API_URL}/me/events/${eventId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok && response.status !== 204) {
            const data = await response.json();
            console.error('🔵 Microsoft delete event error:', data.error);
            return res.status(500).json({ error: 'Could not delete event' });
        }
        
        console.log(`🔵 Microsoft event deleted: ${eventId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('🔵 Microsoft delete event error:', error);
        res.status(500).json({ error: 'Could not delete event' });
    }
});

// ==================== EXPORTS ====================

// Export helper functions for use in booking.js
module.exports = router;
module.exports.getValidAccessToken = getValidAccessToken;
module.exports.GRAPH_API_URL = GRAPH_API_URL;
