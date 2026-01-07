# 🎹 PianoPlanner Roadmap

> Stappenplan om PianoPlanner uit te bouwen tot de beste pianostemmer software voor de NL/BE markt

---

## ✅ Huidige Status (Januari 2026)

### Wat al werkt:
- [x] Google OAuth login
- [x] Google Calendar integratie
- [x] Apple Calendar integratie (CalDAV)
- [x] Klantenbeheer (CRUD)
- [x] Route optimalisatie (Google Maps Distance Matrix)
- [x] Abonnementssysteem (€30/maand, 14 dagen trial)
- [x] Stripe betalingen voorbereid
- [x] Admin dashboard met gebruikersbeheer
- [x] Handmatig plan toewijzen (zonder Stripe)
- [x] Apple-style landing page (premium design)
- [x] Apple-style login/signup portal met tabs
- [x] Beta signup formulier met admin notificatie
- [x] Email service (nodemailer + Google Workspace SMTP)
- [x] Meertalig (i18n): Engels, Nederlands, Duits, Frans

---

## 🚀 Fase 1: Piano Database & Service Historie (Week 1-2)

### 1.1 Piano Database
- [ ] Piano model aanmaken (merk, model, serienummer, bouwjaar, type)
- [ ] Piano's koppelen aan klanten (1 klant → meerdere piano's)
- [ ] Piano detail pagina
- [ ] Piano's toevoegen/bewerken/verwijderen
- [ ] Piano foto's uploaden

### 1.2 Service Geschiedenis
- [ ] Service log per piano
- [ ] Automatisch loggen na afspraak
- [ ] Notities en observaties
- [ ] Stemhoogte/frequentie vastleggen
- [ ] Aanbevelingen voor volgende beurt

### 1.3 Technische Taken
```
- data/pianos.json opzetten
- routes/pianos.js maken
- public/pianos.html + pianos.js
- Koppeling met customers
```

---

## 📅 Fase 2: Online Booking & Herinneringen (Week 3-4)

### 2.1 Self-Service Booking
- [ ] Publieke booking pagina per technicus
- [ ] Beschikbare tijdslots tonen
- [ ] Klant kiest datum/tijd
- [ ] Automatische bevestigingsmail
- [ ] iCal/Google Calendar sync
- [ ] Unieke booking link: `pianoplanner.com/book/[gebruiker-slug]`

### 2.2 Automatische Herinneringen
- [ ] Herinnering instellen per piano (6 maanden, 12 maanden)
- [ ] Email templates voor herinneringen
- [ ] Cron job voor dagelijkse check
- [ ] "Uw piano is toe aan een stembeurt" email
- [ ] Opt-out mogelijkheid voor klanten

### 2.3 Afspraak Herinneringen
- [ ] 24 uur voor afspraak: herinnering naar klant
- [ ] 1 uur voor afspraak: herinnering naar technicus
- [ ] Annuleren/verzetten link in email

---

## 💳 Fase 3: Facturatie & Betalingen (Week 5-6)

### 3.1 Facturen
- [ ] Factuur aanmaken na afspraak
- [ ] Factuur templates (professioneel design)
- [ ] BTW berekening (21% / 9%)
- [ ] Factuurnummering
- [ ] PDF genereren
- [ ] Email factuur naar klant

### 3.2 Online Betalen
- [ ] iDEAL integratie (Mollie)
- [ ] Creditcard (via Stripe)
- [ ] Betaallink in factuur
- [ ] Automatische betalingsbevestiging
- [ ] Openstaande facturen overzicht

### 3.3 Offertes
- [ ] Offerte aanmaken
- [ ] Offerte → Factuur conversie
- [ ] Offerte acceptatie door klant

---

## 📱 Fase 4: Mobile Experience (Week 7-8)

### 4.1 PWA (Progressive Web App)
- [ ] manifest.json
- [ ] Service worker voor offline
- [ ] Installeerbaar op iOS/Android
- [ ] App icoon

