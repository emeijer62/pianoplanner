// Dashboard JavaScript met Kalender Views
let currentUser = null;
let isAdmin = false;
let subscription = null;
let allEvents = [];
let currentView = 'week';
let currentDate = new Date();
let miniMonthDate = new Date();
let slotDuration = parseInt(localStorage.getItem('calendarSlotDuration') || '60'); // 60 or 90 minutes

// Dynamic i18n calendar arrays - will be populated from i18n
const getMonths = () => i18n?.translations?.calendar?.months || ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const getMonthsShort = () => i18n?.translations?.calendar?.monthsShort || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const getDays = () => i18n?.translations?.calendar?.days || ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const getDaysShort = () => i18n?.translations?.calendar?.daysShort || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const getToday = () => i18n?.translations?.calendar?.today || 'Today';

// Auto-sync cooldown (5 minutes)
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

// ========== NOTIFICATION SYSTEM ==========

function showNotification(message, type = 'info') {
    // Remove existing notification if any
    const existing = document.querySelector('.notification-toast');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification-toast notification-${type}`;
    notification.innerHTML = `
        <span class="notification-icon">${getNotificationIcon(type)}</span>
        <span class="notification-message">${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.classList.add('notification-fade-out');
            setTimeout(() => notification.remove(), 300);
        }
    }, 4000);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return '✓';
        case 'error': return '✕';
        case 'warning': return '⚠';
        default: return 'ℹ';
    }
}

// Update mini calendar day names based on language
function updateMiniDayNames() {
    const container = document.getElementById('miniDayNames');
    if (!container) return;
    
    const daysShort = getDaysShort();
    // Start from Monday (index 1), wrap Sunday (index 0) to end
    const orderedDays = [daysShort[1], daysShort[2], daysShort[3], daysShort[4], daysShort[5], daysShort[6], daysShort[0]];
    container.innerHTML = orderedDays.map(d => `<div>${d}</div>`).join('');
}

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
        
        // Update mini calendar day names based on language
        updateMiniDayNames();
        
        // Load data
        await Promise.all([
            loadAllEvents(),
            loadCalendars()
        ]);
        
        // Initialize slot duration selector
        const slotSelect = document.getElementById('slotDurationSelect');
        if (slotSelect) {
            slotSelect.value = slotDuration.toString();
        }
        
        // Render initial view
        renderCalendar();
        
        // Auto-sync met Google Calendar (als ingeschakeld)
        await autoSyncCalendar();
        
    } catch (err) {
        console.error('Error:', err);
        // Don't redirect on error - just show error message
        alert('An error occurred. Please try again.');
    }
    
    // Event listeners
    document.getElementById('add-event-btn').addEventListener('click', openModal);
    document.getElementById('event-form').addEventListener('submit', handleEventSubmit);
});

// Automatische sync met Google Calendar
async function autoSyncCalendar() {
    try {
        // Check if Google sync is enabled
        const settingsRes = await fetch('/api/calendar/sync-settings');
        if (settingsRes.ok) {
            const { settings } = await settingsRes.json();
            if (settings?.enabled) {
                await syncGoogleCalendar();
            }
        }
    } catch (err) {
        console.log('Google sync check skipped:', err.message);
    }
    
    try {
        // Check if Apple Calendar sync is enabled
        const appleStatusRes = await fetch('/api/apple-calendar/status');
        if (appleStatusRes.ok) {
            const appleStatus = await appleStatusRes.json();
            if (appleStatus.connected) {
                await syncAppleCalendar();
            }
        }
    } catch (err) {
        console.log('Apple sync check skipped:', err.message);
    }
}

// Sync met Google Calendar
async function syncGoogleCalendar() {
    // Check cooldown (no more than every 5 minutes)
    const lastSync = localStorage.getItem('lastCalendarSync');
    if (lastSync) {
        const timeSince = Date.now() - parseInt(lastSync);
        if (timeSince < SYNC_COOLDOWN_MS) {
            console.log(`⏳ Google sync skipped (cooldown: ${Math.round((SYNC_COOLDOWN_MS - timeSince) / 1000)}s remaining)`);
            return;
        }
    }
    
    console.log('🔄 Auto-syncing Google Calendar...');
    
    try {
        const syncRes = await fetch('/api/calendar/sync', { method: 'POST' });
        if (syncRes.ok) {
            const result = await syncRes.json();
            localStorage.setItem('lastCalendarSync', Date.now().toString());
            
            if (result.synced > 0) {
                console.log(`✅ Google sync: ${result.synced} items synchronized`);
                await loadAllEvents();
                renderCalendar();
            } else {
                console.log('✅ Google sync: everything up-to-date');
            }
        }
    } catch (err) {
        console.log('Google sync error:', err.message);
    }
}

