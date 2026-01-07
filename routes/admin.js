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
router.get('/users', requireAdminAuth, async (req, res) => {
    try {
        const users = await userStore.getAllUsers();
        
        // Filter gevoelige data en voeg subscription status toe
        const safeUsers = await Promise.all(users.map(async (user) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            authType: user.auth_type,
            approvalStatus: user.approval_status || 'approved',
            subscription: await userStore.getSubscriptionStatus(user.id),
            createdAt: user.created_at,
            approvedAt: user.approved_at,
            approvedBy: user.approved_by,
            rejectedAt: user.rejected_at,
            rejectedBy: user.rejected_by,
            rejectionReason: user.rejection_reason
        })));
        
        res.json(safeUsers);
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ error: 'Kon gebruikers niet ophalen' });
    }
});

// Haal wachtende gebruikers op
router.get('/users/pending', requireAdminAuth, async (req, res) => {
    try {
        const pendingUsers = await userStore.getPendingUsers();
        
        const safeUsers = pendingUsers.map(user => ({
            id: user.id,
            email: user.email,
            name: user.name,
            authType: user.auth_type,
            createdAt: user.created_at
        }));
        
        res.json(safeUsers);
    } catch (error) {
        console.error('Error getting pending users:', error);
        res.status(500).json({ error: 'Kon wachtende gebruikers niet ophalen' });
    }
});

// Keur gebruiker goed
router.post('/users/:userId/approve', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { startTrial } = req.body;
        
        const result = await userStore.approveUser(userId, req.session.adminUsername);
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        // Start automatisch een trial als gewenst
        if (startTrial !== false) {
            await userStore.startTrial(userId);
        }
        
        res.json({ success: true, message: 'Gebruiker goedgekeurd', user: result.user });
    } catch (error) {
        console.error('Error approving user:', error);
        res.status(500).json({ error: 'Kon gebruiker niet goedkeuren' });
    }
});

// Wijs gebruiker af
router.post('/users/:userId/reject', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;
        
        const result = await userStore.rejectUser(userId, req.session.adminUsername, reason);
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        res.json({ success: true, message: 'Gebruiker afgewezen', user: result.user });
    } catch (error) {
        console.error('Error rejecting user:', error);
        res.status(500).json({ error: 'Kon gebruiker niet afwijzen' });
    }
});

// Verwijder gebruiker
router.delete('/users/:userId', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const success = await userStore.deleteUser(userId);
        
        if (!success) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden' });
        }
        
        console.log(`🗑️ Gebruiker verwijderd: ${userId}`);
        res.json({ success: true, message: 'Gebruiker verwijderd' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Kon gebruiker niet verwijderen' });
    }
});

// Update gebruiker plan
router.post('/users/:userId/set-plan', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { plan } = req.body;
        
        if (!plan) {
            return res.status(400).json({ error: 'Plan is verplicht' });
        }
        
        const result = await userStore.setUserPlan(userId, plan);
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        res.json({ success: true, message: `Plan ingesteld op ${plan}`, user: result.user });
    } catch (error) {
        console.error('Error setting plan:', error);
        res.status(500).json({ error: 'Kon plan niet instellen' });
    }
});

// ==================== CREATE GEBRUIKER ====================

// Maak nieuwe gebruiker aan (door admin)
router.post('/users', requireAdminAuth, async (req, res) => {
    try {
        const { email, name, password, plan, approvalStatus } = req.body;
        
        // Validatie
        if (!email || !password) {
            return res.status(400).json({ error: 'Email en wachtwoord zijn verplicht' });
        }
        
        // Check of email al bestaat
        const existingUser = await userStore.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Een gebruiker met dit email adres bestaat al' });
        }
        
        // Maak gebruiker aan
        const result = await userStore.createUserByAdmin({
            email,
            name: name || email.split('@')[0],
            password,
            approvalStatus: approvalStatus || 'approved',
            plan: plan || 'trial',
            createdBy: req.session.adminUsername
        });
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        console.log(`✅ Gebruiker aangemaakt door admin: ${email}`);
        res.json({ success: true, message: 'Gebruiker aangemaakt', user: result.user });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Kon gebruiker niet aanmaken' });
    }
});

// ==================== UPDATE GEBRUIKER ====================

