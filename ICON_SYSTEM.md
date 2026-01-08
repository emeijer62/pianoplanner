# PianoPlanner Icon System

## Overzicht

PianoPlanner gebruikt nu een **gouden metallic icon systeem** gebaseerd op [Lucide Icons](https://lucide.dev/). Alle emoji's worden automatisch vervangen door stijlbare SVG icons met een luxe gouden uitstraling.

## Technische Implementatie

### Bestanden

| Bestand | Beschrijving |
|---------|--------------|
| `public/icons.css` | CSS styling voor gouden icons |
| `public/icons.js` | Automatische emoji→icon vervanging |
| `public/assets/favicon.svg` | Gouden piano favicon |

### CDN Dependencies

```html
<script src="https://unpkg.com/lucide@latest"></script>
```

### Kleurenpalet

```css
--icon-gold: #B8860B;        /* Dark goldenrod - basis */
--icon-gold-light: #DAA520;  /* Goldenrod - highlights */
--icon-gold-dark: #8B6914;   /* Darker gold - shadows */
```

## Emoji → Icon Mapping

| Emoji | Lucide Icon | Categorie |
|-------|-------------|-----------|
| 🎹 | `piano` | Muziek |
| 🎵 | `music` | Muziek |
| 🎼 | `music-2` | Muziek |
| ✅ | `check-circle` | Status |
| ✓ | `check` | Status |
| ❌ | `x-circle` | Status |
| ⚠️ | `alert-triangle` | Status |
| 🔄 | `refresh-cw` | Acties |
| 💾 | `save` | Acties |
| ✏️ | `pencil` | Acties |
| 🗑️ | `trash-2` | Acties |
| 🔍 | `search` | Acties |
| 📅 | `calendar` | Tijd |
| 🕐 | `clock` | Tijd |
| 👤 | `user` | Personen |
| 👥 | `users` | Personen |
| 🏢 | `building-2` | Business |
| 📧 | `mail` | Communicatie |
| 📱 | `smartphone` | Communicatie |
| 📍 | `map-pin` | Locatie |
| 🚗 | `car` | Reizen |
| ⚙️ | `settings` | Systeem |
| 🔐 | `lock` | Beveiliging |
| 💰 | `coins` | Financiën |
| 💳 | `credit-card` | Financiën |

## Gebruik

### Automatisch (Standaard)

Emoji's in HTML worden automatisch vervangen bij page load:

```html
<span>🎹 Piano stemmen</span>
<!-- Wordt automatisch: -->
<span><span class="icon icon-gold" data-lucide="piano"></span> Piano stemmen</span>
```

### Handmatig via JavaScript

```javascript
// Enkel icon
const icon = PianoIcons.createIcon('piano');
document.body.appendChild(icon);

// Met kleur override
const redIcon = PianoIcons.createIcon('alert-triangle', '#dc3545');

// Element verwerken
PianoIcons.processElement(myElement);
```

### CSS Classes

```html
<!-- Basis gouden icon -->
<span class="icon icon-gold" data-lucide="piano"></span>

<!-- Verschillende groottes -->
<span class="icon icon-sm" data-lucide="check"></span>
<span class="icon icon-md" data-lucide="check"></span>
<span class="icon icon-lg" data-lucide="check"></span>
<span class="icon icon-xl" data-lucide="check"></span>

<!-- Interactief (hover effect) -->
<span class="icon icon-interactive" data-lucide="settings"></span>

<!-- Status kleuren -->
<span class="icon icon-success" data-lucide="check-circle"></span>
<span class="icon icon-warning" data-lucide="alert-triangle"></span>
<span class="icon icon-error" data-lucide="x-circle"></span>
```

## Icon Groottes

| Class | Grootte |
|-------|---------|
| `.icon-xs` | 0.875em |
| `.icon-sm` | 1em |
| `.icon-md` | 1.25em (default) |
| `.icon-lg` | 1.5em |
| `.icon-xl` | 2em |
| `.icon-2xl` | 2.5em |
| `.icon-3xl` | 3em |

## Dynamische Content

De MutationObserver zorgt ervoor dat nieuw toegevoegde content ook wordt verwerkt:

```javascript
// Nieuwe content wordt automatisch verwerkt
container.innerHTML = '<p>🎹 Nieuwe afspraak</p>';
// Icons worden automatisch geïnitialiseerd
```

## Favicon

De gouden piano favicon wordt geladen vanaf `/assets/favicon.svg`:

```html
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
```

## Bijwerken van Icons

### Nieuwe emoji toevoegen

Edit `public/icons.js` en voeg toe aan `ICON_MAP`:

```javascript
const ICON_MAP = {
    // ... bestaande mappings
    '🆕': 'new-icon-name',
};
```

### Kleur aanpassen

Edit `public/icons.css`:

```css
:root {
    --icon-gold: #nieuwekleur;
}
```

## Compatibiliteit

- **Browsers**: Chrome 80+, Firefox 75+, Safari 13+, Edge 80+
- **Lucide Version**: Latest (unpkg CDN)
- **Geen emoji fallback**: Als JavaScript uitgeschakeld is, blijven emoji's zichtbaar

## Aangepaste Pagina's

Alle 14 HTML pagina's zijn bijgewerkt:
- ✓ index.html
- ✓ login.html
- ✓ dashboard.html
- ✓ customers.html
- ✓ customer-detail.html
- ✓ pianos.html
- ✓ booking.html
- ✓ book.html
- ✓ settings.html
- ✓ billing.html
- ✓ pricing.html
- ✓ admin.html
- ✓ admin-login.html
- ✓ admin-dashboard.html

---

*Laatste update: 8 januari 2026*