// Sync met Apple Calendar
async function syncAppleCalendar() {
    // Check cooldown
    const lastAppleSync = localStorage.getItem('lastAppleCalendarSync');
    if (lastAppleSync) {
        const timeSince = Date.now() - parseInt(lastAppleSync);
        if (timeSince < SYNC_COOLDOWN_MS) {
            console.log(`⏳ Apple sync skipped (cooldown: ${Math.round((SYNC_COOLDOWN_MS - timeSince) / 1000)}s remaining)`);
            return;
        }
    }
    
    console.log('🍎 Auto-syncing Apple Calendar...');
    
    try {
        // Check sync settings
        const syncSettingsRes = await fetch('/api/apple-calendar/sync-settings');
        if (!syncSettingsRes.ok) return;
        
        const syncSettings = await syncSettingsRes.json();
        if (!syncSettings.settings?.enabled) {
            console.log('🍎 Apple Calendar sync not enabled');
            return;
        }
        
        // Perform sync
        const syncRes = await fetch('/api/apple-calendar/sync', { method: 'POST' });
        if (syncRes.ok) {
            const result = await syncRes.json();
            localStorage.setItem('lastAppleCalendarSync', Date.now().toString());
            
            if (result.synced > 0) {
                console.log(`✅ Apple sync: ${result.synced} items synchronized`);
                await loadAllEvents();
                renderCalendar();
            } else {
                console.log('✅ Apple sync: everything up-to-date');
            }
            
            if (result.errors?.length > 0) {
                console.warn('🍎 Apple sync errors:', result.errors);
            }
        }
    } catch (err) {
        console.log('Apple sync error:', err.message);
    }
}

