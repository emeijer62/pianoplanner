/**
 * Stripe Webhook Handler
 * Verwerkt betalingsgebeurtenissen van Stripe
 */

const express = require('express');
const router = express.Router();
const userStore = require('../utils/userStoreDB');

// Stripe configuratie - alleen initialiseren als API key aanwezig is
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Webhook endpoint - krijgt raw body
router.post('/', async (req, res) => {
    if (!stripe || !endpointSecret) {
        console.log('Stripe webhook ontvangen maar niet geconfigureerd');
        return res.status(503).json({ error: 'Webhooks niet geconfigureerd' });
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verificatie mislukt:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('Stripe webhook ontvangen:', event.type);

    // Verwerk verschillende event types
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            await handleCheckoutComplete(session);
            break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
            const subscription = event.data.object;
            await handleSubscriptionUpdate(subscription);
            break;
        }

        case 'customer.subscription.deleted': {
            const subscription = event.data.object;
            await handleSubscriptionCanceled(subscription);
            break;
        }

        case 'invoice.paid': {
            const invoice = event.data.object;
            await handleInvoicePaid(invoice);
            break;
        }

        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            await handlePaymentFailed(invoice);
            break;
        }

        default:
            console.log(`Onverwerkt event type: ${event.type}`);
    }

    res.json({ received: true });
});

// Checkout voltooid
async function handleCheckoutComplete(session) {
    console.log('Checkout voltooid voor customer:', session.customer);
    
    // Subscription wordt apart verwerkt via subscription.created event
    // Hier kunnen we extra acties doen zoals email sturen
}

// Subscription aangemaakt of bijgewerkt
async function handleSubscriptionUpdate(subscription) {
    const customerId = subscription.customer;
    const user = await userStore.getUserByStripeCustomerId(customerId);
    
    if (!user) {
        console.error('Geen gebruiker gevonden voor Stripe customer:', customerId);
        return;
    }

    console.log('Subscription update voor gebruiker:', user.id, 'Status:', subscription.status);

    // Map Stripe status naar onze status
    let status;
    switch (subscription.status) {
        case 'active':
        case 'trialing':
            status = 'active';
            break;
        case 'past_due':
            status = 'past_due';
            break;
        case 'canceled':
        case 'unpaid':
            status = 'canceled';
            break;
        default:
            status = subscription.status;
    }

    // Update subscription in database
    await userStore.updateSubscription(user.id, {
        status: status,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end
    });

    console.log('Subscription bijgewerkt voor gebruiker:', user.id);
}

// Subscription geannuleerd
async function handleSubscriptionCanceled(subscription) {
    const customerId = subscription.customer;
    const user = await userStore.getUserByStripeCustomerId(customerId);
    
    if (!user) {
        console.error('Geen gebruiker gevonden voor Stripe customer:', customerId);
        return;
    }

    console.log('Subscription geannuleerd voor gebruiker:', user.id);

    await userStore.updateSubscription(user.id, {
        status: 'canceled',
        canceledAt: new Date()
    });
}

// Factuur betaald
async function handleInvoicePaid(invoice) {
    if (!invoice.subscription) return;

    const customerId = invoice.customer;
    const user = await userStore.getUserByStripeCustomerId(customerId);
    
    if (!user) {
        console.error('Geen gebruiker gevonden voor Stripe customer:', customerId);
        return;
    }

    console.log('Betaling ontvangen van gebruiker:', user.id, 'Bedrag:', invoice.amount_paid / 100, 'EUR');
}

// Betaling mislukt
async function handlePaymentFailed(invoice) {
    const customerId = invoice.customer;
    const user = await userStore.getUserByStripeCustomerId(customerId);
    
    if (!user) {
        console.error('Geen gebruiker gevonden voor Stripe customer:', customerId);
        return;
    }

    console.log('Betaling mislukt voor gebruiker:', user.id);

    // Gebruiker krijgt automatisch email van Stripe
    // Hier kunnen we extra notificaties toevoegen indien nodig
}

module.exports = router;
