/**
 * Error Log System
 * Captures and stores application errors for debugging
 */

const { getDb, dbRun, dbGet, dbAll } = require('./database');

// Error categories
const ERROR_CATEGORIES = {
    API: 'api',
    SYNC: 'sync',
    EMAIL: 'email',
    DATABASE: 'database',
    AUTH: 'auth',
    VALIDATION: 'validation',
    EXTERNAL: 'external',
    UNKNOWN: 'unknown'
};

/**
 * Initialize error log table
 */
const initErrorLog = async () => {
    try {
        // Create table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS error_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                category TEXT NOT NULL,
                message TEXT NOT NULL,
                stack_trace TEXT,
                user_id TEXT,
                request_path TEXT,
                request_method TEXT,
                request_body TEXT,
                ip_address TEXT,
                user_agent TEXT,
                metadata TEXT,
                resolved INTEGER DEFAULT 0,
                resolved_at TEXT,
                resolved_by TEXT,
                notes TEXT
            )
        `);
        
        // Create indexes (each separately)
        await dbRun(`CREATE INDEX IF NOT EXISTS idx_error_timestamp ON error_log(timestamp)`);
        await dbRun(`CREATE INDEX IF NOT EXISTS idx_error_category ON error_log(category)`);
        await dbRun(`CREATE INDEX IF NOT EXISTS idx_error_resolved ON error_log(resolved)`);
        await dbRun(`CREATE INDEX IF NOT EXISTS idx_error_user_id ON error_log(user_id)`);
        
        console.log('✅ Error log table initialized');
    } catch (error) {
        console.error('⚠️ Error log init error:', error.message);
    }
};

/**
 * Log an error
 */
const logError = async ({
    category = ERROR_CATEGORIES.UNKNOWN,
    message,
    stackTrace = null,
    userId = null,
    requestPath = null,
    requestMethod = null,
    requestBody = null,
    ipAddress = null,
    userAgent = null,
    metadata = null
}) => {
    try {
        const result = await dbRun(`
            INSERT INTO error_log (
                category, message, stack_trace, user_id, 
                request_path, request_method, request_body,
                ip_address, user_agent, metadata, timestamp
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
            category,
            message,
            stackTrace,
            userId,
            requestPath,
            requestMethod,
            requestBody ? JSON.stringify(requestBody) : null,
            ipAddress,
            userAgent,
            metadata ? JSON.stringify(metadata) : null
        ]);
        
        return result.lastID;
    } catch (error) {
        console.error('Failed to write error log:', error);
        return null;
    }
};

/**
 * Get errors with filtering and pagination
 */
const getErrors = async ({
    category = null,
    resolved = null,
    userId = null,
    startDate = null,
    endDate = null,
    limit = 100,
    offset = 0,
    search = null
} = {}) => {
    let query = `SELECT * FROM error_log WHERE 1=1`;
    const params = [];
    
    if (category) {
        query += ` AND category = ?`;
        params.push(category);
    }
    
    if (resolved !== null) {
        query += ` AND resolved = ?`;
        params.push(resolved ? 1 : 0);
    }
    
    if (userId) {
        query += ` AND user_id = ?`;
        params.push(userId);
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
        query += ` AND (message LIKE ? OR request_path LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const errors = await dbAll(query, params);
    
    return errors.map(err => ({
        ...err,
        metadata: err.metadata ? JSON.parse(err.metadata) : null,
        requestBody: err.request_body ? JSON.parse(err.request_body) : null
    }));
};

/**
 * Get error count
 */
const getErrorCount = async ({
    category = null,
    resolved = null,
    startDate = null,
    endDate = null
} = {}) => {
    let query = `SELECT COUNT(*) as count FROM error_log WHERE 1=1`;
    const params = [];
    
    if (category) {
        query += ` AND category = ?`;
        params.push(category);
    }
    
    if (resolved !== null) {
        query += ` AND resolved = ?`;
        params.push(resolved ? 1 : 0);
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
 * Mark error as resolved
 */
const resolveError = async (errorId, resolvedBy, notes = null) => {
    await dbRun(`
        UPDATE error_log 
        SET resolved = 1, resolved_at = datetime('now'), resolved_by = ?, notes = ?
        WHERE id = ?
    `, [resolvedBy, notes, errorId]);
};

/**
 * Get error statistics
 */
const getErrorStats = async (days = 7) => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // Errors per day
    const perDay = await dbAll(`
        SELECT 
            DATE(timestamp) as date,
            COUNT(*) as count
        FROM error_log 
        WHERE timestamp >= ?
        GROUP BY DATE(timestamp)
        ORDER BY date
    `, [cutoff]);
    
    // Errors per category
    const perCategory = await dbAll(`
        SELECT 
            category,
            COUNT(*) as count
        FROM error_log 
        WHERE timestamp >= ?
        GROUP BY category
        ORDER BY count DESC
    `, [cutoff]);
    
    // Unresolved count
    const unresolved = await dbGet(`
        SELECT COUNT(*) as count FROM error_log WHERE resolved = 0
    `);
    
    return {
        perDay,
        perCategory,
        unresolvedCount: unresolved.count
    };
};

/**
 * Get most common errors
 */
const getCommonErrors = async (limit = 10, days = 7) => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    return await dbAll(`
        SELECT 
            message,
            category,
            COUNT(*) as count,
            MAX(timestamp) as last_occurrence
        FROM error_log 
        WHERE timestamp >= ?
        GROUP BY message, category
        ORDER BY count DESC
        LIMIT ?
    `, [cutoff, limit]);
};

/**
 * Clean up old resolved errors
 */
const cleanupOldErrors = async (daysToKeep = 30) => {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    
    const result = await dbRun(`
        DELETE FROM error_log WHERE timestamp < ? AND resolved = 1
    `, [cutoff]);
    
    console.log(`🧹 Cleaned up ${result.changes || 0} old resolved errors`);
    return result.changes || 0;
};

/**
 * Express error handler middleware
 */
const errorHandler = (err, req, res, next) => {
    // Log the error
    logError({
        category: ERROR_CATEGORIES.API,
        message: err.message || 'Unknown error',
        stackTrace: err.stack,
        userId: req.session?.userId || req.user?.id,
        requestPath: req.path,
        requestMethod: req.method,
        requestBody: req.body,
        ipAddress: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent']
    });
    
    // Send response
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = {
    ERROR_CATEGORIES,
    initErrorLog,
    logError,
    getErrors,
    getErrorCount,
    resolveError,
    getErrorStats,
    getCommonErrors,
    cleanupOldErrors,
    errorHandler
};