// Show trial banner if user is in trial period
function showTrialBanner() {
    if (subscription?.status === 'trialing' && subscription?.daysLeft <= 7) {
        const banner = document.createElement('div');
        banner.className = 'trial-banner';
        banner.innerHTML = `
            <span>🕐 ${subscription.daysLeft} days left in your trial</span>
            <a href="/billing.html" class="trial-banner-btn">Start subscription</a>
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
    
    // Show admin link only for admins
    if (isAdmin) {
        document.getElementById('admin-link').style.display = 'inline-block';
    }
}

// ========== CALENDAR DATA ==========

async function loadAllEvents() {
    try {
        // Load local appointments for a wide period (3 months before and after)
        const startDate = new Date(currentDate);
        startDate.setMonth(startDate.getMonth() - 1);
        const endDate = new Date(currentDate);
        endDate.setMonth(endDate.getMonth() + 2);
        
        console.log(`📅 Loading appointments from ${startDate.toISOString()} to ${endDate.toISOString()}`);
        
        const response = await fetch(`/api/appointments?start=${startDate.toISOString()}&end=${endDate.toISOString()}`);
        
        console.log(`📅 Appointments API response status: ${response.status}`);
        
        if (!response.ok) {
            throw new Error('Failed to load appointments');
        }
        
        // The API already returns the correct format (with summary, start.dateTime, etc.)
        allEvents = await response.json();
        
        console.log(`📅 ${allEvents.length} appointments loaded:`, allEvents);
        
    } catch (err) {
        console.error('Error loading appointments:', err);
        allEvents = [];
    }
}

async function loadCalendars() {
    const container = document.getElementById('calendars-list');
    
    // Element doesn't exist in current layout - skip
    if (!container) return;
    
    // Show local calendar categories
    const categories = [
        { name: 'Tuning', color: '#4CAF50' },
        { name: 'Repair', color: '#2196F3' },
        { name: 'Maintenance', color: '#FF9800' },
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

// ========== CALENDAR SYNC ==========

async function syncCalendar() {
    const btn = document.getElementById('sync-btn');
    if (!btn || btn.classList.contains('syncing')) return;
    
    // Start syncing animation
    btn.classList.add('syncing');
    btn.classList.remove('success', 'error');
    
    let googleResult = null;
    let appleResult = null;
    let hasError = false;
    let totalSynced = 0;
    
    try {
        // Probeer Google Calendar sync (als geconfigureerd)
        try {
            const googleResponse = await fetch('/api/calendar/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (googleResponse.ok) {
                googleResult = await googleResponse.json();
                totalSynced += googleResult.synced || 0;
            } else if (googleResponse.status !== 400) {
                // 400 = niet geconfigureerd, dat is ok
                hasError = true;
            }
        } catch (e) {
            console.log('Google sync niet beschikbaar');
        }
        
        // Probeer Apple Calendar sync (als geconfigureerd)
        try {
            const appleResponse = await fetch('/api/apple-calendar/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (appleResponse.ok) {
                appleResult = await appleResponse.json();
                totalSynced += appleResult.synced || 0;
            } else if (appleResponse.status !== 400) {
                // 400 = niet geconfigureerd, dat is ok
                hasError = true;
            }
        } catch (e) {
            console.log('Apple sync niet beschikbaar');
        }
        
        btn.classList.remove('syncing');
        
        // Check of minstens één provider geconfigureerd is
        if (!googleResult && !appleResult) {
            btn.classList.add('error');
            showNotification('Verbind eerst een kalender in Instellingen', 'warning');
        } else if (hasError) {
            btn.classList.add('error');
            showNotification('Sync gedeeltelijk mislukt', 'error');
        } else {
            btn.classList.add('success');
            
            // Bouw melding op
            const parts = [];
            if (googleResult) parts.push(`Google: ${googleResult.synced || 0}`);
            if (appleResult) parts.push(`iCloud: ${appleResult.synced || 0}`);
            
            if (totalSynced > 0) {
                showNotification(`Sync voltooid (${parts.join(', ')})`, 'success');
            } else {
                showNotification('Kalenders zijn up-to-date ✓', 'success');
            }
            
            // Refresh the calendar to show any imported appointments
            await loadAllEvents();
            renderCalendar();
        }
        
        // Reset button state after 2 seconds
        setTimeout(() => {
            btn.classList.remove('success', 'error');
        }, 2000);
        
    } catch (error) {
        console.error('Sync error:', error);
        btn.classList.remove('syncing');
        btn.classList.add('error');
        showNotification('Sync mislukt: netwerkfout', 'error');
        
        setTimeout(() => {
            btn.classList.remove('error');
        }, 2000);
    }
}

function updateTitle() {
    const titleEl = document.getElementById('calendarTitle');
    const months = getMonths();
    const monthsShort = getMonthsShort();
    const days = getDays();
    
    switch (currentView) {
        case 'day':
            titleEl.textContent = `${days[currentDate.getDay()]} ${currentDate.getDate()} ${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
            break;
        case 'week':
            const weekStart = getWeekStart(currentDate);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            
            if (weekStart.getMonth() === weekEnd.getMonth()) {
                titleEl.textContent = `${weekStart.getDate()} - ${weekEnd.getDate()} ${months[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
            } else {
                titleEl.textContent = `${weekStart.getDate()} ${monthsShort[weekStart.getMonth()]} - ${weekEnd.getDate()} ${monthsShort[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
            }
            break;
        case 'month':
            titleEl.textContent = `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
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

    renderMiniCalendar();
}

function renderDayView(container) {
    const today = new Date();
    const isToday = isSameDay(currentDate, today);
    
    // Get events for this day
    const dayEvents = getEventsForDay(currentDate);
    
    // Format date for data attribute
    const dateStr = formatDateForInput(currentDate);
    
    let html = `<div class="day-view">`;
    html += `<div class="time-grid">`;
    
    // Generate time slots based on slot duration
    const slots = generateTimeSlots();
    
    for (const slot of slots) {
        const slotEvents = dayEvents.filter(e => {
            const eventTime = new Date(e.start.dateTime || e.start.date);
            const eventMinutes = eventTime.getHours() * 60 + eventTime.getMinutes();
            return eventMinutes >= slot.startMinutes && eventMinutes < slot.endMinutes;
        });
        
        html += `
            <div class="time-slot" data-date="${dateStr}" data-hour="${slot.hour}" data-minute="${slot.minute}"
                 onclick="openModalWithTime(this)"
                 ondragover="handleDragOver(event)"
                 ondragleave="handleDragLeave(event)"
                 ondrop="handleDrop(event, '${dateStr}', ${slot.hour})">
                <div class="time-label">${slot.label}</div>
                <div class="time-content">
                    ${slotEvents.map(e => createEventElement(e)).join('')}
                </div>
            </div>
        `;
    }
    
    html += `</div></div>`;
    container.innerHTML = html;
}

// Generate time slots based on slot duration setting
function generateTimeSlots() {
    const slots = [];
    const startHour = 6;
    const endHour = 22;
    
    for (let minutes = startHour * 60; minutes < endHour * 60; minutes += slotDuration) {
        const hour = Math.floor(minutes / 60);
        const minute = minutes % 60;
        slots.push({
            hour,
            minute,
            startMinutes: minutes,
            endMinutes: minutes + slotDuration,
            label: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
        });
    }
    return slots;
}

// Change slot duration
function changeSlotDuration(duration) {
    slotDuration = parseInt(duration);
    localStorage.setItem('calendarSlotDuration', duration);
    renderCalendar();
}

function renderWeekView(container) {
    const weekStart = getWeekStart(currentDate);
    const today = new Date();
    
    // Header with days
    let html = `<div class="week-view">`;
    html += `<div class="week-header">`;
    html += `<div class="week-header-cell"></div>`; // Empty corner
    
    const daysShort = getDaysShort();
    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        const isToday = isSameDay(day, today);
        
        html += `
            <div class="week-header-cell ${isToday ? 'today' : ''}">
                <div class="week-header-day">${daysShort[day.getDay()]}</div>
                <div class="week-header-date">${day.getDate()}</div>
            </div>
        `;
    }
    html += `</div>`;
    
    // Time grid
    html += `<div class="week-grid">`;
    
    // Generate time slots based on duration setting
    const slots = generateTimeSlots();
    
    // Pre-calculate events for each day
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        weekDays.push({
            date: day,
            dateStr: formatDateForInput(day),
            events: getEventsForDay(day)
        });
    }
    
    // Render row by row (time slot by time slot)
    for (const slot of slots) {
        // Time cell first
        html += `<div class="week-time-slot">${slot.label}</div>`;
        
        // Then each day's slot for this time
        for (const dayData of weekDays) {
            const slotEvents = dayData.events.filter(e => {
                const start = new Date(e.start.dateTime || e.start.date);
                const eventMinutes = start.getHours() * 60 + start.getMinutes();
                return eventMinutes >= slot.startMinutes && eventMinutes < slot.endMinutes;
            });
            
            html += `
                <div class="week-day-slot" data-date="${dayData.dateStr}" data-hour="${slot.hour}" data-minute="${slot.minute}"
                     onclick="openModalWithTime(this)"
                     ondragover="handleDragOver(event)"
                     ondragleave="handleDragLeave(event)"
                     ondrop="handleDrop(event, '${dayData.dateStr}', ${slot.hour})">
                    ${slotEvents.map(e => createEventElement(e, true)).join('')}
                </div>
            `;
        }
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
                        <div class="month-event" style="background: ${getEventColor(e)}" title="${escapeHtml(e.summary || 'No title')}">
                            ${escapeHtml(e.summary || 'No title')}
                        </div>
                    `).join('')}
                    ${dayEvents.length > 3 ? `<div class="month-more">+${dayEvents.length - 3} more</div>` : ''}
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

// ========== MINI MONTH CALENDAR ==========

function renderMiniCalendar() {
    const grid = document.getElementById('miniCalendarGrid');
    const title = document.getElementById('miniCalendarTitle');
    if (!grid || !title) return;

    // Sync mini month with current date
    miniMonthDate = new Date(currentDate);

    const months = getMonths();
    title.textContent = `${months[miniMonthDate.getMonth()]} ${miniMonthDate.getFullYear()}`;
    grid.innerHTML = '';

    const today = new Date();
    const selectedDay = new Date(currentDate);
    const firstDay = new Date(miniMonthDate.getFullYear(), miniMonthDate.getMonth(), 1);
    const startDate = new Date(firstDay);
    const dow = startDate.getDay();
    const diff = dow === 0 ? 6 : dow - 1; // Monday start
    startDate.setDate(startDate.getDate() - diff);

    for (let i = 0; i < 42; i++) {
        const day = new Date(startDate);
        day.setDate(startDate.getDate() + i);

        const isCurrentMonth = day.getMonth() === miniMonthDate.getMonth();
        const isToday = isSameDay(day, today);
        const isSelected = isSameDay(day, selectedDay);
        const dayEvents = getEventsForDay(day);

        const cell = document.createElement('div');
        cell.className = `mini-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`;
        cell.onclick = () => {
            currentDate = new Date(day);
            currentView = 'day';
            document.getElementById('viewSelect').value = 'day';
            renderCalendar();
        };

        const num = document.createElement('div');
        num.className = 'mini-day-number';
        num.textContent = day.getDate();
        cell.appendChild(num);

        if (dayEvents.length) {
            const dots = document.createElement('div');
            dots.className = 'mini-dots';
            dayEvents.slice(0, 3).forEach((e) => {
                const dot = document.createElement('span');
                dot.className = 'mini-dot';
                dot.style.background = getEventColor(e);
                dots.appendChild(dot);
            });
            cell.appendChild(dots);
        }

        grid.appendChild(cell);
    }
}

function changeMiniMonth(offset) {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
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
    const timeStr = start ? start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
    const color = getEventColor(event);
    
    // Check for travel time info
    const hasTravelTime = event.travelTimeMinutes && event.travelStartTime;
    let travelStr = '';
    if (hasTravelTime) {
        const travelStart = new Date(event.travelStartTime);
        travelStr = travelStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    
    if (compact) {
        return `
            <div class="calendar-event" style="background: ${color}; cursor: grab;" 
                 title="${escapeHtml(event.summary || 'No title')}${hasTravelTime ? ` (🚗 ${event.travelTimeMinutes} min)` : ''}"
                 onclick="openEditModal('${event.id}')"
                 draggable="true"
                 ondragstart="handleDragStart(event, '${event.id}')"
                 ondragend="handleDragEnd(event)">
                ${escapeHtml(event.summary || 'No title')}
            </div>
        `;
    }
    
    // Show travel time as separate block before appointment
    let travelBlock = '';
    if (hasTravelTime) {
        travelBlock = `
            <div class="calendar-event calendar-event-travel" style="background: #90a4ae; opacity: 0.8; font-size: 0.75rem;">
                <div class="calendar-event-time">${travelStr}</div>
                <div>🚗 Travel time (${event.travelTimeMinutes} min${event.travelDistanceKm ? ', ' + event.travelDistanceKm + ' km' : ''})</div>
            </div>
        `;
    }
    
    return `
        ${travelBlock}
        <div class="calendar-event" style="background: ${color}; cursor: grab;" 
             onclick="openEditModal('${event.id}')"
             draggable="true"
             ondragstart="handleDragStart(event, '${event.id}')"
             ondragend="handleDragEnd(event)">
            <div class="calendar-event-time">${timeStr}</div>
            <div>${escapeHtml(event.summary || 'No title')}</div>
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

// Cache for customers, pianos, services
let customersCache = [];
let pianosCache = [];
let servicesCache = [];

async function loadModalData() {
    try {
        const [customersRes, pianosRes, servicesRes] = await Promise.all([
            fetch('/api/customers'),
            fetch('/api/pianos'),
            fetch('/api/services')
        ]);
        
        if (customersRes.ok) {
            const data = await customersRes.json();
            customersCache = Array.isArray(data) ? data : (data.customers || []);
        }
        if (pianosRes.ok) {
            const data = await pianosRes.json();
            pianosCache = Array.isArray(data) ? data : (data.pianos || []);
        }
        if (servicesRes.ok) {
            const data = await servicesRes.json();
            servicesCache = Array.isArray(data) ? data : (data.services || []);
        }
        
        populateCustomerDropdown();
        populateServiceDropdown();
    } catch (err) {
        console.error('Error loading modal data:', err);
    }
}

function populateCustomerDropdown() {
    const select = document.getElementById('event-customer');
    select.innerHTML = '<option value="">-- Select customer --</option>';
    
    customersCache.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.name + (c.city ? ` (${c.city})` : '');
        option.dataset.address = [c.street, c.postalCode, c.city].filter(Boolean).join(', ');
        select.appendChild(option);
    });
}

function populateServiceDropdown() {
    const select = document.getElementById('event-service');
    select.innerHTML = '<option value="">-- Select service --</option>';
    
    servicesCache.forEach(s => {
        const option = document.createElement('option');
        option.value = s.id;
        option.textContent = s.name + (s.duration ? ` (${s.duration} min)` : '');
        option.dataset.duration = s.duration || 60;
        option.dataset.name = s.name;
        select.appendChild(option);
    });
}

function onCustomerChange() {
    const customerId = document.getElementById('event-customer').value;
    const pianoSelect = document.getElementById('event-piano');
    const locationInput = document.getElementById('event-location');
    const confirmationWrapper = document.getElementById('send-confirmation-wrapper');
    const confirmationLabel = document.getElementById('send-confirmation-label');
    const confirmationCheckbox = document.getElementById('send-confirmation');
    
    // Reset piano dropdown
    pianoSelect.innerHTML = '<option value="">-- Select piano (optional) --</option>';
    
    // Hide confirmation checkbox by default
    if (confirmationWrapper) {
        confirmationWrapper.style.display = 'none';
        confirmationCheckbox.checked = false;
    }
    
    if (customerId) {
        // Filter pianos for this customer
        const customerPianos = pianosCache.filter(p => p.customerId === customerId);
        customerPianos.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${p.brand || ''} ${p.model || ''} ${p.serialNumber ? '(' + p.serialNumber + ')' : ''}`.trim() || 'Piano';
            pianoSelect.appendChild(option);
        });
        
        // Auto-select if only one piano
        if (customerPianos.length === 1) {
            pianoSelect.value = customerPianos[0].id;
        }
        
        // Fill location from customer address
        const selectedOption = document.getElementById('event-customer').selectedOptions[0];
        if (selectedOption && selectedOption.dataset.address) {
            locationInput.value = selectedOption.dataset.address;
        }
        
        // Show confirmation checkbox if customer has email
        const customer = customersCache.find(c => c.id === customerId);
        if (customer?.email && confirmationWrapper) {
            confirmationWrapper.style.display = 'block';
            confirmationLabel.textContent = `Bevestigingsmail sturen naar ${customer.email}`;
        }
    }
}

function onServiceChange() {
    const serviceSelect = document.getElementById('event-service');
    const selectedOption = serviceSelect.selectedOptions[0];
    const titleInput = document.getElementById('event-title');
    const startInput = document.getElementById('event-start');
    const endInput = document.getElementById('event-end');
    
    if (selectedOption && selectedOption.dataset.name) {
        // Set title if empty
        if (!titleInput.value) {
            titleInput.value = selectedOption.dataset.name;
        }
        
        // Adjust end time based on service duration
        if (startInput.value && selectedOption.dataset.duration) {
            const duration = parseInt(selectedOption.dataset.duration);
            const startDate = new Date(startInput.value);
            const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
            endInput.value = formatDateTimeLocal(endDate);
        }
    }
}

function openNewCustomerForm() {
    document.getElementById('new-customer-form').style.display = 'block';
    document.getElementById('new-customer-name').focus();
    
    // Setup address autocomplete for new customer
    setupNewCustomerAutocomplete();
}

function cancelNewCustomer() {
    document.getElementById('new-customer-form').style.display = 'none';
    document.getElementById('new-customer-name').value = '';
    document.getElementById('new-customer-email').value = '';
    document.getElementById('new-customer-phone').value = '';
    document.getElementById('new-customer-street').value = '';
    document.getElementById('new-customer-postalcode').value = '';
    document.getElementById('new-customer-city').value = '';
    document.getElementById('new-customer-piano').value = '';
}

async function saveNewCustomer() {
    const name = document.getElementById('new-customer-name').value.trim();
    if (!name) {
        alert('Please enter a customer name');
        return;
    }
    
    const street = document.getElementById('new-customer-street').value.trim();
    const postalCode = document.getElementById('new-customer-postalcode').value.trim();
    const city = document.getElementById('new-customer-city').value.trim();
    const pianoBrand = document.getElementById('new-customer-piano').value.trim();
    
    // Disable button during save
    const saveBtn = document.querySelector('#new-customer-form .btn-primary');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
        // Create customer
        const customerResponse = await fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                email: document.getElementById('new-customer-email').value.trim(),
                phone: document.getElementById('new-customer-phone').value.trim(),
                street,
                postalCode,
                city
            })
        });
        
        if (!customerResponse.ok) throw new Error('Failed to create customer');
        
        const newCustomer = await customerResponse.json();
        
        // If piano brand is entered, create piano for this customer
        let newPiano = null;
        if (pianoBrand) {
            try {
                const pianoResponse = await fetch('/api/pianos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerId: newCustomer.id,
                        brand: pianoBrand,
                        type: pianoBrand.toLowerCase().includes('vleugel') || pianoBrand.toLowerCase().includes('grand') ? 'grand' : 'upright',
                        notes: 'Added during appointment creation'
                    })
                });
                
                if (pianoResponse.ok) {
                    newPiano = await pianoResponse.json();
                    pianosCache.push(newPiano);
                }
            } catch (pianoErr) {
                console.error('Error creating piano:', pianoErr);
                // Continue anyway, customer was created
            }
        }
        
        // Add to cache and dropdown
        customersCache.push(newCustomer);
        populateCustomerDropdown();
        
        // Select the new customer
        document.getElementById('event-customer').value = newCustomer.id;
        onCustomerChange();
        
        // If a piano was created, select it
        if (newPiano) {
            document.getElementById('event-piano').value = newPiano.id;
        }
        
        // Hide form
        cancelNewCustomer();
        
        // Set location from new customer address
        const fullAddress = [street, postalCode, city].filter(Boolean).join(', ');
        if (fullAddress) {
            document.getElementById('event-location').value = fullAddress;
        }
        
        // Show success message
        console.log(`✅ Customer "${name}" created`);
        
    } catch (err) {
        console.error('Error creating customer:', err);
        alert('Could not create customer. Please try again.');
    } finally {
        // Re-enable button
        const saveBtn = document.querySelector('#new-customer-form .btn-primary');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Add customer';
        }
    }
}

