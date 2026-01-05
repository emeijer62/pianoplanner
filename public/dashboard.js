// Dashboard JavaScript met Kalender Views
let currentUser = null;
let isAdmin = false;
let subscription = null;
let allEvents = [];
let currentView = 'week';
let currentDate = new Date();

const DAYS_NL = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
const DAYS_SHORT = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
const MONTHS_NL = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];

// Auto-sync cooldown (5 minuten)
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is logged in
    try {
        const response = await fetch('/api/user');
        const data = await response.json();
        
        if (!data.loggedIn) {
            window.location.href = '/index.html';
            return;
        }
        
        currentUser = data.user;
        isAdmin = data.isAdmin || false;
        subscription = data.subscription;
        
        // Check subscription access - redirect to billing if no access
        if (subscription && !subscription.hasAccess) {
            window.location.href = '/billing.html';
            return;
        }
        
        updateNavbar(currentUser);
        showTrialBanner();
        
        // Load data
        await Promise.all([
            loadAllEvents(),
            loadCalendars()
        ]);
        
        // Render initial view
        renderCalendar();
        
        // Auto-sync met Google Calendar (als ingeschakeld)
        await autoSyncCalendar();
        
    } catch (err) {
        console.error('Error:', err);
        // Don't redirect on error - just show error message
        alert('Er is een fout opgetreden. Probeer opnieuw.');
    }
    
    // Event listeners
    document.getElementById('add-event-btn').addEventListener('click', openModal);
    document.getElementById('event-form').addEventListener('submit', handleEventSubmit);
});

// Automatische sync met Google Calendar
async function autoSyncCalendar() {
    try {
        // Check of sync is ingeschakeld
        const settingsRes = await fetch('/api/calendar/sync-settings');
        if (!settingsRes.ok) return;
        
        const { settings } = await settingsRes.json();
        if (!settings?.enabled) return;
        
        // Check cooldown (niet vaker dan elke 5 minuten)
        const lastSync = localStorage.getItem('lastCalendarSync');
        if (lastSync) {
            const timeSince = Date.now() - parseInt(lastSync);
            if (timeSince < SYNC_COOLDOWN_MS) {
                console.log(`⏳ Auto-sync skipped (cooldown: ${Math.round((SYNC_COOLDOWN_MS - timeSince) / 1000)}s remaining)`);
                return;
            }
        }
        
        console.log('🔄 Auto-syncing calendar...');
        
        const syncRes = await fetch('/api/calendar/sync', { method: 'POST' });
        if (syncRes.ok) {
            const result = await syncRes.json();
            localStorage.setItem('lastCalendarSync', Date.now().toString());
            
            if (result.synced > 0) {
                console.log(`✅ Auto-sync: ${result.synced} items gesynchroniseerd`);
                // Herlaad events als er iets is gesynchroniseerd
                await loadAllEvents();
                renderCalendar();
            } else {
                console.log('✅ Auto-sync: alles up-to-date');
            }
        }
    } catch (err) {
        console.log('Auto-sync skipped:', err.message);
    }
}

// Show trial banner if user is in trial period
function showTrialBanner() {
    if (subscription?.status === 'trialing' && subscription?.daysLeft <= 7) {
        const banner = document.createElement('div');
        banner.className = 'trial-banner';
        banner.innerHTML = `
            <span>🕐 Nog ${subscription.daysLeft} dagen in je proefperiode</span>
            <a href="/billing.html" class="trial-banner-btn">Abonnement starten</a>
        `;
        banner.style.cssText = `
            background: linear-gradient(135deg, #1565c0, #1976d2);
            color: white;
            padding: 12px 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 16px;
            font-size: 0.9rem;
        `;
        const btn = banner.querySelector('.trial-banner-btn');
        btn.style.cssText = `
            background: white;
            color: #1565c0;
            padding: 6px 16px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 500;
            font-size: 0.85rem;
        `;
        document.body.insertBefore(banner, document.body.firstChild);
    }
}

