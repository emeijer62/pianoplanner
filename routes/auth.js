const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const userStore = require('../utils/userStore');

// Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Admin credentials (uit environment of defaults)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'PianoAdmin2026!';

// Scopes voor Google Calendar
const SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
];

// ==================== EMAIL/PASSWORD AUTH ====================

// Registreren met email/wachtwoord
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email en wachtwoord zijn verplicht' });
        }

        // Valideer email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Ongeldig email formaat' });
        }

        const result = await userStore.registerUser(email, password, name);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        // NIET direct inloggen - wacht op goedkeuring
        console.log(`📋 Nieuwe registratie wacht op goedkeuring: ${email}`);

        res.json({ 
            success: true, 
            needsApproval: true,
            message: 'Je account is aangemaakt! Je ontvangt bericht zodra een beheerder je account heeft goedgekeurd.',
            user: {
                id: result.user.id,
                email: result.user.email,
                name: result.user.name
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registratie mislukt' });
    }
});

// Inloggen met email/wachtwoord
router.post('/login', async (req, res) => {
    try {
        const { email, password, remember } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email en wachtwoord zijn verplicht' });
        }

        const result = await userStore.loginWithEmail(email, password);

        if (result.error) {
            console.log(`⚠️ Mislukte login poging: ${email}`);
            return res.status(401).json({ error: result.error });
        }

        // 🔒 SECURITY: Regenerate session to prevent fixation attacks
        req.session.regenerate((err) => {
            if (err) {
                console.error('Session regeneration error:', err);
                return res.status(500).json({ error: 'Session error' });
            }

            // Zet sessie met langere duur als "ingelogd blijven" is aangevinkt
            if (remember) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 dagen
            }

            // Update last login timestamp
            userStore.updateLastLogin(result.user.id);

            // Zet sessie
            req.session.user = {
                id: result.user.id,
                email: result.user.email,
                name: result.user.name,
                picture: result.user.picture,
                authType: result.user.authType
            };

            console.log(`✅ Gebruiker ingelogd (email): ${email}${remember ? ' (ingelogd blijven)' : ''}`);

            res.json({ 
                success: true, 
                message: 'Succesvol ingelogd',
                user: {
                    id: result.user.id,
                    email: result.user.email,
                    name: result.user.name
                }
            });
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Inloggen mislukt' });
    }
});

// ==================== PASSWORD RESET ====================