function setupNewCustomerAutocomplete() {
    const input = document.getElementById('new-customer-street');
    const suggestions = document.getElementById('new-customer-suggestions');
    
    // Remove existing listeners by cloning the element
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    let debounceTimer;
    
    newInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = newInput.value.trim();
        
        if (query.length < 3) {
            suggestions.style.display = 'none';
            return;
        }
        
        debounceTimer = setTimeout(async () => {
            try {
                const response = await fetch(`/api/booking/address-autocomplete?input=${encodeURIComponent(query)}`);
                if (!response.ok) return;
                
                const data = await response.json();
                const predictions = Array.isArray(data) ? data : (data.predictions || []);
                
                if (predictions.length === 0) {
                    suggestions.style.display = 'none';
                    return;
                }
                
                suggestions.innerHTML = predictions.map(p => `
                    <div class="suggestion-item" data-place-id="${p.placeId}" data-description="${escapeHtml(p.description)}">
                        ${escapeHtml(p.description)}
                    </div>
                `).join('');
                
                suggestions.style.display = 'block';
                
                suggestions.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('mousedown', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const placeId = item.dataset.placeId;
                        const streetInput = document.getElementById('new-customer-street');
                        const postalcodeInput = document.getElementById('new-customer-postalcode');
                        const cityInput = document.getElementById('new-customer-city');
                        
                        // Get place details to fill in all fields
                        try {
                            const detailsResponse = await fetch(`/api/booking/place-details?placeId=${placeId}`);
                            if (detailsResponse.ok) {
                                const details = await detailsResponse.json();
                                // API returns { address: { street, postalCode, city } }
                                const addr = details.address || details;
                                streetInput.value = addr.street || item.dataset.description.split(',')[0].trim();
                                postalcodeInput.value = addr.postalCode || '';
                                cityInput.value = addr.city || '';
                            } else {
                                // Fallback: just use the description
                                const parts = item.dataset.description.split(',').map(p => p.trim());
                                streetInput.value = parts[0] || '';
                                cityInput.value = parts[1] || '';
                            }
                        } catch (err) {
                            // Fallback
                            streetInput.value = item.dataset.description.split(',')[0].trim();
                        }
                        
                        suggestions.style.display = 'none';
                    });
                });
                
            } catch (err) {
                console.error('Autocomplete error:', err);
            }
        }, 300);
    });
    
    newInput.addEventListener('blur', () => {
        setTimeout(() => { suggestions.style.display = 'none'; }, 200);
    });
}

