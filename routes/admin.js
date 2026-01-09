const express = require('express');
const router = express.Router();
const userStore = require('../utils/userStore');
const auditLog = require('../utils/auditLog');
const errorLog = require('../utils/errorLog');
const { getDb, dbAll, dbGet, dbRun } = require('../utils/database');

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
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const reqInfo = auditLog.getRequestInfo(req);
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        req.session.adminUsername = username;
        
        // Log successful admin login
        await auditLog.log({
            action: auditLog.ACTION_TYPES.LOGIN_SUCCESS,
            details: `Admin login: ${username}`,
            ipAddress: reqInfo.ipAddress,
            userAgent: reqInfo.userAgent,
            metadata: { isAdmin: true }
        });
        
        console.log(`🔐 Admin ingelogd: ${username}`);
        return res.json({ success: true });
    }
    
    // Log failed admin login
    await auditLog.log({
        action: auditLog.ACTION_TYPES.LOGIN_FAILED,
        severity: auditLog.SEVERITY.WARNING,
        details: `Failed admin login attempt: ${username}`,
        ipAddress: reqInfo.ipAddress,
        userAgent: reqInfo.userAgent
    });
    
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
        const reqInfo = auditLog.getRequestInfo(req);
        
        const result = await userStore.approveUser(userId, req.session.adminUsername);
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        // Start automatisch een trial als gewenst
        if (startTrial !== false) {
            await userStore.startTrial(userId);
        }
        
        // Log the approval
        await auditLog.log({
            action: auditLog.ACTION_TYPES.USER_APPROVED,
            severity: auditLog.SEVERITY.INFO,
            userId: req.session.adminUsername,
            targetUserId: userId,
            details: `User approved: ${result.user?.email}`,
            ipAddress: reqInfo.ipAddress
        });
        
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
        const reqInfo = auditLog.getRequestInfo(req);
        
        const result = await userStore.rejectUser(userId, req.session.adminUsername, reason);
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        // Log the rejection
        await auditLog.log({
            action: auditLog.ACTION_TYPES.USER_REJECTED,
            severity: auditLog.SEVERITY.WARNING,
            userId: req.session.adminUsername,
            targetUserId: userId,
            details: `User rejected: ${result.user?.email}. Reason: ${reason || 'No reason provided'}`,
            ipAddress: reqInfo.ipAddress
        });
        
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
        const reqInfo = auditLog.getRequestInfo(req);
        
        // Get user info before deletion for logging
        const user = await userStore.getUser(userId);
        
        const success = await userStore.deleteUser(userId);
        
        if (!success) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden' });
        }
        
        // Log the deletion
        await auditLog.log({
            action: auditLog.ACTION_TYPES.USER_DELETED,
            severity: auditLog.SEVERITY.WARNING,
            userId: req.session.adminUsername,
            targetUserId: userId,
            details: `User deleted: ${user?.email || userId}`,
            ipAddress: reqInfo.ipAddress
        });
        
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
        const reqInfo = auditLog.getRequestInfo(req);
        
        if (!plan) {
            return res.status(400).json({ error: 'Plan is verplicht' });
        }
        
        const result = await userStore.setUserPlan(userId, plan);
        
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        
        // Log the plan change
        await auditLog.log({
            action: auditLog.ACTION_TYPES.PLAN_CHANGED,
            severity: auditLog.SEVERITY.INFO,
            userId: req.session.adminUsername,
            targetUserId: userId,
            details: `Plan changed to: ${plan}`,
            ipAddress: reqInfo.ipAddress
        });
        
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

