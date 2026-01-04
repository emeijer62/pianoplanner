// Dashboard JavaScript
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is logged in
    try {
        const response = await fetch('/api/user');
        const data = await response.json();
        
        if (!data.loggedIn) {
            window.location.href = '/?error=unauthorized';
            return;
        }
        
        currentUser = data.user;
        updateNavbar(currentUser);
        
        // Load data
        await Promise.all([
            loadEvents(),
            loadCalendars()
        ]);
        
    } catch (err) {
        console.error('Error:', err);
        window.location.href = '/?error=unauthorized';
    }
    
    // Event listeners
    document.getElementById('add-event-btn').addEventListener('click', openModal);
    document.getElementById('event-form').addEventListener('submit', handleEventSubmit);
});

function updateNavbar(user) {
    document.getElementById('nav-user-name').textContent = user.name;
    if (user.picture) {
        document.getElementById('nav-user-picture').src = user.picture;
    }
}

async function loadEvents() {
    const container = document.getElementById('events-list');
    
    try {
        const response = await fetch('/api/calendar/events');
        
        if (!response.ok) {
            throw new Error('Failed to load events');
        }
        
        const events = await response.json();
        
        if (events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <p>Geen events in de komende 7 dagen</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = events.map(event => createEventCard(event)).join('');
        
    } catch (err) {
        console.error('Error loading events:', err);
        container.innerHTML = '<div class="error-message">Kon events niet laden</div>';
    }
}

function createEventCard(event) {
    const start = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date);
    const end = event.end.dateTime ? new Date(event.end.dateTime) : new Date(event.end.date);
    
    const dateOptions = { weekday: 'long', day: 'numeric', month: 'long' };
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    
    const dateStr = start.toLocaleDateString('nl-NL', dateOptions);
    const timeStr = event.start.dateTime 
        ? `${start.toLocaleTimeString('nl-NL', timeOptions)} - ${end.toLocaleTimeString('nl-NL', timeOptions)}`
        : 'Hele dag';
    
    return `
        <div class="event-card">
            <h3>${escapeHtml(event.summary || 'Geen titel')}</h3>
            <div class="event-time">📅 ${dateStr}</div>
            <div class="event-time">🕐 ${timeStr}</div>
            ${event.location ? `<div class="event-location">📍 ${escapeHtml(event.location)}</div>` : ''}
            <div class="event-actions">
                <button class="btn btn-small btn-danger" onclick="deleteEvent('${event.id}')">Verwijderen</button>
            </div>
        </div>
    `;
}

async function loadCalendars() {
    const container = document.getElementById('calendars-list');
    
    try {
        const response = await fetch('/api/calendar/calendars');
        
        if (!response.ok) {
            throw new Error('Failed to load calendars');
        }
        
        const calendars = await response.json();
        
        container.innerHTML = calendars.map(cal => `
            <div class="calendar-item">
                <div class="calendar-color" style="background: ${cal.backgroundColor || '#4CAF50'}"></div>
                <span>${escapeHtml(cal.summary)}</span>
            </div>
        `).join('');
        
    } catch (err) {
        console.error('Error loading calendars:', err);
        container.innerHTML = '<div class="error-message">Kon agenda\'s niet laden</div>';
    }
}

// Modal functions
function openModal() {
    document.getElementById('event-modal').style.display = 'flex';
    
    // Set default start time to next hour
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const end = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour later
    
    document.getElementById('event-start').value = formatDateTimeLocal(now);
    document.getElementById('event-end').value = formatDateTimeLocal(end);
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
        const response = await fetch('/api/calendar/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: title,
                description,
                location,
                start: new Date(start).toISOString(),
                end: new Date(end).toISOString()
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to create event');
        }
        
        closeModal();
        await loadEvents();
        
    } catch (err) {
        console.error('Error creating event:', err);
        alert('Kon event niet aanmaken. Probeer het opnieuw.');
    }
}

async function deleteEvent(eventId) {
    if (!confirm('Weet je zeker dat je dit event wilt verwijderen?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/calendar/events/${eventId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete event');
        }
        
        await loadEvents();
        
    } catch (err) {
        console.error('Error deleting event:', err);
        alert('Kon event niet verwijderen. Probeer het opnieuw.');
    }
}

// Utility functions
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
document.getElementById('event-modal').addEventListener('click', (e) => {
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
