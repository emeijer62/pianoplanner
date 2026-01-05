/**
 * Stripe Routes voor PianoPlanner
 * Abonnementen: €30/maand excl BTW
 */

const express = require('express');
const router = express.Router();
const userStore = require('../utils/userStore');

// Stripe configuratie - alleen initialiseren als API key aanwezig is
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Prijzen configuratie
const PRICES = {
    monthly: {
        amount: 3000, // €30.00 in centen
        currency: 'eur',
        interval: 'month',
        name: 'PianoPlanner Pro',
        description: 'Maandelijks abonnement'
    }
};

// Middleware: check of gebruiker ingelogd is
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Niet ingelogd' });
    }
    next();
};

// Middleware: check of Stripe geconfigureerd is
const requireStripe = (req, res, next) => {
    if (!stripe) {
        return res.status(503).json({ error: 'Betalingen zijn nog niet geconfigureerd' });
    }
    next();
};

// GET /api/stripe/subscription-status
// Haal huidige subscription status op
router.get('/subscription-status', requireAuth, async (req, res) => {
    try {
        const status = await userStore.getSubscriptionStatus(req.session.user.id);
        res.json(status);
    } catch (error) {
        console.error('Error getting subscription status:', error);
        res.status(500).json({ error: 'Kon status niet ophalen' });
    }
});

// POST /api/stripe/create-checkout-session
// Maak Stripe Checkout sessie aan
router.post('/create-checkout-session', requireAuth, requireStripe, async (req, res) => {
    try {
        const user = await userStore.getUser(req.session.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden' });
        }

        // Maak of haal Stripe customer
        let customerId = user.stripe_customer_id;
        
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: {
                    userId: user.id
                }
            });
            customerId = customer.id;
            await userStore.setStripeCustomerId(user.id, customerId);
        }

        // Bepaal success/cancel URLs
        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

        // Maak checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card', 'ideal', 'bancontact'],
            mode: 'subscription',
            line_items: [{
                price_data: {
                    currency: PRICES.monthly.currency,
                    product_data: {
                        name: PRICES.monthly.name,
                        description: PRICES.monthly.description
                    },
                    unit_amount: PRICES.monthly.amount,
                    recurring: {
                        interval: PRICES.monthly.interval
                    }
                },
                quantity: 1
            }],
            success_url: `${baseUrl}/billing.html?success=true`,
            cancel_url: `${baseUrl}/billing.html?canceled=true`,
            subscription_data: {
                metadata: {
                    userId: user.id
                }
            },
            // BTW automatisch toevoegen
            automatic_tax: {
                enabled: true
            },
            tax_id_collection: {
                enabled: true
            },
            // Klantgegevens verzamelen voor BTW
            billing_address_collection: 'required'
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error('Stripe checkout error:', error);
        res.status(500).json({ error: 'Kon checkout niet starten' });
    }
});

// POST /api/stripe/create-portal-session
// Maak Stripe Customer Portal sessie (voor abonnement beheren)
router.post('/create-portal-session', requireAuth, requireStripe, async (req, res) => {
    try {
        const user = await userStore.getUser(req.session.user.id);
        const customerId = user?.stripe_customer_id;
        
        if (!customerId) {
            return res.status(400).json({ error: 'Geen actief abonnement' });
        }

        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${baseUrl}/billing.html`
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error('Portal session error:', error);
        res.status(500).json({ error: 'Kon portal niet openen' });
    }
});

// GET /api/stripe/prices
// Haal prijzen op (voor pricing pagina)
router.get('/prices', (req, res) => {
    res.json({
        monthly: {
            amount: PRICES.monthly.amount / 100,
            currency: PRICES.monthly.currency,
            interval: 'month',
            name: PRICES.monthly.name,
            amountExclVat: 30,
            vatPercentage: 21
        }
    });
});

module.exports = router;
