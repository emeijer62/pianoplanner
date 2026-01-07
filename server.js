require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');

// Database initialisatie (moet eerst!)
const { DATABASE_PATH, DATA_DIR } = require('./utils/database');

// Routes (nu met database versies)
const authRoutes = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');
const appleCalendarRoutes = require('./routes/appleCalendar');
const emailRoutes = require('./routes/email');
const customerRoutes = require('./routes/customers');
const serviceRoutes = require('./routes/services');
const bookingRoutes = require('./routes/booking');
const publicBookingRoutes = require('./routes/publicBooking');
const settingsRoutes = require('./routes/settings');
const stripeRoutes = require('./routes/stripe');
const stripeWebhookRoutes = require('./routes/stripeWebhook');
const pianoRoutes = require('./routes/pianos');
const appointmentRoutes = require('./routes/appointments');
const adminRoutes = require('./routes/admin');
const userStore = require('./utils/userStore');
const { requireAdmin, isAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Stripe webhook moet raw body hebben - VOOR json middleware
app.use('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhookRoutes);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuratie met SQLite store (persistent)
const isProduction = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1); // Trust Railway's proxy

app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: DATA_DIR,
        concurrentDB: true
    }),
    secret: process.env.SESSION_SECRET || 'pianoplanner-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: isProduction, // HTTPS in productie
        sameSite: isProduction ? 'none' : 'lax',
        domain: isProduction ? '.pianoplanner.com' : undefined, // Cookie werkt op www en non-www
        maxAge: 24 * 60 * 60 * 1000 // 24 uur
    }
}));

// Routes
app.use('/auth', authRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/apple-calendar', appleCalendarRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/book', publicBookingRoutes);  // Publieke booking API (geen auth vereist)
app.use('/api/settings', settingsRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/pianos', pianoRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/admin', adminRoutes);

// Email service for beta signup
const emailService = require('./utils/emailService');

// Beta signup (public, no auth required)
app.post('/api/beta-signup', async (req, res) => {
    try {
        const { name, email, company } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }
        
        // Send notification email to info@pianoplanner.com
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #0071e3 0%, #5856d6 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
                    .content { background: #f5f5f7; padding: 30px; border-radius: 0 0 12px 12px; }
                    .detail-card { background: white; border-radius: 12px; padding: 24px; margin: 20px 0; }
                    .detail-row { padding: 12px 0; border-bottom: 1px solid #e5e5e5; }
                    .detail-row:last-child { border-bottom: none; }
                    .label { color: #86868b; font-size: 14px; }
                    .value { font-weight: 500; color: #1d1d1f; }
                    .badge { background: #34c759; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎹 New Beta Signup!</h1>
                    </div>
                    <div class="content">
                        <span class="badge">NEW BETA REQUEST</span>
                        <div class="detail-card">
                            <div class="detail-row">
                                <div class="label">Name</div>
                                <div class="value">${name}</div>
                            </div>
                            <div class="detail-row">
                                <div class="label">Email</div>
                                <div class="value"><a href="mailto:${email}">${email}</a></div>
                            </div>
                            ${company ? `
                            <div class="detail-row">
                                <div class="label">Company</div>
                                <div class="value">${company}</div>
                            </div>
                            ` : ''}
                            <div class="detail-row">
                                <div class="label">Signed up at</div>
                                <div class="value">${new Date().toLocaleString('en-US')}</div>
                            </div>
                        </div>
                        <p>Reply to this email to send them a beta invite!</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        await emailService.sendEmail({
            to: 'info@pianoplanner.com',
            subject: `🎹 New Beta Signup: ${name}`,
            html,
            skipBcc: true // Don't BCC ourselves
        });
        
        console.log(`📧 Beta signup: ${name} <${email}> ${company ? `(${company})` : ''}`);
        
        res.json({ success: true, message: 'Beta signup received' });
    } catch (error) {
        console.error('Beta signup error:', error);
        res.status(500).json({ error: 'Could not process signup' });
    }
});

// Publieke boekingspagina route (serve book.html voor /book/:slug)
app.get('/book/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'book.html'));
});

// API route om ingelogde gebruiker te checken
app.get('/api/user', async (req, res) => {
    if (req.session.user) {
        try {
            // Check admin status via sessie of email
            const isAdminUser = req.session.isAdmin || req.session.user.isAdminUser || isAdmin(req.session.user.email);
            
            // Subscription alleen voor normale gebruikers
            let subscriptionStatus = null;
            if (!req.session.user.isAdminUser) {
                subscriptionStatus = await userStore.getSubscriptionStatus(req.session.user.id);
            }
            
            res.json({ 
                loggedIn: true, 
                user: req.session.user,
                isAdmin: isAdminUser,
                subscription: subscriptionStatus
            });
        } catch (error) {
            console.error('Error in /api/user:', error);
            res.json({ 
                loggedIn: true, 
                user: req.session.user,
                isAdmin: false,
                subscription: null
            });
        }
    } else {
        res.json({ loggedIn: false });
    }
});

// Admin: bekijk alle geregistreerde gebruikers (inclusief subscription status)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await userStore.getAllUsers();
        const safeUsers = await Promise.all(users.map(async (user) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            subscription: await userStore.getSubscriptionStatus(user.id)
        })));
        res.json({
            total: safeUsers.length,
            users: safeUsers
        });
    } catch (error) {
        console.error('Error getting admin users:', error);
        res.status(500).json({ error: 'Kon gebruikers niet ophalen' });
    }
});