function updateNavbar(user) {
    document.getElementById('nav-user-name').textContent = user.name;
    if (user.picture) {
        document.getElementById('nav-user-picture').src = user.picture;
    }
    
    // Toon admin link alleen voor admins
    if (isAdmin) {
        document.getElementById('admin-link').style.display = 'inline-block';
    }
}

// ========== CALENDAR DATA ==========

async function loadAllEvents() {
    try {
        // Laad lokale afspraken voor een ruime periode (3 maanden voor en na)
        const startDate = new Date(currentDate);
        startDate.setMonth(startDate.getMonth() - 1);
        const endDate = new Date(currentDate);
        endDate.setMonth(endDate.getMonth() + 2);
        
        const response = await fetch(`/api/appointments?start=${startDate.toISOString()}&end=${endDate.toISOString()}`);
        
        if (!response.ok) {
            throw new Error('Failed to load appointments');
        }
        
        // De API retourneert al het juiste formaat (met summary, start.dateTime, etc.)
        allEvents = await response.json();
        
        console.log(`📅 ${allEvents.length} afspraken geladen`);
        
    } catch (err) {
        console.error('Error loading appointments:', err);
        allEvents = [];
    }
}

async function loadCalendars() {
    const container = document.getElementById('calendars-list');
    
    // Element bestaat niet in huidige layout - skip
    if (!container) return;
    
    // Toon lokale agenda categorieën
    const categories = [
        { name: 'Stemmen', color: '#4CAF50' },
        { name: 'Reparatie', color: '#2196F3' },
        { name: 'Onderhoud', color: '#FF9800' },
        { name: 'Transport', color: '#9C27B0' }
    ];
    
    container.innerHTML = categories.map(cat => `
        <div class="calendar-item">
            <div class="calendar-color" style="background: ${cat.color}"></div>
            <span>${escapeHtml(cat.name)}</span>
        </div>
    `).join('');
}

// ========== CALENDAR NAVIGATION ==========

function changeView(view) {
    currentView = view;
    renderCalendar();
}

function navigateCalendar(direction) {
    switch (currentView) {
        case 'day':
            currentDate.setDate(currentDate.getDate() + direction);
            break;
        case 'week':
            currentDate.setDate(currentDate.getDate() + (direction * 7));
            break;
        case 'month':
            currentDate.setMonth(currentDate.getMonth() + direction);
            break;
    }
    renderCalendar();
}

function goToToday() {
    currentDate = new Date();
    renderCalendar();
}

