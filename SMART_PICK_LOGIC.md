# Smart Pick Logica - Referentie Document

> Laatst bijgewerkt: 11 januari 2026

## Test Scenario: Lynn's Piano in Berkel-Enschot

### Situatie
- **Klant:** Lynn (woont in Eindhoven)
- **Piano:** Yamaha C3 staat in **Berkel-Enschot** (niet waar Lynn woont!)
- **Datum:** 23 januari 2026

### Agenda die dag
| Tijd | Locatie | Afspraak |
|------|---------|----------|
| Ochtend | Tilburg | Eerste afspraak |
| 11:00-12:00 | Eindhoven | Tweede afspraak |
| 13:00 | Berkel-Enschot | **Nieuwe afspraak (Smart Pick)** |

### Correcte reistijd berekening
- **Origin:** Eindhoven (waar de 11:00 afspraak eindigt om 12:00)
- **Destination:** Berkel-Enschot (waar de piano staat, NIET Eindhoven waar Lynn woont)
- **Reistijd:** ~25-30 minuten (Eindhoven → Berkel-Enschot)

### Foute logica (voor de fix)
- Origin: Bedrijfsadres Tilburg (fout!)
- Destination: Eindhoven (klant-adres, fout!)
- Reistijd: 16 min (Tilburg → Eindhoven, compleet verkeerd!)

---

## Smart Pick Algoritme

### 1. Destination bepalen (waar moet je NAARTOE)

**Prioriteit volgorde:**
1. `piano.location` - Piano kan ergens anders staan dan waar klant woont!
2. `customer.address` - Fallback als piano geen locatie heeft
3. `companyAddress` - Laatste fallback

```
Code locatie: routes/booking.js regel ~595-625
```

### 2. Origin bepalen (waar kom je VANDAAN)

**Stap 1: Vind vorige afspraak**
- Haal alle events op van die dag (DB + Google + Apple + Microsoft)
- Filter: alleen events die EINDIGEN vóór het gezochte tijdstip
- Sorteer op eindtijd, pak de laatste

**Stap 2: Extract adres uit vorige afspraak**

Prioriteit volgorde:
1. `event.location` - Direct uit location veld
2. `customer.address` - Via customer_id gekoppeld aan afspraak
3. AI-extractie uit `description` (notities)
4. AI-extractie uit `title`
5. `companyAddress` - Fallback

```
Code locatie: routes/booking.js regel ~635-730
```

### 3. AI Adres Extractie

De `extractAddressFromText()` functie herkent:
- Nederlands adres: "Straatnaam 123, Stad"
- Postcode: "5611 AB Eindhoven"
- Keywords: `locatie:`, `adres:`, `bij:`, `in:`, `te:`, `plaats:`

```
Code locatie: routes/booking.js regel ~15-65
```

---

## Response structuur

```json
{
  "available": true,
  "slots": [...],
  "travelInfo": {
    "duration": 25,
    "distance": "...",
    "origin": "Eindhoven",
    "destination": "Berkel-Enschot"
  },
  "smartOrigin": {
    "address": "Eindhoven",
    "isFromPreviousAppointment": true,
    "previousAppointment": {
      "title": "Stemmen bij klant X",
      "endTime": "2026-01-23T12:00:00"
    }
  }
}
```

---

## Externe Calendar Integratie

Smart Pick checkt alle calendars voor:
1. Conflict detectie (geen dubbele boekingen)
2. Origin detectie (waar was vorige afspraak)

**Ondersteunde calendars:**
- Google Calendar (OAuth)
- Apple Calendar (CalDAV)
- Microsoft Calendar (Graph API)

---

## Gerelateerde commits

- `a4aa0ee` - Fix: Smart Pick uses correct origin and destination
- `4c70d1d` - Feat: AI-smart address detection from notes/description
- `5de5622` - Feat: Smart Pick dynamic origin & theater hours support

---

## Theater Availability

Klanten met `use_theater_availability = true`:
- Beschikbare uren: 09:00 - 23:00 (ipv normale werktijden)
- Werkt ook in weekenden als theater hours enabled in company settings

```
Code locatie: routes/booking.js regel ~605 en ~795-810
```
