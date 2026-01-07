# 🎹 PianoPlanner

Een professionele planning applicatie voor pianotechnici met Google Calendar en Apple Calendar integratie.

## Features

- ✅ Google OAuth login
- ✅ Google Calendar sync (two-way)
- ✅ Apple Calendar/iCloud sync (CalDAV)
- ✅ Email notifications (Google Workspace SMTP)
- ✅ Customer & piano management
- ✅ Public booking page
- ✅ Service configuration
- ✅ Travel time calculation
- ✅ SQLite database for all data

## Installatie

```bash
# Installeer dependencies
npm install

# Kopieer environment bestand
cp .env.example .env

# Vul je credentials in .env
```

## Environment Variables

### Required
- `SESSION_SECRET` - Random secret for sessions
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

### Optional - Email (Google Workspace)
- `SMTP_USER` - Google Workspace email (info@yourcompany.com)
- `SMTP_PASS` - App-specific password (generate at myaccount.google.com/apppasswords)
- `SMTP_HOST` - SMTP server (default: smtp.gmail.com)
- `SMTP_PORT` - SMTP port (default: 587)

### Optional - Stripe
- `STRIPE_SECRET_KEY` - Stripe API secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret

## Google OAuth Setup

1. Ga naar [Google Cloud Console](https://console.cloud.google.com/)
2. Maak een nieuw project of selecteer bestaand project
3. Ga naar **APIs & Services** > **Credentials**
4. Klik op **Create Credentials** > **OAuth client ID**
5. Kies **Web application**
6. Voeg toe bij Authorized redirect URIs: `http://localhost:3000/auth/google/callback`
7. Kopieer Client ID en Client Secret naar je `.env` bestand
8. Ga naar **APIs & Services** > **Library**
9. Zoek en activeer **Google Calendar API**

## Starten

```bash
# Development mode (met auto-reload)
npm run dev

# Of productie mode
npm start
```

Open http://localhost:3000 in je browser.

## Structuur

```
Planner/
├── server.js           # Express server
├── routes/
│   ├── auth.js         # Google OAuth routes
│   └── calendar.js     # Calendar API routes
├── utils/
│   └── userStore.js    # Lokale JSON gebruikersopslag
├── public/
│   ├── index.html      # Login pagina
│   ├── dashboard.html  # Dashboard
│   ├── styles.css      # Styling
│   ├── app.js          # Login JavaScript
│   └── dashboard.js    # Dashboard JavaScript
└── data/               # Gebruikersdata (git ignored)
```

## Technologie

- **Backend**: Node.js, Express
- **Authentication**: Google OAuth 2.0
- **API**: Google Calendar API
- **Opslag**: Lokale JSON bestanden (geen database)
- **Frontend**: Vanilla HTML/CSS/JavaScript