function updateTitle() {
    const titleEl = document.getElementById('calendarTitle');
    
    switch (currentView) {
        case 'day':
            titleEl.textContent = `${DAYS_NL[currentDate.getDay()]} ${currentDate.getDate()} ${MONTHS_NL[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
            break;
        case 'week':
            const weekStart = getWeekStart(currentDate);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            
            if (weekStart.getMonth() === weekEnd.getMonth()) {
                titleEl.textContent = `${weekStart.getDate()} - ${weekEnd.getDate()} ${MONTHS_NL[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
            } else {
                titleEl.textContent = `${weekStart.getDate()} ${MONTHS_NL[weekStart.getMonth()].substring(0,3)} - ${weekEnd.getDate()} ${MONTHS_NL[weekEnd.getMonth()].substring(0,3)} ${weekEnd.getFullYear()}`;
            }
            break;
        case 'month':
            titleEl.textContent = `${MONTHS_NL[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
            break;
    }
}

// ========== CALENDAR RENDERING ==========

function renderCalendar() {
    updateTitle();
    
    const container = document.getElementById('calendarContent');
    
    switch (currentView) {
        case 'day':
            renderDayView(container);
            break;
        case 'week':
            renderWeekView(container);
            break;
        case 'month':
            renderMonthView(container);
            break;
    }
}

function renderDayView(container) {
    const today = new Date();
    const isToday = isSameDay(currentDate, today);
    
    // Get events for this day
    const dayEvents = getEventsForDay(currentDate);
    
    let html = `<div class="day-view">`;
    html += `<div class="time-grid">`;
    
    // Render time slots (6:00 - 22:00)
    for (let hour = 6; hour <= 22; hour++) {
        const timeStr = `${hour.toString().padStart(2, '0')}:00`;
        const hourEvents = dayEvents.filter(e => {
            const eventHour = new Date(e.start.dateTime || e.start.date).getHours();
            return eventHour === hour;
        });
        
        html += `
            <div class="time-slot">
                <div class="time-label">${timeStr}</div>
                <div class="time-content">
                    ${hourEvents.map(e => createEventElement(e)).join('')}
                </div>
            </div>
        `;
    }
    
    html += `</div></div>`;
    container.innerHTML = html;
}

function renderWeekView(container) {
    const weekStart = getWeekStart(currentDate);
    const today = new Date();
    
    // Header with days
    let html = `<div class="week-view">`;
    html += `<div class="week-header">`;
    html += `<div class="week-header-cell"></div>`; // Empty corner
    
    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        const isToday = isSameDay(day, today);
        
        html += `
            <div class="week-header-cell ${isToday ? 'today' : ''}">
                <div class="week-header-day">${DAYS_SHORT[day.getDay()]}</div>
                <div class="week-header-date">${day.getDate()}</div>
            </div>
        `;
    }
    html += `</div>`;
    
    // Time grid
    html += `<div class="week-grid">`;
    
    // Time column
    html += `<div class="week-time-col">`;
    for (let hour = 6; hour <= 22; hour++) {
        html += `<div class="week-time-slot">${hour.toString().padStart(2, '0')}:00</div>`;
    }
    html += `</div>`;
    
    // Day columns
    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        const dayEvents = getEventsForDay(day);
        
        html += `<div class="week-day-col">`;
        
        for (let hour = 6; hour <= 22; hour++) {
            const hourEvents = dayEvents.filter(e => {
                const start = new Date(e.start.dateTime || e.start.date);
                return start.getHours() === hour;
            });
            
            html += `
                <div class="week-day-slot">
                    ${hourEvents.map(e => createEventElement(e, true)).join('')}
                </div>
            `;
        }
        
        html += `</div>`;
    }
    
    html += `</div></div>`;
    container.innerHTML = html;
}

function renderMonthView(container) {
    const today = new Date();
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    // Start from Monday of the week containing the first day
    const startDate = new Date(firstDay);
    const dayOfWeek = startDate.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
    startDate.setDate(startDate.getDate() - diff);
    
    let html = `<div class="month-view">`;
    
    // Header with day names (starting Monday)
    html += `<div class="month-header">`;
    const daysFromMonday = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
    daysFromMonday.forEach(day => {
        html += `<div class="month-header-cell">${day}</div>`;
    });
    html += `</div>`;
    
    // Calendar grid
    html += `<div class="month-grid">`;
    
    const currentMonth = currentDate.getMonth();
    let currentCalDay = new Date(startDate);
    
    // Render 6 weeks (42 days)
    for (let i = 0; i < 42; i++) {
        const isCurrentMonth = currentCalDay.getMonth() === currentMonth;
        const isToday = isSameDay(currentCalDay, today);
        const dayEvents = getEventsForDay(currentCalDay);
        
        html += `
            <div class="month-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}" 
                 onclick="goToDay(${currentCalDay.getFullYear()}, ${currentCalDay.getMonth()}, ${currentCalDay.getDate()})">
                <div class="month-day-number">${currentCalDay.getDate()}</div>
                <div class="month-events">
                    ${dayEvents.slice(0, 3).map(e => `
                        <div class="month-event" style="background: ${getEventColor(e)}" title="${escapeHtml(e.summary || 'Geen titel')}">
                            ${escapeHtml(e.summary || 'Geen titel')}
                        </div>
                    `).join('')}
                    ${dayEvents.length > 3 ? `<div class="month-more">+${dayEvents.length - 3} meer</div>` : ''}
                </div>
            </div>
        `;
        
        currentCalDay.setDate(currentCalDay.getDate() + 1);
    }
    
    html += `</div></div>`;
    container.innerHTML = html;
}

function goToDay(year, month, day) {
    currentDate = new Date(year, month, day);
    currentView = 'day';
    document.getElementById('viewSelect').value = 'day';
    renderCalendar();
}

// ========== HELPER FUNCTIONS ==========

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday = 0
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function isSameDay(d1, d2) {
    return d1.getDate() === d2.getDate() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getFullYear() === d2.getFullYear();
}

function getEventsForDay(date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    
    return allEvents.filter(event => {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        return eventStart >= dayStart && eventStart <= dayEnd;
    }).sort((a, b) => {
        const aStart = new Date(a.start.dateTime || a.start.date);
        const bStart = new Date(b.start.dateTime || b.start.date);
        return aStart - bStart;
    });
}

function createEventElement(event, compact = false) {
    const start = event.start.dateTime ? new Date(event.start.dateTime) : null;
    const timeStr = start ? start.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
    const color = getEventColor(event);
    
    if (compact) {
        return `
            <div class="calendar-event" style="background: ${color}" title="${escapeHtml(event.summary || 'Geen titel')}">
                ${escapeHtml(event.summary || 'Geen titel')}
            </div>
        `;
    }
    
    return `
        <div class="calendar-event" style="background: ${color}">
            <div class="calendar-event-time">${timeStr}</div>
            <div>${escapeHtml(event.summary || 'Geen titel')}</div>
        </div>
    `;
}

function getEventColor(event) {
    // Map colorId to colors
    const colorMap = {
        '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73',
        '5': '#f6bf26', '6': '#f4511e', '7': '#039be5', '8': '#616161',
        '9': '#3f51b5', '10': '#0b8043', '11': '#d50000'
    };
    return colorMap[event.colorId] || '#4CAF50';
}

// ========== MODAL FUNCTIONS ==========

function openModal() {
    document.getElementById('event-modal').style.display = 'flex';
    
    // Set default start time based on current view
    const startDate = new Date(currentDate);
    startDate.setHours(new Date().getHours() + 1, 0, 0, 0);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    
    document.getElementById('event-start').value = formatDateTimeLocal(startDate);
    document.getElementById('event-end').value = formatDateTimeLocal(endDate);
}

function closeModal() {
    document.getElementById('event-modal').style.display = 'none';
    document.getElementById('event-form').reset();
}

async function handleEventSubmit(e) {
    e.preventDefault();
    
    const title = document.getElementById('event-title').value;
    const description = document.getElementById('event-description').value;
    const location = document.getElementById('event-location').value;
    const start = document.getElementById('event-start').value;
    const end = document.getElementById('event-end').value;
    
    try {
        const response = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                description,
                location,
                start: new Date(start).toISOString(),
                end: new Date(end).toISOString()
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to create appointment');
        }
        
        closeModal();
        await loadAllEvents();
        renderCalendar();
        
    } catch (err) {
        console.error('Error creating appointment:', err);
        alert('Kon afspraak niet aanmaken. Probeer het opnieuw.');
    }
}

async function deleteEvent(eventId) {
    if (!confirm('Weet je zeker dat je deze afspraak wilt verwijderen?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/appointments/${eventId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete appointment');
        }
        
        await loadAllEvents();
        renderCalendar();
        
    } catch (err) {
        console.error('Error deleting appointment:', err);
        alert('Kon afspraak niet verwijderen. Probeer het opnieuw.');
    }
}

// ========== UTILITY FUNCTIONS ==========

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDateTimeLocal(date) {
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Close modal on outside click
document.getElementById('event-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'event-modal') {
        closeModal();
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});