### 4.2 Dag Overzicht
- [ ] Vandaag's afspraken
- [ ] Route navigatie (Google Maps link)
- [ ] Swipe acties (voltooid, factuur, notitie)
- [ ] Snelle klantinfo

### 4.3 Offline Mogelijkheden
- [ ] Klantgegevens cachen
- [ ] Notities offline opslaan
- [ ] Sync wanneer online

---

## 🔗 Fase 5: Integraties (Week 9-10)

### 5.1 Boekhoudkoppelingen (NL Focus)
- [ ] Moneybird API
- [ ] e-Boekhouden
- [ ] Exact Online
- [ ] Automatisch facturen doorsturen

### 5.2 Communicatie
- [x] Email via eigen SMTP (Google Workspace)
- [ ] SMS optioneel (MessageBird/Twilio)
- [ ] WhatsApp Business (later)

### 5.3 Data Import/Export
- [ ] CSV import klanten
- [ ] CSV import piano's
- [ ] Export naar Excel
- [ ] Backup functie

---

## 🎯 Fase 6: Marketing & Growth (Week 11-12)

### 6.1 Website & SEO
- [x] Landing page optimaliseren (Apple-style design)
- [ ] Feature pagina's
- [ ] Pricing pagina
- [ ] Blog met tips voor pianostemmers
- [ ] Testimonials

### 6.2 Onboarding
- [x] Beta signup portal met admin notificatie
- [ ] Welkom email serie
- [ ] In-app tutorial
- [ ] Video uitleg
- [ ] Gratis data import service

### 6.3 Referral Programma
- [ ] "Verwijs een collega" korting
- [ ] Affiliate links

---

## 💰 Pricing Strategie

### Huidige Prijs
- €30/maand (excl. BTW)
- 14 dagen gratis proberen

### Toekomstige Opties
| Plan | Prijs | Kenmerken |
|------|-------|-----------|
| **Starter** | €15/maand | 50 klanten, basis features |
| **Pro** | €30/maand | Onbeperkt, alle features |
| **Team** | €50/maand | Meerdere gebruikers, rapportages |

---

## 🏆 Concurrentievoordelen vs Gazelle

| Feature | Gazelle | PianoPlanner |
|---------|---------|--------------|
| Taal | Engels | 🇳🇱 Nederlands |
| Betalen | Credit card | iDEAL + meer |
| Boekhouding | QuickBooks | Moneybird (NL) |
| Prijs basis | $7/maand (50 piano's) | €15/maand (50 klanten) |
| SMS kosten | Extra | Inclusief (email) |
| Data locatie | USA | 🇪🇺 EU (GDPR) |
| Support | Engels | Nederlands |

---

## 📊 KPI's om te tracken

- [ ] Aantal aanmeldingen per week
- [ ] Trial → Betaald conversie %
- [ ] Churn rate (opzeggingen)
- [ ] Aantal afspraken per gebruiker
- [ ] Factuur volume
- [ ] NPS score

---

## 🛠️ Technische Stack

```
Frontend:  HTML/CSS/JavaScript (vanilla)
Backend:   Node.js + Express
Database:  JSON files (later: PostgreSQL)
Auth:      Google OAuth 2.0
Calendar:  Google Calendar API + Apple Calendar (CalDAV)
Maps:      Google Maps Platform
Payments:  Stripe + Mollie
Email:     nodemailer + Google Workspace SMTP
i18n:      Custom (EN, NL, DE, FR)
Hosting:   Railway
Domain:    pianoplanner.com
```

---

## 📅 Timeline Overzicht

```
Week 1-2:   Piano Database + Service Historie
Week 3-4:   Online Booking + Herinneringen
Week 5-6:   Facturatie + Betalingen
Week 7-8:   Mobile PWA
Week 9-10:  Integraties (Moneybird etc.)
Week 11-12: Marketing + Launch
```

---

## ✏️ Notities

_Voeg hier je eigen notities toe tijdens de ontwikkeling_

---

**Laatst bijgewerkt:** 7 januari 2026
