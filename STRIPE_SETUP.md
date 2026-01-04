# Stripe Configuratie voor PianoPlanner

## Abonnement Details
- **Prijs**: €30/maand excl. BTW (€36,30 incl. BTW)
- **Trial periode**: 14 dagen gratis
- **Betaalmethodes**: Creditcard, iDEAL, Bancontact

## Stripe Account Setup

### 1. Maak een Stripe account
Ga naar [stripe.com](https://stripe.com) en maak een account aan.

### 2. Verkrijg API Keys
In het Stripe Dashboard:
1. Ga naar **Developers** → **API keys**
2. Kopieer de **Secret key** (begint met `sk_`)

### 3. Configureer Webhooks
1. Ga naar **Developers** → **Webhooks**
2. Klik op **Add endpoint**
3. Endpoint URL: `https://jouw-domein.com/webhook/stripe`
4. Selecteer deze events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Kopieer de **Signing secret** (begint met `whsec_`)

### 4. Configureer BTW (Tax)
1. Ga naar **Settings** → **Tax**
2. Activeer **Stripe Tax**
3. Stel je bedrijfslocatie in
4. Configureer automatische BTW-berekening

### 5. Customer Portal
1. Ga naar **Settings** → **Billing** → **Customer portal**
2. Activeer de portal
3. Configureer welke acties klanten kunnen uitvoeren:
   - Abonnement opzeggen
   - Betaalmethode wijzigen
   - Facturen bekijken

## Environment Variables

Voeg toe aan je `.env` file of Railway environment:

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
BASE_URL=https://pianoplanner.com
```

## Test Mode

Voor development, gebruik test keys (beginnen met `sk_test_`).

Test creditcards:
- **Succesvol**: 4242 4242 4242 4242
- **Afgewezen**: 4000 0000 0000 0002
- **3D Secure**: 4000 0025 0000 3155

## Lokaal Testen

1. Installeer Stripe CLI:
   ```bash
   brew install stripe/stripe-cli/stripe
   ```

2. Login:
   ```bash
   stripe login
   ```

3. Forward webhooks:
   ```bash
   stripe listen --forward-to localhost:3000/webhook/stripe
   ```

4. Kopieer de webhook secret die getoond wordt en gebruik die voor `STRIPE_WEBHOOK_SECRET`.

## API Endpoints

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/api/stripe/subscription-status` | GET | Huidige subscription status |
| `/api/stripe/create-checkout-session` | POST | Start betaalproces |
| `/api/stripe/create-portal-session` | POST | Open klantportaal |
| `/api/stripe/prices` | GET | Prijsinformatie |
| `/webhook/stripe` | POST | Stripe webhooks |

## Flow

1. **Nieuwe gebruiker** → Login met Google → Automatisch 14 dagen trial
2. **Trial afgelopen** → Redirect naar `/billing.html`
3. **Klik op "Abonnement starten"** → Stripe Checkout
4. **Betaling succesvol** → Webhook activeert abonnement
5. **Abonnement beheren** → Stripe Customer Portal