// Update gebruiker gegevens
router.put('/users/:userId', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { email, name, password } = req.body;
        
        // Check of gebruiker bestaat
        const user = await userStore.getUser(userId);
        if (!user) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden' });
        }
        
        // Check of nieuwe email al bestaat (als die gewijzigd is)
        if (email && email !== user.email) {
            const existingUser = await userStore.getUserByEmail(email);
            if (existingUser) {
                return res.status(400).json({ error: 'Een andere gebruiker met dit email adres bestaat al' });
            }
        }
        
        // Update gebruiker
        const result = await userStore.updateUserByAdmin(userId, {
            email: email || user.email,
            name: name !== undefined ? name : user.name,
            password: password || null // null = niet wijzigen
        });
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        console.log(`✏️ Gebruiker bijgewerkt door admin: ${userId}`);
        res.json({ success: true, message: 'Gebruiker bijgewerkt', user: result.user });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Kon gebruiker niet bijwerken' });
    }
});

// Haal specifieke gebruiker op
router.get('/users/:userId', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await userStore.getUser(userId);
        if (!user) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden' });
        }
        
        // Filter gevoelige data
        const safeUser = {
            id: user.id,
            email: user.email,
            name: user.name,
            authType: user.auth_type,
            approvalStatus: user.approval_status || 'approved',
            subscription: await userStore.getSubscriptionStatus(user.id),
            createdAt: user.created_at,
            updatedAt: user.updated_at
        };
        
        res.json(safeUser);
    } catch (error) {
        console.error('Error getting user:', error);
        res.status(500).json({ error: 'Kon gebruiker niet ophalen' });
    }
});

// ==================== DATABASE MAINTENANCE ====================

// Cleanup broken appointments (missing start/end time)
router.post('/cleanup-appointments', requireAdminAuth, async (req, res) => {
    try {
        const { dbRun, dbAll } = require('../utils/database');
        
        // First count broken records
        const broken = await dbAll(
            'SELECT id, title FROM appointments WHERE start_time IS NULL OR end_time IS NULL'
        );
        
        if (broken.length === 0) {
            return res.json({ success: true, message: 'No broken appointments found', deleted: 0 });
        }
        
        // Delete broken records
        const result = await dbRun(
            'DELETE FROM appointments WHERE start_time IS NULL OR end_time IS NULL'
        );
        
        console.log(`🧹 Admin cleanup: ${result.changes} broken appointments deleted`);
        
        res.json({ 
            success: true, 
            message: `Deleted ${result.changes} broken appointments`,
            deleted: result.changes,
            deletedIds: broken.map(b => b.id)
        });
    } catch (error) {
        console.error('Error cleaning appointments:', error);
        res.status(500).json({ error: 'Cleanup failed: ' + error.message });
    }
});

// ==================== EMAIL TEST ====================

const emailService = require('../utils/emailService');

// Test email endpoint (geen auth nodig voor debugging)
router.post('/test-email', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email adres is verplicht' });
    }
    
    // Check of email geconfigureerd is
    if (!emailService.isEmailConfigured()) {
        return res.status(500).json({ 
            error: 'Email niet geconfigureerd',
            details: 'SMTP_USER en SMTP_PASS environment variables ontbreken op Railway'
        });
    }
    
    try {
        const result = await emailService.sendEmail({
            to: email,
            subject: '🎹 PianoPlanner - Test Email',
            html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #1d1d1f;">✅ Email Werkt!</h1>
                    <p>Dit is een test email van PianoPlanner.</p>
                    <p>Als je deze email ontvangt, is de SMTP configuratie correct.</p>
                    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;">
                    <p style="color: #86868b; font-size: 12px;">
                        Verstuurd op: ${new Date().toLocaleString('nl-NL')}<br>
                        Server: ${process.env.SMTP_HOST || 'smtp.transip.email'}
                    </p>
                </div>
            `,
            text: 'Dit is een test email van PianoPlanner. Als je deze ontvangt, werkt de email configuratie.'
        });
        
        if (result.success) {
            console.log(`📧 Test email verstuurd naar: ${email}`);
            res.json({ success: true, messageId: result.messageId });
        } else {
            res.status(500).json({ error: result.reason || 'Onbekende fout' });
        }
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ 
            error: 'Email versturen mislukt',
            details: error.message
        });
    }
});

module.exports = router;