function openModal() {
    // Don't reopen if already open
    const modal = document.getElementById('event-modal');
    if (modal.style.display === 'flex') {
        return;
    }
    
    modal.style.display = 'flex';
    
    // Load customers, pianos, services
    loadModalData();
    
    // Set default start time based on current view
    const startDate = new Date(currentDate);
    startDate.setHours(new Date().getHours() + 1, 0, 0, 0);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    
    document.getElementById('event-start').value = formatDateTimeLocal(startDate);
    document.getElementById('event-end').value = formatDateTimeLocal(endDate);
}

// Open modal with pre-filled time from clicked slot
function openModalWithTime(element) {
    // Don't trigger if modal is already open
    const modal = document.getElementById('event-modal');
    if (modal.style.display === 'flex') {
        return;
    }
    
    // Don't trigger if clicking on an event
    if (event.target.closest('.calendar-event')) {
        return;
    }
    
    const dateStr = element.dataset.date;
    const hour = parseInt(element.dataset.hour);
    
    document.getElementById('event-modal').style.display = 'flex';
    
    // Load customers, pianos, services
    loadModalData();
    
    // Create start date from clicked slot
    const startDate = new Date(dateStr + 'T' + hour.toString().padStart(2, '0') + ':00:00');
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour later
    
    document.getElementById('event-start').value = formatDateTimeLocal(startDate);
    document.getElementById('event-end').value = formatDateTimeLocal(endDate);
    
    // Focus on customer field first
    setTimeout(() => {
        document.getElementById('event-customer').focus();
    }, 100);
}

