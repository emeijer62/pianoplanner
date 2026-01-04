/**
 * Subscription Middleware
 * Controleert of gebruiker actief abonnement of trial heeft
 */

const userStore = require('../utils/userStore');

// Check of gebruiker toegang heeft (trial of betaald abonnement)
function requireSubscription(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    const status = userStore.getSubscriptionStatus(req.session.user.id);

    if (!status.hasAccess) {
        return res.status(403).json({ 
            error: 'Geen actief abonnement',
            subscriptionStatus: status.status,
            redirectTo: '/billing.html'
        });
    }

    // Voeg subscription info toe aan request
    req.subscription = status;
    next();
}

// Check of gebruiker actief BETAALD abonnement heeft (geen trial)
function requirePaidSubscription(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    const status = userStore.getSubscriptionStatus(req.session.user.id);

    if (status.status !== 'active') {
        return res.status(403).json({ 
            error: 'Betaald abonnement vereist',
            subscriptionStatus: status.status,
            redirectTo: '/billing.html'
        });
    }

    req.subscription = status;
    next();
}

// Soft check - voegt subscription info toe maar blokkeert niet
function addSubscriptionInfo(req, res, next) {
    if (req.session.user) {
        req.subscription = userStore.getSubscriptionStatus(req.session.user.id);
    }
    next();
}

module.exports = {
    requireSubscription,
    requirePaidSubscription,
    addSubscriptionInfo
};
