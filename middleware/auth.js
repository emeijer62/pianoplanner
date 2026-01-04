/**
 * Admin middleware - controleert of gebruiker admin rechten heeft
 */

// Check of email in admin lijst staat
const isAdmin = (email) => {
    const adminEmails = process.env.ADMIN_EMAILS || '';
    const admins = adminEmails.split(',').map(e => e.trim().toLowerCase());
    return admins.includes(email?.toLowerCase());
};

// Middleware: vereist admin rechten
const requireAdmin = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }
    
    // Check voor admin sessie (via admin login) OF via email lijst
    if (req.session.isAdmin || req.session.user.isAdminUser || isAdmin(req.session.user.email)) {
        return next();
    }
    
    return res.status(403).json({ error: 'Geen admin rechten' });
};

// Middleware: vereist ingelogd
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }
    next();
};

module.exports = {
    isAdmin,
    requireAdmin,
    requireAuth
};