// Test email endpoint (admin auth vereist)
router.post('/test-email', requireAdminAuth, async (req, res) => {
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

// ==================== DASHBOARD OVERVIEW ====================

// Get dashboard stats
router.get('/dashboard/stats', requireAdminAuth, async (req, res) => {
    try {
        const users = await userStore.getAllUsers();
        
        // Calculate user stats
        let active = 0, trial = 0, expired = 0, pending = 0;
        
        for (const user of users) {
            if (user.approval_status === 'pending') {
                pending++;
                continue;
            }
            const sub = await userStore.getSubscriptionStatus(user.id);
            if (sub?.status === 'active') active++;
            else if (sub?.status === 'trialing') trial++;
            else if (sub?.status === 'trial_expired' || sub?.status === 'canceled') expired++;
        }
        
        // Get recent signups (last 7 days)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const recentSignups = await dbGet(`
            SELECT COUNT(*) as count FROM users WHERE created_at >= ?
        `, [weekAgo]);
        
        // Get error stats
        const errorStats = await errorLog.getErrorStats(7);
        
        // Get login stats
        const loginStats = await auditLog.getLoginStats(7);
        
        // Database size
        const dbStats = await dbGet(`
            SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()
        `);
        
        // Total appointments (across all users)
        const appointmentCount = await dbGet(`SELECT COUNT(*) as count FROM appointments`);
        const customerCount = await dbGet(`SELECT COUNT(*) as count FROM customers`);
        
        res.json({
            users: {
                total: users.length,
                active,
                trial,
                expired,
                pending
            },
            recentSignups: recentSignups?.count || 0,
            errors: {
                total: errorStats.unresolvedCount,
                perCategory: errorStats.perCategory
            },
            loginStats,
            database: {
                sizeBytes: dbStats?.size || 0,
                sizeMB: ((dbStats?.size || 0) / 1024 / 1024).toFixed(2)
            },
            content: {
                appointments: appointmentCount?.count || 0,
                customers: customerCount?.count || 0
            }
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Could not load dashboard stats' });
    }
});

// Get signup trend
router.get('/dashboard/signup-trend', requireAdminAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        
        const trend = await dbAll(`
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM users
            WHERE created_at >= ?
            GROUP BY DATE(created_at)
            ORDER BY date
        `, [cutoff]);
        
        res.json(trend);
    } catch (error) {
        res.status(500).json({ error: 'Could not load signup trend' });
    }
});

// ==================== AUDIT LOG ====================

// Get audit logs
router.get('/audit-logs', requireAdminAuth, async (req, res) => {
    try {
        const { action, severity, userId, startDate, endDate, limit, offset, search } = req.query;
        
        const logs = await auditLog.getLogs({
            action,
            severity,
            userId,
            startDate,
            endDate,
            limit: parseInt(limit) || 100,
            offset: parseInt(offset) || 0,
            search
        });
        
        const total = await auditLog.getLogCount({ action, severity, userId, startDate, endDate });
        
        res.json({ logs, total });
    } catch (error) {
        console.error('Audit log error:', error);
        res.status(500).json({ error: 'Could not load audit logs' });
    }
});

// Get security alerts
router.get('/security-alerts', requireAdminAuth, async (req, res) => {
    try {
        const alerts = await auditLog.getSecurityAlerts(50);
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: 'Could not load security alerts' });
    }
});

// ==================== ERROR LOG ====================

// Get error logs
router.get('/error-logs', requireAdminAuth, async (req, res) => {
    try {
        const { category, resolved, userId, startDate, endDate, limit, offset, search } = req.query;
        
        const errors = await errorLog.getErrors({
            category,
            resolved: resolved === 'true' ? true : resolved === 'false' ? false : null,
            userId,
            startDate,
            endDate,
            limit: parseInt(limit) || 100,
            offset: parseInt(offset) || 0,
            search
        });
        
        const total = await errorLog.getErrorCount({ category, resolved: resolved === 'true' ? true : resolved === 'false' ? false : null });
        
        res.json({ errors, total });
    } catch (error) {
        console.error('Error log error:', error);
        res.status(500).json({ error: 'Could not load error logs' });
    }
});

// Get error stats
router.get('/error-stats', requireAdminAuth, async (req, res) => {
    try {
        const stats = await errorLog.getErrorStats(7);
        const common = await errorLog.getCommonErrors(10, 7);
        res.json({ ...stats, commonErrors: common });
    } catch (error) {
        res.status(500).json({ error: 'Could not load error stats' });
    }
});

// Resolve error
router.post('/error-logs/:id/resolve', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        
        await errorLog.resolveError(id, req.session.adminUsername, notes);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Could not resolve error' });
    }
});

// ==================== USER DETAIL ====================

// Get detailed user info
router.get('/users/:userId/detail', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await userStore.getUser(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get subscription
        const subscription = await userStore.getSubscriptionStatus(userId);
        
        // Get user's appointments count
        const appointments = await dbGet(`
            SELECT COUNT(*) as count FROM appointments WHERE user_id = ?
        `, [userId]);
        
        // Get user's customers count
        const customers = await dbGet(`
            SELECT COUNT(*) as count FROM customers WHERE user_id = ?
        `, [userId]);
        
        // Get user's activity from audit log
        const activity = await auditLog.getUserActivity(userId, 30);
        
        // Get recent logins
        const recentLogins = await auditLog.getLogs({
            userId,
            action: auditLog.ACTION_TYPES.LOGIN_SUCCESS,
            limit: 10
        });
        
        // Get user errors
        const userErrors = await errorLog.getErrors({
            userId,
            limit: 10
        });
        
        // Get company settings
        const companyStore = require('../utils/companyStore');
        const company = await companyStore.getCompanySettings(userId);
        
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                authType: user.authType,
                approvalStatus: user.approvalStatus,
                createdAt: user.createdAt,
                timezone: user.timezone
            },
            subscription,
            stats: {
                appointments: appointments?.count || 0,
                customers: customers?.count || 0
            },
            company: company ? {
                name: company.name,
                phone: company.phone,
                city: company.city
            } : null,
            activity,
            recentLogins,
            recentErrors: userErrors
        });
    } catch (error) {
        console.error('User detail error:', error);
        res.status(500).json({ error: 'Could not load user details' });
    }
});

// ==================== IMPERSONATE ====================

// Impersonate user (login as user)
router.post('/users/:userId/impersonate', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const reqInfo = auditLog.getRequestInfo(req);
        
        const user = await userStore.getUser(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Log the impersonation
        await auditLog.log({
            action: auditLog.ACTION_TYPES.ADMIN_IMPERSONATE,
            severity: auditLog.SEVERITY.WARNING,
            userId: req.session.adminUsername,
            targetUserId: userId,
            details: `Admin impersonating user: ${user.email}`,
            ipAddress: reqInfo.ipAddress,
            userAgent: reqInfo.userAgent
        });
        
        // Store admin session info for "return to admin" feature
        req.session.originalAdmin = {
            isAdmin: true,
            adminUsername: req.session.adminUsername
        };
        
        // Set user session
        req.session.userId = userId;
        req.session.isAdmin = false; // Temporarily remove admin status
        req.session.isImpersonating = true;
        
        console.log(`👤 Admin ${req.session.originalAdmin.adminUsername} impersonating user: ${user.email}`);
        
        res.json({ 
            success: true, 
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Impersonate error:', error);
        res.status(500).json({ error: 'Could not impersonate user' });
    }
});

// Stop impersonation and return to admin
router.post('/stop-impersonate', async (req, res) => {
    try {
        if (!req.session.isImpersonating || !req.session.originalAdmin) {
            return res.status(400).json({ error: 'Not impersonating' });
        }
        
        // Restore admin session
        req.session.isAdmin = req.session.originalAdmin.isAdmin;
        req.session.adminUsername = req.session.originalAdmin.adminUsername;
        req.session.userId = null;
        req.session.isImpersonating = false;
        req.session.originalAdmin = null;
        
        console.log(`🔙 Admin ${req.session.adminUsername} stopped impersonating`);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Could not stop impersonation' });
    }
});

// ==================== ANNOUNCEMENTS ====================

// Get announcements
router.get('/announcements', requireAdminAuth, async (req, res) => {
    try {
        const announcements = await dbAll(`
            SELECT * FROM announcements 
            ORDER BY created_at DESC
        `);
        res.json(announcements || []);
    } catch (error) {
        // Table might not exist yet
        res.json([]);
    }
});

// Create announcement
router.post('/announcements', requireAdminAuth, async (req, res) => {
    try {
        const { title, message, type, expiresAt, showBanner } = req.body;
        
        // Ensure table exists
        await dbRun(`
            CREATE TABLE IF NOT EXISTS announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT DEFAULT 'info',
                expires_at TEXT,
                show_banner INTEGER DEFAULT 1,
                active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                created_by TEXT
            )
        `);
        
        const result = await dbRun(`
            INSERT INTO announcements (title, message, type, expires_at, show_banner, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [title, message, type || 'info', expiresAt, showBanner ? 1 : 0, req.session.adminUsername]);
        
        await auditLog.log({
            action: auditLog.ACTION_TYPES.ADMIN_ACTION,
            details: `Created announcement: ${title}`,
            metadata: { announcementId: result.lastID }
        });
        
        res.json({ success: true, id: result.lastID });
    } catch (error) {
        console.error('Create announcement error:', error);
        res.status(500).json({ error: 'Could not create announcement' });
    }
});

// Delete announcement
router.delete('/announcements/:id', requireAdminAuth, async (req, res) => {
    try {
        await dbRun(`DELETE FROM announcements WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Could not delete announcement' });
    }
});

// Get active announcements (public, for users)
router.get('/announcements/active', async (req, res) => {
    try {
        const announcements = await dbAll(`
            SELECT id, title, message, type, show_banner 
            FROM announcements 
            WHERE active = 1 
            AND (expires_at IS NULL OR expires_at > datetime('now'))
            ORDER BY created_at DESC
        `);
        res.json(announcements || []);
    } catch (error) {
        res.json([]);
    }
});

// ==================== SYSTEM HEALTH ====================

// Get system health
router.get('/system/health', requireAdminAuth, async (req, res) => {
    try {
        // Memory usage
        const memUsage = process.memoryUsage();
        
        // Uptime
        const uptime = process.uptime();
        
        // Database stats
        const dbStats = await dbGet(`
            SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()
        `);
        
        // Table counts
        const tables = await dbAll(`
            SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `);
        
        const tableCounts = {};
        for (const table of tables) {
            const count = await dbGet(`SELECT COUNT(*) as count FROM ${table.name}`);
            tableCounts[table.name] = count?.count || 0;
        }
        
        // Recent errors
        const recentErrors = await errorLog.getErrorCount({
            startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        });
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: {
                seconds: uptime,
                formatted: formatUptime(uptime)
            },
            memory: {
                heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
                heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
                rss: (memUsage.rss / 1024 / 1024).toFixed(2) + ' MB'
            },
            database: {
                sizeMB: ((dbStats?.size || 0) / 1024 / 1024).toFixed(2),
                tables: tableCounts
            },
            errors24h: recentErrors,
            nodeVersion: process.version,
            platform: process.platform
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// Helper function to format uptime
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
    
    return parts.join(' ') || '< 1m';
}

// ==================== BULK ACTIONS ====================

// Bulk delete users
router.post('/users/bulk-delete', requireAdminAuth, async (req, res) => {
    try {
        const { userIds } = req.body;
        
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'No users specified' });
        }
        
        let deleted = 0;
        for (const userId of userIds) {
            try {
                await userStore.deleteUser(userId);
                deleted++;
            } catch (e) {
                console.error(`Failed to delete user ${userId}:`, e);
            }
        }
        
        await auditLog.log({
            action: auditLog.ACTION_TYPES.ADMIN_ACTION,
            details: `Bulk deleted ${deleted} users`,
            metadata: { userIds }
        });
        
        res.json({ success: true, deleted });
    } catch (error) {
        res.status(500).json({ error: 'Bulk delete failed' });
    }
});

// Bulk set plan
router.post('/users/bulk-set-plan', requireAdminAuth, async (req, res) => {
    try {
        const { userIds, plan } = req.body;
        
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'No users specified' });
        }
        
        let updated = 0;
        for (const userId of userIds) {
            try {
                if (plan === 'active') {
                    await userStore.setManualSubscription(userId, 'active', 365);
                } else if (plan === 'trialing') {
                    await userStore.setManualSubscription(userId, 'trialing', 14);
                } else if (plan === 'none') {
                    await userStore.cancelSubscription(userId);
                }
                updated++;
            } catch (e) {
                console.error(`Failed to set plan for user ${userId}:`, e);
            }
        }
        
        await auditLog.log({
            action: auditLog.ACTION_TYPES.ADMIN_ACTION,
            details: `Bulk set plan '${plan}' for ${updated} users`,
            metadata: { userIds, plan }
        });
        
        res.json({ success: true, updated });
    } catch (error) {
        res.status(500).json({ error: 'Bulk set plan failed' });
    }
});

// Send notification to users
router.post('/users/send-notification', requireAdminAuth, async (req, res) => {
    try {
        const { userIds, subject, message } = req.body;
        
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'No users specified' });
        }
        
        let sent = 0;
        const errors = [];
        
        for (const userId of userIds) {
            try {
                const user = await userStore.getUser(userId);
                if (user && user.email) {
                    await emailService.sendEmail({
                        to: user.email,
                        subject: subject,
                        html: `
                            <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                                <h2 style="color: #1d1d1f;">${subject}</h2>
                                <div style="color: #1d1d1f; line-height: 1.6;">
                                    ${message.replace(/\n/g, '<br>')}
                                </div>
                                <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">
                                <p style="color: #86868b; font-size: 12px;">
                                    Dit bericht is verstuurd door PianoPlanner
                                </p>
                            </div>
                        `,
                        text: message
                    });
                    sent++;
                }
            } catch (e) {
                errors.push({ userId, error: e.message });
            }
        }
        
        await auditLog.log({
            action: auditLog.ACTION_TYPES.ADMIN_ACTION,
            details: `Sent notification to ${sent} users: ${subject}`,
            metadata: { userIds, subject }
        });
        
        res.json({ success: true, sent, errors });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send notifications' });
    }
});

module.exports = router;
