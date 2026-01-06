# PianoPlanner - Changelog 6 januari 2026

## 🎉 Overzicht van de sessie

Vandaag is er flink gewerkt aan PianoPlanner. De belangrijkste verbeteringen zijn de **smart booking suggesties**, de **edit appointment functionaliteit** en de **nieuwe landingspagina**.

---

## ✅ Nieuwe Features

### 1. Smart Booking Suggesties
**Locatie:** `/api/book/:slug/smart-suggestions`

Klanten kunnen niet meer zelf datum/tijd kiezen. In plaats daarvan:
- Klant kiest service → vult adresgegevens in
- Systeem analyseert bestaande afspraken
- Suggereert optimale tijden op basis van:
  - **Geografische nabijheid** (postcode matching)
  - **Efficiëntie** (slots direct voor/na andere afspraken)
  - **Beschikbaarheid** (werkuren, bestaande boekingen)
- Toont max 5 suggesties met "Efficient" badges

**Nieuwe booking flow:**
1. Service kiezen
2. Adresgegevens invullen (verplicht voor locatie-matching)
3. Slimme suggesties bekijken en kiezen
4. Bevestigen

---

### 2. Edit Appointment Modal
**Locatie:** `dashboard.js`

- Klik op een afspraak in de kalender om te bewerken
- Modal opent met alle velden pre-filled:
  - Klant (met mogelijkheid om te wijzigen)
  - Piano (gefilterd op klant)
  - Service (met auto-duration)
  - Titel, locatie, tijden, notities
- **Delete knop** (rood) om afspraak te verwijderen
- PUT request naar `/api/appointments/:id` voor updates

---

### 3. Click-to-Create op Kalender
**Locatie:** `dashboard.js`, `dashboard.html`

- Klik op een tijdslot in dag- of weekweergave
- Modal opent met datum/tijd automatisch ingevuld
- Hover effect op tijdslots

---

### 4. Nieuwe Landingspagina
**Locatie:** `/public/index.html` (was landing.html)

Compleet nieuwe landingspagina in **pianoinfo.com stijl**:
- **Golden Brown Luxury Theme** (kleuren: #2a1810, #9a6b3d, #ffd700)
- **Playfair Display** font voor headers
- "In Ontwikkeling" badge

**Secties:**
- Hero met CTA knoppen
- 6 Feature cards (Route optimalisatie, Calendar sync, Klantbeheer, etc.)
- "Hoe werkt het" - 3 stappen
- Development status met progress bar (65%)
- Roadmap met completed/in-progress/upcoming items
- Newsletter signup
- Footer met link naar pianoinfo.com

**URL structuur:**
- `/` → Landingspagina
- `/login.html` → Inlogpagina (was index.html)
- `/book/:slug` → Publieke boekingspagina

---

### 5. Apple Calendar Voorbereiding
- Feature card: "Google & Apple Agenda Sync"
- Roadmap item: "⏳ Apple Agenda (iCloud) synchronisatie"

---

## 🐛 Bug Fixes

### Database & Persistence
- **Company settings verdwenen** → Migration toegevoegd: `CHECK (id = 1)` → `user_id UNIQUE`
- **Railway volume** → Gebruiker heeft volume gemount op `/app/data`
- **Health endpoint** → `/health` met database stats

### Autocomplete Issues
- **predictions.map undefined** → Check of response array is of object met predictions property
- **Location autocomplete niet klikbaar** → `click` → `mousedown` + `preventDefault()`
- **Z-index te laag** → Van 1000 naar 10001

### Google Calendar Sync
- **SIGTERM crashes** → Null check voor `event.end?.dateTime`
- **Sync logging** toegevoegd voor debugging

---

## 📁 Gewijzigde Bestanden

### Frontend
| Bestand | Wijziging |
|---------|-----------|
| `public/index.html` | Nieuwe landingspagina (was landing.html) |
| `public/login.html` | Hernoemd van index.html |
| `public/book.html` | Smart suggestions flow |
| `public/dashboard.html` | Delete knop, cache bust |
| `public/dashboard.js` | Edit modal, click handlers, autocomplete fixes |

### Backend
| Bestand | Wijziging |
|---------|-----------|
| `routes/publicBooking.js` | Smart suggestions endpoint + helper functies |
| `routes/calendar.js` | Null checks, logging |
| `utils/database.js` | Company settings migration |
| `utils/companyStore.js` | INSERT fix |
| `server.js` | Health endpoint |
| `railway.toml` | Healthcheck path |

---

## 🗺️ Roadmap Status

| Feature | Status |
|---------|--------|
| Google Agenda sync | ✅ Klaar |
| Klanten- en pianobeheer | ✅ Klaar |
| Diensten configuratie | ✅ Klaar |
| Online boekingspagina | ✅ Klaar |
| Slimme route suggesties | 🔨 Actief |
| Apple Agenda sync | ⏳ Gepland |
| Herinneringen email/SMS | ⏳ Gepland |
| Facturatie integratie | ⏳ Gepland |
| Mobiele app | ⏳ Gepland |

---

## 🔗 Live URLs

- **Landingspagina:** https://pianoplanner.com
- **App login:** https://pianoplanner.com/login.html
- **Dashboard:** https://pianoplanner.com/dashboard.html
- **Boekingspagina:** https://pianoplanner.com/book/edwardmeijer
- **Health check:** https://pianoplanner.com/health

---

## 📊 Database Status (na sessie)

```json
{
  "status": "ok",
  "database": {
    "users": 1,
    "appointments": 176,
    "companySettings": 1
  }
}
```

---

## 🚀 Volgende Stappen

1. **Apple Calendar integratie** implementeren
2. **Email/SMS herinneringen** voor afspraken
3. **Facturatie** (Mollie/Moneybird integratie)
4. **Mobiele app** of PWA
5. **Echte reistijd** via Google Maps Distance Matrix API

---

*Gemaakt: 6 januari 2026*