// Request password reset
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is verplicht' });
        }
        
        const result = await userStore.createPasswordResetToken(email);
        
        if (result.error) {
            // Don't reveal if email exists - always show success message
            console.log(`⚠️ Password reset request failed for ${email}: ${result.error}`);
            return res.json({ 
                success: true, 
                message: 'Als dit emailadres bij ons bekend is, ontvang je een reset link.' 
            });
        }
        
        // Send reset email
        const emailService = require('../utils/emailService');
        const resetUrl = `${process.env.BASE_URL || 'https://www.pianoplanner.com'}/reset-password.html?token=${result.token}`;
        
        try {
            await emailService.sendEmail({
                to: result.user.email,
                subject: 'Wachtwoord resetten - PianoPlanner',
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #1d1d1f; font-size: 24px; font-weight: 600; margin: 0;">🎹 PianoPlanner</h1>
                        </div>
                        
                        <div style="background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                            <h2 style="color: #1d1d1f; font-size: 20px; margin: 0 0 16px;">Wachtwoord resetten</h2>
                            
                            <p style="color: #424245; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                                Hallo ${result.user.name || 'daar'},<br><br>
                                Je hebt een verzoek ingediend om je wachtwoord te resetten. 
                                Klik op de onderstaande knop om een nieuw wachtwoord in te stellen.
                            </p>
                            
                            <div style="text-align: center; margin: 32px 0;">
                                <a href="${resetUrl}" style="display: inline-block; background: #0071e3; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 980px; font-size: 15px; font-weight: 500;">
                                    Wachtwoord resetten
                                </a>
                            </div>
                            
                            <p style="color: #86868b; font-size: 13px; line-height: 1.5; margin: 24px 0 0;">
                                Deze link is 1 uur geldig. Heb je dit verzoek niet gedaan? 
                                Dan kun je deze email negeren.
                            </p>
                        </div>
                        
                        <p style="color: #86868b; font-size: 12px; text-align: center; margin-top: 24px;">
                            © ${new Date().getFullYear()} PianoPlanner
                        </p>
                    </div>
                `
            });
            console.log(`📧 Password reset email verzonden naar: ${email}`);
        } catch (emailError) {
            console.error('Failed to send reset email:', emailError);
            // Still return success to not reveal email existence
        }
        
        res.json({ 
            success: true, 
            message: 'Als dit emailadres bij ons bekend is, ontvang je een reset link.' 
        });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden' });
    }
});

// Verify reset token
router.get('/verify-reset-token', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ error: 'Token ontbreekt' });
        }
        
        const result = await userStore.verifyPasswordResetToken(token);
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        res.json({ valid: true, email: result.user.email });
        
    } catch (error) {
        console.error('Verify token error:', error);
        res.status(500).json({ error: 'Kon token niet verifiëren' });
    }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        
        if (!token || !password) {
            return res.status(400).json({ error: 'Token en wachtwoord zijn verplicht' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Wachtwoord moet minimaal 6 tekens zijn' });
        }
        
        const result = await userStore.resetPasswordWithToken(token, password);
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        res.json({ 
            success: true, 
            message: 'Wachtwoord succesvol gewijzigd. Je kunt nu inloggen.' 
        });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Kon wachtwoord niet resetten' });
    }
});

// ==================== GOOGLE OAUTH ====================

// Start Google OAuth flow
router.get('/google', (req, res) => {
    // Sla remember voorkeur op in sessie voor na de callback
    req.session.rememberMe = req.query.remember === '1';
    // Check of we consent moeten forceren (voor nieuwe refresh_token)
    req.session.forceConsent = req.query.reauth === '1';
    
    // Standaard: alleen account selectie (gebruikersvriendelijk)
    // Bij reauth=1: forceer consent om nieuwe refresh_token te krijgen
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: req.query.reauth === '1' ? 'consent' : 'select_account',
        include_granted_scopes: true
    });
    res.redirect(authUrl);
});

// Google OAuth callback
router.get('/google/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.redirect('/?error=no_code');
    }

    try {
        // Verkrijg tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Haal gebruikersinfo op
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data: userInfo } = await oauth2.userinfo.get();

        // Check of dit een nieuwe gebruiker is
        const existingUser = await userStore.getUser(userInfo.id);
        const isNewUser = !existingUser;

        // Combineer tokens: behoud bestaande refresh_token als nieuwe niet aanwezig is
        let finalTokens = tokens;
        if (existingUser?.tokens?.refresh_token && !tokens.refresh_token) {
            // Behoud de bestaande refresh_token
            finalTokens = {
                ...tokens,
                refresh_token: existingUser.tokens.refresh_token
            };
            console.log(`🔄 Bestaande refresh_token behouden voor ${userInfo.email}`);
        }
        
        // Als we GEEN refresh_token hebben (nieuw of bestaand), vraag om reauth
        if (!finalTokens.refresh_token && !isNewUser) {
            console.log(`⚠️ Geen refresh_token voor ${userInfo.email}, redirect naar reauth`);
            return res.redirect('/auth/google?reauth=1');
        }

        // Sla gebruiker op (of update)
        const user = await userStore.saveUser({
            id: userInfo.id,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            tokens: finalTokens,
            authType: 'google'
        });

        // Start trial voor nieuwe gebruikers
        if (isNewUser) {
            await userStore.startTrial(user.id);
            console.log(`🎁 Nieuwe gebruiker, trial gestart: ${user.email}`);
        }

        // Update last login timestamp
        await userStore.updateLastLogin(user.id);

        // Pas sessie duur aan als "ingelogd blijven" was aangevinkt
        if (req.session.rememberMe) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 dagen
        }

        // Zet sessie
        req.session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
            authType: 'google'
        };
        req.session.tokens = finalTokens;

        // Sla sessie expliciet op voor redirect
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.redirect('/?error=session_failed');
            }
            console.log(`✅ Gebruiker ingelogd (Google): ${user.email}${req.session.rememberMe ? ' (ingelogd blijven)' : ''}`);
            // Redirect naar www om consistentie te garanderen
            const redirectUrl = process.env.NODE_ENV === 'production' 
                ? 'https://www.pianoplanner.com/dashboard.html'
                : '/dashboard.html';
            res.redirect(redirectUrl);
        });

    } catch (error) {
        console.error('OAuth error:', error);
        res.redirect('/?error=oauth_failed');
    }
});

// Uitloggen
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// ==================== ADMIN LOGIN ====================

// Admin login met username/password
router.post('/admin/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn verplicht' });
    }

    // Check credentials
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        // Zet admin sessie
        req.session.user = {
            id: 'admin',
            email: 'admin@pianoplanner.com',
            name: 'Administrator',
            isAdminUser: true
        };
        req.session.isAdmin = true;

        console.log(`🔐 Admin ingelogd: ${username}`);
        res.json({ success: true, message: 'Ingelogd als admin' });
    } else {
        console.log(`⚠️ Mislukte admin login poging: ${username}`);
        res.status(401).json({ error: 'Ongeldige gebruikersnaam of wachtwoord' });
    }
});

// Check admin status
router.get('/admin/status', (req, res) => {
    const isAdmin = req.session.isAdmin || false;
    const username = req.session.adminUsername || null;
    res.json({ isAdmin, username });
});

// Check general auth status (including impersonation)
router.get('/status', (req, res) => {
    res.json({
        loggedIn: !!req.session.user,
        userId: req.session.userId || req.session.user?.id || null,
        isAdmin: req.session.isAdmin || false,
        isImpersonating: req.session.isImpersonating || false,
        originalAdmin: req.session.originalAdmin?.adminUsername || null
    });
});

// ==================== PROFILE MANAGEMENT ====================

// Update profiel (naam en email)
router.put('/profile', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    const { name, email } = req.body;

    if (!name && !email) {
        return res.status(400).json({ error: 'Geen wijzigingen opgegeven' });
    }

    // Valideer email format als opgegeven
    if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Ongeldig email formaat' });
        }
    }

    const result = await userStore.updateUserProfile(req.session.user.id, { name, email });

    if (result.error) {
        return res.status(400).json({ error: result.error });
    }

    // Update sessie met nieuwe gegevens
    if (name) req.session.user.name = name;
    if (email) req.session.user.email = email;

    console.log(`✏️ Profiel bijgewerkt: ${req.session.user.email}`);
    res.json({ 
        success: true, 
        message: 'Profiel bijgewerkt',
        user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email
        }
    });
});

// Wijzig wachtwoord
router.put('/password', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;
    const user = await userStore.getUser(req.session.user.id);

    // Voor Google gebruikers die voor het eerst een wachtwoord instellen
    if (user.authType === 'google' && !user.passwordHash) {
        if (!newPassword) {
            return res.status(400).json({ error: 'Nieuw wachtwoord is verplicht' });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'Wachtwoorden komen niet overeen' });
        }
        
        const result = await userStore.changePassword(req.session.user.id, '', newPassword);
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        // Update session authType since user can now login with email/password
        req.session.user.authType = 'email';
        
        console.log(`🔐 Wachtwoord ingesteld voor Google gebruiker: ${req.session.user.email}`);
        return res.json({ success: true, message: 'Wachtwoord ingesteld! Je kunt nu ook inloggen met email en wachtwoord.' });
    }

    // Normale wachtwoord wijziging
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Huidig en nieuw wachtwoord zijn verplicht' });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'Nieuwe wachtwoorden komen niet overeen' });
    }

    const result = await userStore.changePassword(req.session.user.id, currentPassword, newPassword);

    if (result.error) {
        return res.status(400).json({ error: result.error });
    }

    console.log(`🔐 Wachtwoord gewijzigd: ${req.session.user.email}`);
    res.json({ success: true, message: 'Wachtwoord succesvol gewijzigd' });
});

// Haal huidige profiel gegevens op
router.get('/profile', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    const user = await userStore.getUser(req.session.user.id);
    if (!user) {
        return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }

    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        authType: user.authType,
        hasPassword: !!user.passwordHash,
        createdAt: user.createdAt
    });
});

module.exports = router;
