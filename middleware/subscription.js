/**
 * Subscription Middleware
 * Controleert of gebruiker actief abonnement of trial heeft
 * en of ze toegang hebben tot specifieke tier features
 */

const userStore = require('../utils/userStore');

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
                tier: status.tier,
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

// Check of gebruiker actief BETAALD abonnement heeft (geen trial) = Go tier
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
                tier: status.tier,
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

// Check of gebruiker Go tier heeft (voor premium features)
async function requireGoTier(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    try {
        const status = await userStore.getSubscriptionStatus(req.session.user.id);

        if (status.tier !== 'go') {
            return res.status(403).json({ 
                error: 'Go abonnement vereist voor deze functie',
                feature: 'premium',
                currentTier: status.tier,
                requiredTier: 'go',
                upgradeUrl: '/pricing.html'
            });
        }

        req.subscription = status;
        next();
    } catch (error) {
        console.error('Error checking tier:', error);
        return res.status(500).json({ error: 'Kon abonnement niet controleren' });
    }
}

// Check specifieke feature (calendar sync, email reminders, etc.)
function requireTierFeature(feature) {
    return async (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Niet ingelogd' });
        }

        try {
            const hasFeature = await userStore.checkTierFeature(req.session.user.id, feature);

            if (!hasFeature) {
                return res.status(403).json({ 
                    error: `${feature} is alleen beschikbaar met Go abonnement`,
                    feature,
                    requiredTier: 'go',
                    upgradeUrl: '/pricing.html'
                });
            }

            next();
        } catch (error) {
            console.error(`Error checking feature ${feature}:`, error);
            return res.status(500).json({ error: 'Kon feature niet controleren' });
        }
    };
}

// Check customer limit voor Free tier
async function checkCustomerLimit(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    try {
        const limitCheck = await userStore.checkCustomerLimit(req.session.user.id);

        if (!limitCheck.allowed) {
            return res.status(403).json({ 
                error: 'Klantenlimiet bereikt',
                message: `Je hebt ${limitCheck.current} van ${limitCheck.limit} klanten. Upgrade naar Go voor onbeperkte klanten.`,
                current: limitCheck.current,
                limit: limitCheck.limit,
                tier: limitCheck.tier,
                upgradeUrl: '/pricing.html'
            });
        }

        req.customerLimit = limitCheck;
        next();
    } catch (error) {
        console.error('Error checking customer limit:', error);
        return res.status(500).json({ error: 'Kon limiet niet controleren' });
    }
}

// Check appointment limit voor Free tier
async function checkAppointmentLimit(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }

    try {
        const limitCheck = await userStore.checkAppointmentLimit(req.session.user.id);

        if (!limitCheck.allowed) {
            return res.status(403).json({ 
                error: 'Afsprakenlimiet bereikt',
                message: `Je hebt ${limitCheck.current} van ${limitCheck.limit} afspraken dit jaar. Upgrade naar Go voor onbeperkte afspraken.`,
                current: limitCheck.current,
                limit: limitCheck.limit,
                tier: limitCheck.tier,
                upgradeUrl: '/pricing.html'
            });
        }

        req.appointmentLimit = limitCheck;
        next();
    } catch (error) {
        console.error('Error checking appointment limit:', error);
        return res.status(500).json({ error: 'Kon limiet niet controleren' });
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
    requireGoTier,
    requireTierFeature,
    checkCustomerLimit,
    checkAppointmentLimit,
    addSubscriptionInfo
};
