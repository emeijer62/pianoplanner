// Dashboard JavaScript met Kalender Views
let currentUser = null;
let isAdmin = false;
let subscription = null;
let allEvents = [];
let currentView = 'week';
let currentDate = new Date();

const DAYS_NL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_NL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Auto-sync cooldown (5 minutes)
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
        alert('An error occurred. Please try again.');
    }
    
    // Event listeners
    document.getElementById('add-event-btn').addEventListener('click', openModal);
    document.getElementById('event-form').addEventListener('submit', handleEventSubmit);
});

// Automatische sync met Google Calendar
async function autoSyncCalendar() {
    try {
        // Check if sync is enabled
        const settingsRes = await fetch('/api/calendar/sync-settings');
        if (!settingsRes.ok) return;
        
        const { settings } = await settingsRes.json();
        if (!settings?.enabled) return;
        
        // Check cooldown (no more than every 5 minutes)
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
                console.log(`✅ Auto-sync: ${result.synced} items synchronized`);
                // Reload events if something was synchronized
                await loadAllEvents();
                renderCalendar();
            } else {
                console.log('✅ Auto-sync: everything up-to-date');
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
        
        const response = await fetch(`/api/appointments?start=${startDate.toISOString()}&end=${endDate.toISOString()}`);
        
        if (!response.ok) {
            throw new Error('Failed to load appointments');
        }
        
        // The API already returns the correct format (with summary, start.dateTime, etc.)
        allEvents = await response.json();
        
        console.log(`📅 ${allEvents.length} appointments loaded`);
        
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
    
    // Format date for data attribute
    const dateStr = formatDateForInput(currentDate);
    
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
            <div class="time-slot" data-date="${dateStr}" data-hour="${hour}" onclick="openModalWithTime(this)">
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
        const dateStr = formatDateForInput(day);
        
        html += `<div class="week-day-col">`;
        
        for (let hour = 6; hour <= 22; hour++) {
            const hourEvents = dayEvents.filter(e => {
                const start = new Date(e.start.dateTime || e.start.date);
                return start.getHours() === hour;
            });
            
            html += `
                <div class="week-day-slot" data-date="${dateStr}" data-hour="${hour}" onclick="openModalWithTime(this)">
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
            <div class="calendar-event" style="background: ${color}" title="${escapeHtml(event.summary || 'No title')}${hasTravelTime ? ` (🚗 ${event.travelTimeMinutes} min)` : ''}">
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
        <div class="calendar-event" style="background: ${color}">
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
        
        if (customersRes.ok) customersCache = await customersRes.json();
        if (pianosRes.ok) pianosCache = await pianosRes.json();
        if (servicesRes.ok) servicesCache = await servicesRes.json();
        
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
    
    // Reset piano dropdown
    pianoSelect.innerHTML = '<option value="">-- Select piano (optional) --</option>';
    
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
    document.getElementById('new-customer-address').value = '';
}

async function saveNewCustomer() {
    const name = document.getElementById('new-customer-name').value.trim();
    if (!name) {
        alert('Please enter a customer name');
        return;
    }
    
    const address = document.getElementById('new-customer-address').value;
    // Try to parse address into parts
    const addressParts = address.split(',').map(p => p.trim());
    
    try {
        const response = await fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                email: document.getElementById('new-customer-email').value,
                phone: document.getElementById('new-customer-phone').value,
                street: addressParts[0] || '',
                city: addressParts[1] || '',
                postalCode: addressParts[2] || ''
            })
        });
        
        if (!response.ok) throw new Error('Failed to create customer');
        
        const newCustomer = await response.json();
        
        // Add to cache and dropdown
        customersCache.push(newCustomer);
        populateCustomerDropdown();
        
        // Select the new customer
        document.getElementById('event-customer').value = newCustomer.id;
        onCustomerChange();
        
        // Hide form
        cancelNewCustomer();
        
        // Set location from new customer address
        if (address) {
            document.getElementById('event-location').value = address;
        }
        
    } catch (err) {
        console.error('Error creating customer:', err);
        alert('Could not create customer. Please try again.');
    }
}

function setupNewCustomerAutocomplete() {
    const input = document.getElementById('new-customer-address');
    const suggestions = document.getElementById('new-customer-suggestions');
    
    let debounceTimer;
    
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim();
        
        if (query.length < 3) {
            suggestions.style.display = 'none';
            return;
        }
        
        debounceTimer = setTimeout(async () => {
            try {
                const response = await fetch(`/api/booking/autocomplete?input=${encodeURIComponent(query)}`);
                if (!response.ok) return;
                
                const predictions = await response.json();
                
                if (predictions.length === 0) {
                    suggestions.style.display = 'none';
                    return;
                }
                
                suggestions.innerHTML = predictions.map(p => `
                    <div class="suggestion-item" data-place-id="${p.placeId}">
                        ${escapeHtml(p.description)}
                    </div>
                `).join('');
                
                suggestions.style.display = 'block';
                
                suggestions.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('mousedown', async (e) => {
                        e.preventDefault();
                        input.value = item.textContent.trim();
                        suggestions.style.display = 'none';
                    });
                });
                
            } catch (err) {
                console.error('Autocomplete error:', err);
            }
        }, 300);
    });
    
    input.addEventListener('blur', () => {
        setTimeout(() => { suggestions.style.display = 'none'; }, 200);
    });
}

function openModal() {
    document.getElementById('event-modal').style.display = 'flex';
    
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

function closeModal() {
    document.getElementById('event-modal').style.display = 'none';
    document.getElementById('event-form').reset();
    document.getElementById('new-customer-form').style.display = 'none';
    document.getElementById('event-piano').innerHTML = '<option value="">-- Select piano (optional) --</option>';
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
    
    // Get customer name from cache
    const customer = customersCache.find(c => c.id === customerId);
    const piano = pianosCache.find(p => p.id === pianoId);
    const service = servicesCache.find(s => s.id === serviceId);
    
    try {
        const response = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
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
                serviceName: service?.name || null
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
        alert('Could not create appointment. Please try again.');
    }
}

async function deleteEvent(eventId) {
    if (!confirm('Are you sure you want to delete this appointment?')) {
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
        alert('Could not delete appointment. Please try again.');
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