// Format date for data attribute (YYYY-MM-DD)
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Track which appointment is being edited (null = new appointment)
let editingAppointmentId = null;

// Open modal to edit existing appointment
async function openEditModal(appointmentId) {
    event.stopPropagation(); // Prevent triggering slot click
    
    // Don't reopen if editing the same appointment
    const modal = document.getElementById('event-modal');
    if (modal.style.display === 'flex' && editingAppointmentId === appointmentId) {
        return;
    }
    
    const appointment = allEvents.find(e => e.id === appointmentId);
    if (!appointment) {
        console.error('Appointment not found:', appointmentId);
        return;
    }
    
    editingAppointmentId = appointmentId;
    
    modal.style.display = 'flex';
    
    // Update modal title
    document.querySelector('#event-modal .modal-header h2').textContent = 'Edit Appointment';
    
    // Show delete button
    document.getElementById('delete-appointment-btn').style.display = 'block';
    
    // Load customers, pianos, services first
    await loadModalData();
    
    // Fill in the form with existing data
    document.getElementById('event-title').value = appointment.summary || '';
    document.getElementById('event-description').value = appointment.description || '';
    document.getElementById('event-location').value = appointment.location || '';
    
    // Parse dates
    const startDate = new Date(appointment.start?.dateTime || appointment.start);
    const endDate = new Date(appointment.end?.dateTime || appointment.end);
    document.getElementById('event-start').value = formatDateTimeLocal(startDate);
    document.getElementById('event-end').value = formatDateTimeLocal(endDate);
    
    // Set customer if exists
    if (appointment.customerId) {
        document.getElementById('event-customer').value = appointment.customerId;
        onCustomerChange(); // Load pianos for this customer
        
        // Set piano after pianos are loaded
        setTimeout(() => {
            if (appointment.pianoId) {
                document.getElementById('event-piano').value = appointment.pianoId;
            }
        }, 100);
    }
    
    // Set service if exists
    if (appointment.serviceId) {
        document.getElementById('event-service').value = appointment.serviceId;
    }
}

