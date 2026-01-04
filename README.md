# 🎹 PianoPlanner

Een simpele planner voor pianolessen met Google Agenda integratie. Geen database nodig - alles synchroniseert direct met Google Calendar.

## Features

- ✅ Google OAuth login
- ✅ Bekijk events van komende 7 dagen
- ✅ Maak nieuwe events aan
- ✅ Verwijder events
- ✅ Bekijk al je Google agenda's
- ✅ Lokale gebruikersopslag (JSON, geen database)

## Installatie

```bash
# Installeer dependencies
npm install

# Kopieer environment bestand
cp .env.example .env

# Vul je Google OAuth credentials in .env
```

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
