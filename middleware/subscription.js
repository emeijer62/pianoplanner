/**
 * Subscription Middleware
 * Controleert of gebruiker actief abonnement of trial heeft
 */

const userStore = require('../utils/userStoreDB');

// Check of gebruiker toegang heeft (trial of betaald abonnement)
async function requireSubscription(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    try {
        const status = await userStore.getSubscriptionStatus(req.session.user.id);

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
    } catch (error) {
        console.error('Error checking subscription:', error);
        return res.status(500).json({ error: 'Kon abonnement niet controleren' });
    }
}

// Check of gebruiker actief BETAALD abonnement heeft (geen trial)
async function requirePaidSubscription(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    try {
        const status = await userStore.getSubscriptionStatus(req.session.user.id);

        if (status.status !== 'active') {
            return res.status(403).json({ 
                error: 'Betaald abonnement vereist',
                subscriptionStatus: status.status,
                redirectTo: '/billing.html'
            });
        }

        req.subscription = status;
        next();
    } catch (error) {
        console.error('Error checking subscription:', error);
        return res.status(500).json({ error: 'Kon abonnement niet controleren' });
    }
}

// Soft check - voegt subscription info toe maar blokkeert niet
async function addSubscriptionInfo(req, res, next) {
    if (req.session.user) {
        try {
            req.subscription = await userStore.getSubscriptionStatus(req.session.user.id);
        } catch (error) {
            console.error('Error getting subscription info:', error);
        }
    }
    next();
}

module.exports = {
    requireSubscription,
    requirePaidSubscription,
    addSubscriptionInfo
};