// Delete the currently editing appointment
async function deleteCurrentAppointment() {
    if (!editingAppointmentId) return;
    
    // Get appointment title for confirmation
    const appointment = allEvents.find(e => e.id === editingAppointmentId);
    const title = appointment?.summary || 'this appointment';
    
    if (!confirm(`Are you sure you want to delete "${title}"?\n\nThis action cannot be undone.`)) {
        return;
    }
    
    try {
        // Instantly remove from UI (optimistic update)
        const deletedId = editingAppointmentId;
        allEvents = allEvents.filter(e => e.id !== deletedId);
        closeModal();
        renderCalendar();
        
        // Then delete on server
        const response = await fetch(`/api/appointments/${deletedId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            // Restore if failed
            await loadAllEvents();
            renderCalendar();
            throw new Error('Failed to delete appointment');
        }
        
        // Show brief success feedback
        showToast('Appointment deleted');
        
    } catch (err) {
        console.error('Error deleting appointment:', err);
        alert('Could not delete appointment. Please try again.');
    }
}

function closeModal() {
    document.getElementById('event-modal').style.display = 'none';
    document.getElementById('event-form').reset();
    document.getElementById('new-customer-form').style.display = 'none';
    document.getElementById('event-piano').innerHTML = '<option value="">-- Select piano (optional) --</option>';
    
    // Hide confirmation checkbox
    const confirmationWrapper = document.getElementById('send-confirmation-wrapper');
    if (confirmationWrapper) {
        confirmationWrapper.style.display = 'none';
    }
    
    // Reset edit mode
    editingAppointmentId = null;
    document.querySelector('#event-modal .modal-header h2').textContent = 'New Appointment';
    document.getElementById('delete-appointment-btn').style.display = 'none';
}

async function handleEventSubmit(e) {
    e.preventDefault();
    
    const customerId = document.getElementById('event-customer').value;
    const pianoId = document.getElementById('event-piano').value;
    const serviceId = document.getElementById('event-service').value;
    const title = document.getElementById('event-title').value;
    const description = document.getElementById('event-description').value;
    const location = document.getElementById('event-location').value;
    const start = document.getElementById('event-start').value;
    const end = document.getElementById('event-end').value;
    const sendConfirmation = document.getElementById('send-confirmation')?.checked || false;
    
    // Get names from cache (use == for loose comparison since dropdown values are strings)
    const customer = customersCache.find(c => String(c.id) === customerId);
    const piano = pianosCache.find(p => String(p.id) === pianoId);
    const service = servicesCache.find(s => String(s.id) === serviceId);
    
    console.log('📋 Service lookup:', { serviceId, service, servicesCache: servicesCache.map(s => ({id: s.id, name: s.name})) });
    
    const appointmentData = {
        title,
        description,
        location,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        customerId: customerId || null,
        customerName: customer?.name || null,
        pianoId: pianoId || null,
        pianoBrand: piano?.brand || null,
        pianoModel: piano?.model || null,
        serviceId: serviceId || null,
        serviceName: service?.name || null,
        sendConfirmation: sendConfirmation && customer?.email ? true : false
    };
    
    try {
        let response;
        
        if (editingAppointmentId) {
            // Update existing appointment
            response = await fetch(`/api/appointments/${editingAppointmentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appointmentData)
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
        } else {
            // Create new appointment
            response = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appointmentData)
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
        }
        
        closeModal();
        await loadAllEvents();
        renderCalendar();
        
    } catch (err) {
        console.error('Error saving appointment:', err);
        alert('Kon afspraak niet opslaan: ' + err.message);
    }
}

