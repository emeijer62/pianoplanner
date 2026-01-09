/**
 * Audit Log System
 * Tracks all important actions in the system for security and debugging
 */

const { getDb, dbRun, dbGet, dbAll } = require('./database');

// Action types
const ACTION_TYPES = {
    // Auth
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILED: 'login_failed',
    LOGOUT: 'logout',
    PASSWORD_CHANGE: 'password_change',
    PASSWORD_RESET: 'password_reset',
    REGISTER: 'register',
    
    // User management
    USER_APPROVED: 'user_approved',
    USER_REJECTED: 'user_rejected',
    USER_DELETED: 'user_deleted',
    USER_UPDATED: 'user_updated',
    PLAN_CHANGED: 'plan_changed',
    TRIAL_EXTENDED: 'trial_extended',
    
    // Admin actions
    ADMIN_IMPERSONATE: 'admin_impersonate',
    ADMIN_ACTION: 'admin_action',
    
    // Data actions
    APPOINTMENT_CREATED: 'appointment_created',
    APPOINTMENT_UPDATED: 'appointment_updated',
    APPOINTMENT_DELETED: 'appointment_deleted',
    CUSTOMER_CREATED: 'customer_created',
    CUSTOMER_UPDATED: 'customer_updated',
    CUSTOMER_DELETED: 'customer_deleted',
    
    // Sync
    CALENDAR_SYNC: 'calendar_sync',
    CALENDAR_SYNC_ERROR: 'calendar_sync_error',
    
    // Email
    EMAIL_SENT: 'email_sent',
    EMAIL_FAILED: 'email_failed',
    
    // System
    SETTINGS_CHANGED: 'settings_changed',
    ERROR: 'error',
    API_ERROR: 'api_error'
};

// Severity levels
const SEVERITY = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
};

/**
 * Initialize audit log table
 */
const initAuditLog = async () => {
    try {
        // Create table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                action TEXT NOT NULL,
                severity TEXT DEFAULT 'info',
                user_id TEXT,
                target_user_id TEXT,
                ip_address TEXT,
                user_agent TEXT,
                details TEXT,
                metadata TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        `);
        
        // Create indexes for faster queries (each separately)
        await dbRun(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)`);
        await dbRun(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)`);
        await dbRun(`CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_log(user_id)`);
        await dbRun(`CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_log(severity)`);
        
        console.log('✅ Audit log table initialized');
    } catch (error) {
        console.error('⚠️ Audit log init error:', error.message);
    }
};

/**
 * Log an action
 */
const log = async ({
    action,
    severity = SEVERITY.INFO,
    userId = null,
    targetUserId = null,
    ipAddress = null,
    userAgent = null,
    details = null,
    metadata = null
}) => {
    try {
        await dbRun(`
            INSERT INTO audit_log (action, severity, user_id, target_user_id, ip_address, user_agent, details, metadata, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
            action,
            severity,
            userId,
            targetUserId,
            ipAddress,
            userAgent,
            details,
            metadata ? JSON.stringify(metadata) : null
        ]);
    } catch (error) {
        console.error('Failed to write audit log:', error);
    }
};

/**
 * Get audit logs with filtering and pagination
 */