// Admin: verwijder gebruiker
app.delete('/api/admin/users/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const deleted = await userStore.deleteUser(userId);
        
        if (deleted) {
            res.json({ success: true, message: 'Gebruiker verwijderd' });
        } else {
            res.status(404).json({ error: 'Gebruiker niet gevonden' });
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Kon gebruiker niet verwijderen' });
    }
});

// Admin: maak nieuwe gebruiker aan (zonder Google OAuth)
app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { email, name } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is verplicht' });
        }
        
        // Check of email al bestaat
        const existingUser = await userStore.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Er bestaat al een gebruiker met dit emailadres' });
        }
        
        // Genereer een unieke ID
        const userId = 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Maak gebruiker aan
        const user = await userStore.saveUser({
            id: userId,
            email: email,
            name: name || email.split('@')[0],
            manuallyCreated: true
        });
        
        // Start trial
        await userStore.startTrial(userId);
        
        console.log(`👤 Nieuwe gebruiker aangemaakt door admin: ${email}`);
        res.json({ success: true, message: 'Gebruiker aangemaakt', user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Kon gebruiker niet aanmaken' });
    }
});

// Admin: update gebruiker
app.put('/api/admin/users/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { email, name } = req.body;
        
        const user = await userStore.getUser(userId);
        if (!user) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden' });
        }
        
        // Check of nieuwe email al bestaat bij andere gebruiker
        if (email && email !== user.email) {
            const existingUser = await userStore.getUserByEmail(email);
            if (existingUser && existingUser.id !== userId) {
                return res.status(400).json({ error: 'Er bestaat al een gebruiker met dit emailadres' });
            }
        }
        
        // Update gebruiker
        const updatedUser = await userStore.saveUser({
            ...user,
            email: email || user.email,
            name: name || user.name
        });
        
        console.log(`✏️ Gebruiker bijgewerkt: ${updatedUser.email}`);
        res.json({ success: true, message: 'Gebruiker bijgewerkt', user: { id: updatedUser.id, email: updatedUser.email, name: updatedUser.name } });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Kon gebruiker niet bijwerken' });
    }
});

// Admin: haal enkele gebruiker op
app.get('/api/admin/users/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await userStore.getUser(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden' });
        }
        
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            manuallyCreated: user.manually_created || false,
            subscription: await userStore.getSubscriptionStatus(user.id)
        });
    } catch (error) {
        console.error('Error getting user:', error);
        res.status(500).json({ error: 'Kon gebruiker niet ophalen' });
    }
});

