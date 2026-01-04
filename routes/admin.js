const express = require('express');
const router = express.Router();
const userStore = require('../utils/userStore');

// Admin credentials (uit environment)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'PianoAdmin2026!';

// Admin sessie check middleware
const requireAdminAuth = (req, res, next) => {
    if (!req.session.isAdmin) {
        return res.status(401).json({ error: 'Admin authenticatie vereist' });
    }
    next();
};

// Admin login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        req.session.adminUsername = username;
        console.log(`🔐 Admin ingelogd: ${username}`);
        return res.json({ success: true });
    }
    
    console.log(`⚠️ Mislukte admin login poging: ${username}`);
    return res.status(401).json({ error: 'Ongeldige inloggegevens' });
});

// Admin logout
router.post('/logout', (req, res) => {
    req.session.isAdmin = false;
    req.session.adminUsername = null;
    res.json({ success: true });
});

// Check admin status
router.get('/status', (req, res) => {
    res.json({ 
        isAdmin: !!req.session.isAdmin,
        username: req.session.adminUsername || null
    });
});

// ==================== GEBRUIKERSBEHEER ====================

// Haal alle gebruikers op
router.get('/users', requireAdminAuth, (req, res) => {
    const users = userStore.getAllUsers();
    
    // Filter gevoelige data
    const safeUsers = Object.values(users).map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        authType: user.authType,
        approvalStatus: user.approvalStatus || 'approved', // bestaande users zijn goedgekeurd
        subscription: user.subscription,
        createdAt: user.createdAt,
        approvedAt: user.approvedAt,
        approvedBy: user.approvedBy,
        rejectedAt: user.rejectedAt,
        rejectedBy: user.rejectedBy,
        rejectionReason: user.rejectionReason
    }));
    
    res.json(safeUsers);
});

// Haal wachtende gebruikers op
router.get('/users/pending', requireAdminAuth, (req, res) => {
    const pendingUsers = userStore.getPendingUsers();
    
    const safeUsers = pendingUsers.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        authType: user.authType,
        createdAt: user.createdAt
    }));
    
    res.json(safeUsers);
});

// Keur gebruiker goed
router.post('/users/:userId/approve', requireAdminAuth, (req, res) => {
    const { userId } = req.params;
    const { startTrial } = req.body;
    
    const result = userStore.approveUser(userId, req.session.adminUsername);
    
    if (result.error) {
        return res.status(400).json({ error: result.error });
    }
    
    // Start automatisch een trial als gewenst
    if (startTrial !== false) {
        userStore.startTrial(userId);
    }
    
    res.json({ success: true, message: 'Gebruiker goedgekeurd', user: result.user });
});

// Wijs gebruiker af
router.post('/users/:userId/reject', requireAdminAuth, (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const result = userStore.rejectUser(userId, req.session.adminUsername, reason);
    
    if (result.error) {
        return res.status(400).json({ error: result.error });
    }
    
    res.json({ success: true, message: 'Gebruiker afgewezen', user: result.user });
});

// Verwijder gebruiker
router.delete('/users/:userId', requireAdminAuth, (req, res) => {
    const { userId } = req.params;
    
    const success = userStore.deleteUser(userId);
    
    if (!success) {
        return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    }
    
    console.log(`🗑️ Gebruiker verwijderd: ${userId}`);
    res.json({ success: true, message: 'Gebruiker verwijderd' });
});

// Update gebruiker plan
router.post('/users/:userId/set-plan', requireAdminAuth, (req, res) => {
    const { userId } = req.params;
    const { plan } = req.body;
    
    if (!plan) {
        return res.status(400).json({ error: 'Plan is verplicht' });
    }
    
    const result = userStore.setUserPlan(userId, plan);
    
    if (result.error) {
        return res.status(400).json({ error: result.error });
    }
    
    res.json({ success: true, message: `Plan ingesteld op ${plan}`, user: result.user });
});

module.exports = router;