async function deleteEvent(eventId) {
    const appointment = allEvents.find(e => e.id === eventId);
    const title = appointment?.summary || 'this appointment';
    
    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
        return;
    }
    
    try {
        // Instantly remove from UI (optimistic update)
        allEvents = allEvents.filter(e => e.id !== eventId);
        renderCalendar();
        
        // Then delete on server
        const response = await fetch(`/api/appointments/${eventId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            // Restore if failed
            await loadAllEvents();
            renderCalendar();
            throw new Error('Failed to delete appointment');
        }
        
        showToast('Appointment deleted');
        
    } catch (err) {
        console.error('Error deleting appointment:', err);
        alert('Could not delete appointment. Please try again.');
    }
}

// ========== TOAST NOTIFICATION ==========

function showToast(message, duration = 2000) {
    // Remove existing toast
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: #1a1a1a;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(toast);
    
    // Fade in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });
    
    // Fade out and remove
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
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

// Close modal on Escape key + Arrow key navigation
document.addEventListener('keydown', (e) => {
    // Don't navigate when typing in input fields or modal is open
    const isInputFocused = document.activeElement.tagName === 'INPUT' || 
                           document.activeElement.tagName === 'TEXTAREA' ||
                           document.activeElement.tagName === 'SELECT';
    const isModalOpen = document.querySelector('.modal.active') || 
                        document.querySelector('.ios-modal.active');
    
    if (e.key === 'Escape') {
        closeModal();
    }
    
    // Arrow key navigation for calendar (only when not in input and no modal)
    if (!isInputFocused && !isModalOpen) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateCalendar(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateCalendar(1);
        } else if (e.key === 't' || e.key === 'T') {
            // 'T' for Today
            e.preventDefault();
            goToToday();
        }
    }
});

// ========== DRAG & DROP FUNCTIONS ==========

let draggedEventId = null;

function handleDragStart(event, eventId) {
    draggedEventId = eventId;
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', eventId);
    
    // Prevent click event from firing
    event.stopPropagation();
}

function handleDragEnd(event) {
    event.target.classList.remove('dragging');
    draggedEventId = null;
    
    // Remove all drag-over highlights
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    // Add visual feedback
    const slot = event.target.closest('.week-day-slot, .time-slot');
    if (slot && !slot.classList.contains('drag-over')) {
        // Remove from other slots first
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        slot.classList.add('drag-over');
    }
}

function handleDragLeave(event) {
    const slot = event.target.closest('.week-day-slot, .time-slot');
    if (slot && !slot.contains(event.relatedTarget)) {
        slot.classList.remove('drag-over');
    }
}

async function handleDrop(event, dateStr, hour) {
    event.preventDefault();
    
    // Remove visual feedback
    const slot = event.target.closest('.week-day-slot, .time-slot');
    if (slot) slot.classList.remove('drag-over');
    
    const eventId = event.dataTransfer.getData('text/plain') || draggedEventId;
    if (!eventId) return;
    
    // Find the event
    const eventData = allEvents.find(e => e.id === eventId);
    if (!eventData) return;
    
    // Calculate the new start time
    const originalStart = new Date(eventData.start.dateTime || eventData.start.date);
    const originalEnd = new Date(eventData.end.dateTime || eventData.end.date);
    const duration = originalEnd - originalStart; // Duration in ms
    
    // Parse dateStr (YYYY-MM-DD)
    const [year, month, day] = dateStr.split('-').map(Number);
    const newStart = new Date(year, month - 1, day, hour, 0, 0);
    const newEnd = new Date(newStart.getTime() + duration);
    
    // Update the appointment - use flat start/end format that backend expects
    try {
        const res = await fetch(`/api/appointments/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: eventData.summary || eventData.title,
                description: eventData.description,
                location: eventData.location,
                start: newStart.toISOString(),
                end: newEnd.toISOString(),
                customerId: eventData.customerId,
                customerName: eventData.customerName,
                serviceId: eventData.serviceId,
                serviceName: eventData.serviceName,
                pianoId: eventData.pianoId,
                pianoBrand: eventData.pianoBrand,
                pianoModel: eventData.pianoModel,
                status: eventData.status,
                color: eventData.color
            })
        });
        
        if (res.ok) {
            // Update local data and re-render
            await loadAllEvents();
            renderCalendar();
            
            // Show brief feedback
            console.log(`✅ Appointment moved to ${newStart.toLocaleString()}`);
        } else {
            const error = await res.json();
            alert('Could not move appointment: ' + (error.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error moving appointment:', err);
        alert('Could not move appointment. Please try again.');
    }
}
