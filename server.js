require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');
const customerRoutes = require('./routes/customers');
const serviceRoutes = require('./routes/services');
const bookingRoutes = require('./routes/booking');
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

// Session configuratie
const isProduction = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1); // Trust Railway's proxy

app.use(session({
    secret: process.env.SESSION_SECRET || 'pianoplanner-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: isProduction, // HTTPS in productie
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 uur
    }
}));

// Routes
app.use('/auth', authRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/pianos', pianoRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/admin', adminRoutes);

// API route om ingelogde gebruiker te checken
app.get('/api/user', (req, res) => {
    if (req.session.user) {
        // Check admin status via sessie of email
        const isAdminUser = req.session.isAdmin || req.session.user.isAdminUser || isAdmin(req.session.user.email);
        
        // Subscription alleen voor normale gebruikers
        let subscriptionStatus = null;
        if (!req.session.user.isAdminUser) {
            subscriptionStatus = userStore.getSubscriptionStatus(req.session.user.id);
        }
        
        res.json({ 
            loggedIn: true, 
            user: req.session.user,
            isAdmin: isAdminUser,
            subscription: subscriptionStatus
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Admin: bekijk alle geregistreerde gebruikers (inclusief subscription status)
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = userStore.getAllUsers();
    const safeUsers = Object.values(users).map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        subscription: userStore.getSubscriptionStatus(user.id)
    }));
    res.json({
        total: safeUsers.length,
        users: safeUsers
    });
});

// Admin: verwijder gebruiker
app.delete('/api/admin/users/:userId', requireAdmin, (req, res) => {
    const { userId } = req.params;
    const deleted = userStore.deleteUser(userId);
    
    if (deleted) {
        res.json({ success: true, message: 'Gebruiker verwijderd' });
    } else {
        res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }
});

// Admin: maak nieuwe gebruiker aan (zonder Google OAuth)
app.post('/api/admin/users', requireAdmin, (req, res) => {
    const { email, name } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is verplicht' });
    }
    
    // Check of email al bestaat
    const existingUser = userStore.getUserByEmail(email);
    if (existingUser) {
        return res.status(400).json({ error: 'Er bestaat al een gebruiker met dit emailadres' });
    }
    
    // Genereer een unieke ID
    const userId = 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Maak gebruiker aan
    const user = userStore.saveUser({
        id: userId,
        email: email,
        name: name || email.split('@')[0],
        manuallyCreated: true
    });
    
    // Start trial
    userStore.startTrial(userId);
    
    console.log(`👤 Nieuwe gebruiker aangemaakt door admin: ${email}`);
    res.json({ success: true, message: 'Gebruiker aangemaakt', user: { id: user.id, email: user.email, name: user.name } });
});

// Admin: update gebruiker
app.put('/api/admin/users/:userId', requireAdmin, (req, res) => {
    const { userId } = req.params;
    const { email, name } = req.body;
    
    const user = userStore.getUser(userId);
    if (!user) {
        return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }
    
    // Check of nieuwe email al bestaat bij andere gebruiker
    if (email && email !== user.email) {
        const existingUser = userStore.getUserByEmail(email);
        if (existingUser && existingUser.id !== userId) {
            return res.status(400).json({ error: 'Er bestaat al een gebruiker met dit emailadres' });
        }
    }
    
    // Update gebruiker
    const updatedUser = userStore.saveUser({
        ...user,
        email: email || user.email,
        name: name || user.name
    });
    
    console.log(`✏️ Gebruiker bijgewerkt: ${updatedUser.email}`);
    res.json({ success: true, message: 'Gebruiker bijgewerkt', user: { id: updatedUser.id, email: updatedUser.email, name: updatedUser.name } });
});

// Admin: haal enkele gebruiker op
app.get('/api/admin/users/:userId', requireAdmin, (req, res) => {
    const { userId } = req.params;
    const user = userStore.getUser(userId);
    
    if (!user) {
        return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }
    
    res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        manuallyCreated: user.manuallyCreated || false,
        subscription: userStore.getSubscriptionStatus(user.id)
    });
});

// Admin: verleng proefperiode
app.post('/api/admin/users/:userId/extend-trial', requireAdmin, (req, res) => {
    const { userId } = req.params;
    const user = userStore.getUser(userId);
    
    if (!user) {
        return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }
    
    // Verleng trial met 14 dagen
    const currentEnd = user.subscription?.trialEndsAt 
        ? new Date(user.subscription.trialEndsAt) 
        : new Date();
    
    const newEndDate = new Date(currentEnd);
    newEndDate.setDate(newEndDate.getDate() + 14);
    
    userStore.updateSubscription(userId, {
        status: 'trialing',
        trialEndsAt: newEndDate
    });
    
    console.log(`📅 Trial verlengd voor ${user.email} tot ${newEndDate.toLocaleDateString('nl-NL')}`);
    res.json({ success: true, message: 'Proefperiode verlengd met 14 dagen' });
});

// Admin: zet gebruiker op een plan (zonder Stripe)
app.post('/api/admin/users/:userId/set-plan', requireAdmin, (req, res) => {
    const { userId } = req.params;
    const { plan } = req.body; // 'active', 'trialing', 'none'
    
    const user = userStore.getUser(userId);
    
    if (!user) {
        return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }
    
    if (plan === 'active') {
        // Zet op actief abonnement (1 jaar)
        const endDate = new Date();
        endDate.setFullYear(endDate.getFullYear() + 1);
        
        userStore.updateSubscription(userId, {
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
        
        userStore.updateSubscription(userId, {
            status: 'trialing',
            trialStart: new Date().toISOString(),
            trialEndsAt: trialEnd.toISOString()
        });
        
        console.log(`🕐 Trial gestart voor ${user.email} tot ${trialEnd.toLocaleDateString('nl-NL')}`);
        res.json({ success: true, message: 'Proefperiode van 14 dagen gestart' });
        
    } else if (plan === 'none') {
        // Verwijder abonnement
        userStore.updateSubscription(userId, {
            status: 'canceled',
            canceledAt: new Date().toISOString()
        });
        
        console.log(`❌ Abonnement geannuleerd voor ${user.email}`);
        res.json({ success: true, message: 'Abonnement geannuleerd' });
        
    } else {
        res.status(400).json({ error: 'Ongeldig plan. Kies: active, trialing, of none' });
    }
});

// Hoofdpagina
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🎹 PianoPlanner draait op http://localhost:${PORT}`);
});