const getLogs = async ({
    action = null,
    severity = null,
    userId = null,
    startDate = null,
    endDate = null,
    limit = 100,
    offset = 0,
    search = null
} = {}) => {
    let query = `SELECT * FROM audit_log WHERE 1=1`;
    const params = [];
    
    if (action) {
        query += ` AND action = ?`;
        params.push(action);
    }
    
    if (severity) {
        query += ` AND severity = ?`;
        params.push(severity);
    }
    
    if (userId) {
        query += ` AND (user_id = ? OR target_user_id = ?)`;
        params.push(userId, userId);
    }
    
    if (startDate) {
        query += ` AND timestamp >= ?`;
        params.push(startDate);
    }
    
    if (endDate) {
        query += ` AND timestamp <= ?`;
        params.push(endDate);
    }
    
    if (search) {
        query += ` AND (details LIKE ? OR ip_address LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const logs = await dbAll(query, params);
    
    // Parse metadata JSON
    return logs.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
    }));
};

/**
 * Get log count for pagination
 */
const getLogCount = async ({
    action = null,
    severity = null,
    userId = null,
    startDate = null,
    endDate = null
} = {}) => {
    let query = `SELECT COUNT(*) as count FROM audit_log WHERE 1=1`;
    const params = [];
    
    if (action) {
        query += ` AND action = ?`;
        params.push(action);
    }
    
    if (severity) {
        query += ` AND severity = ?`;
        params.push(severity);
    }
    
    if (userId) {
        query += ` AND (user_id = ? OR target_user_id = ?)`;
        params.push(userId, userId);
    }
    
    if (startDate) {
        query += ` AND timestamp >= ?`;
        params.push(startDate);
    }
    
    if (endDate) {
        query += ` AND timestamp <= ?`;
        params.push(endDate);
    }
    
    const result = await dbGet(query, params);
    return result.count;
};

/**
 * Get recent failed login attempts for an IP or email
 */
const getFailedLogins = async (identifier, minutes = 30) => {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    
    const count = await dbGet(`
        SELECT COUNT(*) as count FROM audit_log 
        WHERE action = ? 
        AND timestamp >= ?
        AND (ip_address = ? OR details LIKE ?)
    `, [ACTION_TYPES.LOGIN_FAILED, cutoff, identifier, `%${identifier}%`]);
    
    return count.count;
};

/**
 * Get login statistics
 */
const getLoginStats = async (days = 7) => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stats = await dbAll(`
        SELECT 
            DATE(timestamp) as date,
            action,
            COUNT(*) as count
        FROM audit_log 
        WHERE action IN (?, ?)
        AND timestamp >= ?
        GROUP BY DATE(timestamp), action
        ORDER BY date
    `, [ACTION_TYPES.LOGIN_SUCCESS, ACTION_TYPES.LOGIN_FAILED, cutoff]);
    
    return stats;
};

/**
 * Get user activity summary
 */
const getUserActivity = async (userId, days = 30) => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const activity = await dbAll(`
        SELECT 
            action,
            COUNT(*) as count,
            MAX(timestamp) as last_occurrence
        FROM audit_log 
        WHERE user_id = ?
        AND timestamp >= ?
        GROUP BY action
        ORDER BY count DESC
    `, [userId, cutoff]);
    
    return activity;
};

/**
 * Get security alerts (failed logins, suspicious activity)
 */
const getSecurityAlerts = async (limit = 50) => {
    return await dbAll(`
        SELECT * FROM audit_log 
        WHERE action IN (?, ?)
        OR severity IN (?, ?)
        ORDER BY timestamp DESC
        LIMIT ?
    `, [
        ACTION_TYPES.LOGIN_FAILED, 
        ACTION_TYPES.API_ERROR,
        SEVERITY.ERROR,
        SEVERITY.CRITICAL,
        limit
    ]);
};

/**
 * Clean up old audit logs (retention policy)
 */
const cleanupOldLogs = async (daysToKeep = 90) => {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    
    const result = await dbRun(`
        DELETE FROM audit_log WHERE timestamp < ? AND severity NOT IN (?, ?)
    `, [cutoff, SEVERITY.ERROR, SEVERITY.CRITICAL]);
    
    console.log(`🧹 Cleaned up ${result.changes || 0} old audit logs`);
    return result.changes || 0;
};

// Helper function to extract request info
const getRequestInfo = (req) => ({
    ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent']
});

module.exports = {
    ACTION_TYPES,
    SEVERITY,
    initAuditLog,
    log,
    getLogs,
    getLogCount,
    getFailedLogins,
    getLoginStats,
    getUserActivity,
    getSecurityAlerts,
    cleanupOldLogs,
    getRequestInfo
};