// Admin: verleng proefperiode
app.post('/api/admin/users/:userId/extend-trial', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await userStore.getUser(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden' });
        }
        
        // Verleng trial met 14 dagen
        const currentEnd = user.trial_ends_at 
            ? new Date(user.trial_ends_at) 
            : new Date();
        
        const newEndDate = new Date(currentEnd);
        newEndDate.setDate(newEndDate.getDate() + 14);
        
        await userStore.updateSubscription(userId, {
            status: 'trialing',
            trialEndsAt: newEndDate
        });
        
        console.log(`📅 Trial verlengd voor ${user.email} tot ${newEndDate.toLocaleDateString('nl-NL')}`);
        res.json({ success: true, message: 'Proefperiode verlengd met 14 dagen' });
    } catch (error) {
        console.error('Error extending trial:', error);
        res.status(500).json({ error: 'Kon trial niet verlengen' });
    }
});

// Admin: zet gebruiker op een plan (zonder Stripe)
app.post('/api/admin/users/:userId/set-plan', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { plan } = req.body; // 'active', 'trialing', 'none'
        
        const user = await userStore.getUser(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden' });
        }
        
        if (plan === 'active') {
            // Zet op actief abonnement (1 jaar)
            const endDate = new Date();
            endDate.setFullYear(endDate.getFullYear() + 1);
            
            await userStore.updateSubscription(userId, {
                status: 'active',
                plan: 'pro',
                manualActivation: true,
                startDate: new Date().toISOString(),
                currentPeriodEnd: endDate.toISOString()
            });
            
            console.log(`✅ ${user.email} handmatig geactiveerd tot ${endDate.toLocaleDateString('nl-NL')}`);
            res.json({ success: true, message: 'Gebruiker geactiveerd voor 1 jaar' });
            
        } else if (plan === 'trialing') {
            // Start nieuwe proefperiode (14 dagen)
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 14);
            
            await userStore.updateSubscription(userId, {
                status: 'trialing',
                trialStart: new Date().toISOString(),
                trialEndsAt: trialEnd.toISOString()
            });
            
            console.log(`🕐 Trial gestart voor ${user.email} tot ${trialEnd.toLocaleDateString('nl-NL')}`);
            res.json({ success: true, message: 'Proefperiode van 14 dagen gestart' });
            
        } else if (plan === 'none') {
            // Verwijder abonnement
            await userStore.updateSubscription(userId, {
                status: 'canceled',
                canceledAt: new Date().toISOString()
            });
            
            console.log(`❌ Abonnement geannuleerd voor ${user.email}`);
            res.json({ success: true, message: 'Abonnement geannuleerd' });
            
        } else {
            res.status(400).json({ error: 'Ongeldig plan. Kies: active, trialing, of none' });
        }
    } catch (error) {
        console.error('Error setting plan:', error);
        res.status(500).json({ error: 'Kon plan niet wijzigen' });
    }
});

// Health check endpoint voor Railway
app.get('/health', async (req, res) => {
    try {
        // Check database connectivity
        const { dbGet } = require('./utils/database');
        const userCount = await dbGet('SELECT COUNT(*) as count FROM users');
        const appointmentCount = await dbGet('SELECT COUNT(*) as count FROM appointments');
        const companyCount = await dbGet('SELECT COUNT(*) as count FROM company_settings');
        
        res.status(200).json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            database: {
                users: userCount?.count || 0,
                appointments: appointmentCount?.count || 0,
                companySettings: companyCount?.count || 0
            }
        });
    } catch (err) {
        res.status(200).json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            dbError: err.message
        });
    }
});

// Hoofdpagina
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
console.log('🚀 Server wordt gestart...');

const server = app.listen(PORT, () => {
    console.log(`🎹 PianoPlanner draait op http://localhost:${PORT}`);
    
    // Start background sync service
    const { startBackgroundSync } = require('./utils/backgroundSync');
    startBackgroundSync();
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('⚠️ SIGTERM ontvangen, server wordt afgesloten...');
    server.close(() => {
        console.log('✅ Server netjes afgesloten');
        process.exit(0);
    });
    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
        console.log('⚠️ Force exit na timeout');
        process.exit(0);
    }, 10000);
});

process.on('SIGINT', () => {
    console.log('⚠️ SIGINT ontvangen, server wordt afgesloten...');
    server.close(() => {
        console.log('✅ Server netjes afgesloten');
        process.exit(0);
    });
});

// Uncaught exception handling
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    console.error(err.stack);
    // Keep running, don't crash
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Keep running, don't crash
});

