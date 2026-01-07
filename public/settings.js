/**
 * Settings page JavaScript
 */

// Check login
async function checkAuth() {
    try {
        const response = await fetch('/api/user');
        const data = await response.json();
        
        if (!data.loggedIn) {
            window.location.href = '/';
            return false;
        }
        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/';
        return false;
    }
}

// Show alert
function showAlert(message, type = 'success') {
    const container = document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    // Clear any existing alerts
    container.innerHTML = '';
    container.appendChild(alert);
    
    // Scroll to alert
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        alert.style.opacity = '0';
        alert.style.transition = 'opacity 0.3s ease';
        setTimeout(() => alert.remove(), 300);
    }, 5000);
}

// ========== ACCOUNT/PROFILE SETTINGS ==========

async function loadProfileSettings() {
    try {
        const response = await fetch('/auth/profile');
        if (!response.ok) throw new Error('Could not load profile');
        
        const profile = await response.json();
        
        // Fill profile form
        document.getElementById('profileName').value = profile.name || '';
        document.getElementById('profileEmail').value = profile.email || '';
        
        // Show login method info
        const authTypeInfo = document.getElementById('authTypeInfo');
        if (profile.authType === 'google') {
            authTypeInfo.innerHTML = `
                <span style="color: #4285F4;">🔵 Google Account</span>
                ${profile.hasPassword ? ' + Password set' : ' - <em>No password set</em>'}
            `;
        } else {
            authTypeInfo.innerHTML = '<span style="color: #333;">📧 Email/Password</span>';
        }
        
        // Adjust password section based on situation
        const currentPasswordGroup = document.getElementById('currentPasswordGroup');
        const passwordSectionTitle = document.getElementById('passwordSectionTitle');
        const passwordSectionDesc = document.getElementById('passwordSectionDesc');
        const passwordSubmitBtn = document.getElementById('passwordSubmitBtn');
        
        if (profile.authType === 'google' && !profile.hasPassword) {
            // Google user without password - can set password
            currentPasswordGroup.style.display = 'none';
            passwordSectionTitle.textContent = '🔐 Set Password';
            passwordSectionDesc.textContent = 'You are logged in via Google. Set a password to also log in with email/password.';
            passwordSubmitBtn.textContent = '🔐 Set Password';
        } else {
            // Normal situation - change password
            currentPasswordGroup.style.display = 'block';
            passwordSectionTitle.textContent = '🔐 Change Password';
            passwordSectionDesc.textContent = 'Enter your current password to set a new password.';
            passwordSubmitBtn.textContent = '🔐 Change Password';
        }
        
    } catch (error) {
        console.error('Could not load profile:', error);
    }
}

// Save profile
async function saveProfile(e) {
    e.preventDefault();
    
    const name = document.getElementById('profileName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    
    if (!name || !email) {
        showAlert('Name and email are required', 'error');
        return;
    }
    
    try {
        const response = await fetch('/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Could not save profile');
        }
        
        showAlert('Profile saved!', 'success');
        
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Change password
async function changePassword(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!newPassword || !confirmPassword) {
        showAlert('Please fill in all password fields', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showAlert('New passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showAlert('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        const response = await fetch('/auth/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Could not change password');
        }
        
        showAlert(data.message || 'Password changed!', 'success');
        
        // Reset form
        document.getElementById('passwordForm').reset();
        
        // Reload profile to update UI (for Google users setting password)
        await loadProfileSettings();
        
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// ========== COMPANY PROFILE ==========

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function loadCompanySettings() {
    try {
        // First get user info to see current user ID
        const userResponse = await fetch('/api/user');
        const userData = await userResponse.json();
        console.log('🏢 Current user for company settings:', userData.user?.id, userData.user?.email);
        
        const response = await fetch('/api/settings/company');
        console.log('🏢 Company settings response status:', response.status);
        
        if (response.ok) {
            const settings = await response.json();
            console.log('🏢 Loaded company settings:', settings);
            
            // Fill form
            document.getElementById('companyName').value = settings.name || '';
            document.getElementById('ownerName').value = settings.ownerName || '';
            document.getElementById('email').value = settings.email || '';
            document.getElementById('phone').value = settings.phone || '';
            document.getElementById('street').value = settings.address?.street || '';
            document.getElementById('postalCode').value = settings.address?.postalCode || '';
            document.getElementById('city').value = settings.address?.city || '';
            document.getElementById('country').value = settings.address?.country || 'Netherlands';
            
            // Load availability
            renderAvailabilityGrid(settings.availability);
        } else {
            console.error('🏢 Failed to load company settings:', await response.text());
        }
    } catch (error) {
        console.error('Could not load company settings:', error);
    }
}

function renderAvailabilityGrid(availability) {
    const container = document.getElementById('availabilityGrid');
    
    // Default availability if none exists
    const defaultAvailability = {
        0: { available: false, start: '09:00', end: '18:00' },
        1: { available: true, start: '09:00', end: '18:00' },
        2: { available: true, start: '09:00', end: '18:00' },
        3: { available: true, start: '09:00', end: '18:00' },
        4: { available: true, start: '09:00', end: '18:00' },
        5: { available: true, start: '09:00', end: '18:00' },
        6: { available: false, start: '09:00', end: '18:00' }
    };
    
    const avail = availability || defaultAvailability;
    
    container.innerHTML = DAY_NAMES.map((day, index) => {
        const dayAvail = avail[index] || defaultAvailability[index];
        const isAvailable = dayAvail.available;
        
        return `
            <div class="availability-row ${!isAvailable ? 'disabled' : ''}" data-day="${index}">
                <span class="day-name">${day}</span>
                <div class="toggle-container">
                    <label class="toggle-switch">
                        <input type="checkbox" 
                               id="avail-${index}" 
                               ${isAvailable ? 'checked' : ''} 
                               onchange="toggleDayAvailability(${index}, this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                    <span class="toggle-label">${isAvailable ? 'Available' : 'Not available'}</span>
                </div>
                <input type="time" 
                       id="avail-start-${index}" 
                       value="${dayAvail.start || '09:00'}" 
                       ${!isAvailable ? 'disabled' : ''}>
                <span>tot</span>
                <input type="time" 
                       id="avail-end-${index}" 
                       value="${dayAvail.end || '18:00'}" 
                       ${!isAvailable ? 'disabled' : ''}>
            </div>
        `;
    }).join('');
}

function toggleDayAvailability(day, isAvailable) {
    const row = document.querySelector(`.availability-row[data-day="${day}"]`);
    const label = row.querySelector('.toggle-label');
    const startInput = document.getElementById(`avail-start-${day}`);
    const endInput = document.getElementById(`avail-end-${day}`);
    
    if (isAvailable) {
        row.classList.remove('disabled');
        label.textContent = 'Available';
        startInput.disabled = false;
        endInput.disabled = false;
    } else {
        row.classList.add('disabled');
        label.textContent = 'Not available';
        startInput.disabled = true;
        endInput.disabled = true;
    }
}

function getAvailabilityFromForm() {
    const availability = {};
    
    for (let i = 0; i < 7; i++) {
        availability[i] = {
            available: document.getElementById(`avail-${i}`).checked,
            start: document.getElementById(`avail-start-${i}`).value,
            end: document.getElementById(`avail-end-${i}`).value
        };
    }
    
    return availability;
}

async function saveCompanySettings(e) {
    e.preventDefault();
    
    const settings = {
        name: document.getElementById('companyName').value,
        ownerName: document.getElementById('ownerName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        address: {
            street: document.getElementById('street').value,
            postalCode: document.getElementById('postalCode').value,
            city: document.getElementById('city').value,
            country: document.getElementById('country').value
        },
        availability: getAvailabilityFromForm()
    };
    
    try {
        const response = await fetch('/api/settings/company', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            showAlert('Company profile saved!', 'success');
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showAlert('Could not save company profile', 'error');
        console.error(error);
    }
}

// ========== SERVICES ==========

let services = [];

async function loadServices() {
    try {
        const response = await fetch('/api/settings/services');
        if (response.ok) {
            const data = await response.json();
            services = data.services || data || [];
            renderServices();
        }
    } catch (error) {
        console.error('Could not load services:', error);
    }
}

function renderServices() {
    const container = document.getElementById('servicesList');
    
    if (services.length === 0) {
        container.innerHTML = '<p style="color: #666; padding: 20px; text-align: center;">No services added yet</p>';
        return;
    }
    
    container.innerHTML = services.map(service => `
        <div class="service-item">
            <div class="service-info">
                <h4>
                    <span class="service-color" style="background: ${service.color}"></span>
                    ${service.name}
                </h4>
                <div class="service-meta">
                    <span>⏱️ ${service.duration} min</span>
                    <span>💶 €${service.price}</span>
                    ${service.bufferBefore ? `<span>⏪ +${service.bufferBefore} min before</span>` : ''}
                    ${service.bufferAfter ? `<span>⏩ +${service.bufferAfter} min after</span>` : ''}
                    <span>📊 Total: ${getTotalDuration(service)} min</span>
                </div>
                ${service.description ? `<p style="margin: 8px 0 0; color: #666; font-size: 13px;">${service.description}</p>` : ''}
            </div>
            <div class="service-actions">
                <button class="btn btn-secondary btn-small" onclick="editService('${service.id}')">✏️ Edit</button>
                <button class="btn btn-danger btn-small" onclick="deleteService('${service.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function getTotalDuration(service) {
    return (service.bufferBefore || 0) + service.duration + (service.bufferAfter || 0);
}

function openServiceModal(service = null) {
    const modal = document.getElementById('serviceModal');
    const form = document.getElementById('serviceForm');
    const title = document.getElementById('modalTitle');
    
    form.reset();
    
    if (service) {
        title.textContent = 'Edit Service';
        document.getElementById('serviceId').value = service.id;
        document.getElementById('serviceName').value = service.name;
        document.getElementById('serviceDuration').value = service.duration;
        document.getElementById('servicePrice').value = service.price;
        document.getElementById('bufferBefore').value = service.bufferBefore || 0;
        document.getElementById('bufferAfter').value = service.bufferAfter || 0;
        document.getElementById('serviceDescription').value = service.description || '';
        document.getElementById('serviceColor').value = service.color || '#4CAF50';
    } else {
        title.textContent = 'New Service';
        document.getElementById('serviceId').value = '';
    }
    
    modal.classList.add('active');
}

function closeServiceModal() {
    document.getElementById('serviceModal').classList.remove('active');
}

function editService(id) {
    const service = services.find(s => s.id === id);
    if (service) {
        openServiceModal(service);
    }
}

async function saveService(e) {
    e.preventDefault();
    
    const id = document.getElementById('serviceId').value;
    const serviceData = {
        name: document.getElementById('serviceName').value,
        duration: parseInt(document.getElementById('serviceDuration').value),
        price: parseFloat(document.getElementById('servicePrice').value),
        bufferBefore: parseInt(document.getElementById('bufferBefore').value) || 0,
        bufferAfter: parseInt(document.getElementById('bufferAfter').value) || 0,
        description: document.getElementById('serviceDescription').value,
        color: document.getElementById('serviceColor').value
    };
    
    try {
        let response;
        if (id) {
            // Update existing service
            response = await fetch(`/api/settings/services/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serviceData)
            });
        } else {
            // New service
            response = await fetch('/api/settings/services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serviceData)
            });
        }
        
        if (response.ok) {
            showAlert(id ? 'Service updated!' : 'Service added!', 'success');
            closeServiceModal();
            loadServices();
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showAlert('Could not save service', 'error');
        console.error(error);
    }
}

async function deleteService(id) {
    const service = services.find(s => s.id === id);
    if (!service) return;
    
    if (!confirm(`Are you sure you want to delete "${service.name}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/settings/services/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showAlert('Service deleted', 'success');
            loadServices();
        } else {
            throw new Error('Delete failed');
        }
    } catch (error) {
        showAlert('Could not delete service', 'error');
        console.error(error);
    }
}

// ========== PUBLIC BOOKING LINK ==========

let bookingSettings = {};

async function loadBookingSettings() {
    try {
        const response = await fetch('/api/settings/booking');
        if (!response.ok) throw new Error('Could not load booking settings');
        
        const data = await response.json();
        bookingSettings = data.settings || {};
        
        // Update UI
        const enabledCheckbox = document.getElementById('booking-enabled');
        const optionsDiv = document.getElementById('booking-options');
        const linkDisplay = document.getElementById('booking-link-display');
        const statusDiv = document.getElementById('booking-status');
        const statusText = document.getElementById('booking-status-text');
        
        enabledCheckbox.checked = bookingSettings.enabled || false;
        
        if (bookingSettings.enabled && data.bookingUrl) {
            optionsDiv.style.display = 'block';
            linkDisplay.style.display = 'block';
            document.getElementById('booking-link-url').value = data.bookingUrl;
            document.getElementById('booking-link-preview').href = data.bookingUrl;
            statusDiv.className = 'sync-status connected';
            statusText.textContent = '✅ Booking link is active';
        } else {
            optionsDiv.style.display = enabledCheckbox.checked ? 'block' : 'none';
            linkDisplay.style.display = 'none';
            statusDiv.className = 'sync-status disconnected';
            statusText.textContent = '⏸️ Booking link is disabled';
        }
        
        // Fill form fields
        document.getElementById('booking-title').value = bookingSettings.title || 'Schedule Appointment';
        document.getElementById('booking-description').value = bookingSettings.description || '';
        document.getElementById('booking-confirmation').value = bookingSettings.confirmationMessage || 'Thank you for your booking!';
        document.getElementById('booking-min-advance').value = bookingSettings.minAdvanceHours || 24;
        document.getElementById('booking-max-advance').value = bookingSettings.maxAdvanceDays || 60;
        document.getElementById('booking-require-email').checked = bookingSettings.requireEmail !== false;
        document.getElementById('booking-require-phone').checked = bookingSettings.requirePhone !== false;
        
    } catch (error) {
        console.error('Could not load booking settings:', error);
    }
}

async function saveBookingSettings(e) {
    e.preventDefault();
    
    const settings = {
        enabled: document.getElementById('booking-enabled').checked,
        title: document.getElementById('booking-title').value.trim(),
        description: document.getElementById('booking-description').value.trim(),
        confirmationMessage: document.getElementById('booking-confirmation').value.trim(),
        minAdvanceHours: parseInt(document.getElementById('booking-min-advance').value),
        maxAdvanceDays: parseInt(document.getElementById('booking-max-advance').value),
        requireEmail: document.getElementById('booking-require-email').checked,
        requirePhone: document.getElementById('booking-require-phone').checked,
        slug: bookingSettings.slug  // Keep existing slug
    };
    
    try {
        const response = await fetch('/api/settings/booking', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Could not save settings');
        }
        
        showAlert('Booking settings saved!', 'success');
        
        // Update UI with new settings
        await loadBookingSettings();
        
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

function copyBookingLink() {
    const linkInput = document.getElementById('booking-link-url');
    linkInput.select();
    document.execCommand('copy');
    showAlert('Link copied to clipboard!', 'success');
}

// Toggle booking options visibility
function setupBookingToggle() {
    const enabledCheckbox = document.getElementById('booking-enabled');
    const optionsDiv = document.getElementById('booking-options');
    
    enabledCheckbox.addEventListener('change', () => {
        optionsDiv.style.display = enabledCheckbox.checked ? 'block' : 'none';
    });
}

// ========== APPLE CALENDAR SYNC ==========

async function loadAppleCalendarStatus() {
    try {
        const response = await fetch('/api/apple-calendar/status');
        const data = await response.json();
        
        const statusDiv = document.getElementById('apple-calendar-status');
        const connectForm = document.getElementById('apple-connect-form');
        const syncOptions = document.getElementById('apple-sync-options');
        
        if (data.connected) {
            statusDiv.className = 'sync-status connected';
            statusDiv.innerHTML = `<strong>✅ Connected to Apple Calendar</strong><br>
                <small>Apple ID: ${data.appleId}</small>`;
            
            connectForm.style.display = 'none';
            syncOptions.style.display = 'block';
            
            // Laad calendars
            loadAppleCalendars();
            
            // Laad sync settings
            loadAppleSyncSettings();
        } else {
            statusDiv.className = 'sync-status disconnected';
            statusDiv.innerHTML = '<strong>⚪ Not connected to Apple Calendar</strong>';
            
            connectForm.style.display = 'block';
            syncOptions.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading Apple Calendar status:', error);
    }
}

async function connectAppleCalendar() {
    const appleId = document.getElementById('apple-id').value.trim();
    const appPassword = document.getElementById('apple-password').value.trim();
    
    if (!appleId || !appPassword) {
        showAlert('Please enter your Apple ID and app-specific password', 'error');
        return;
    }
    
    try {
        showAlert('Connecting to Apple Calendar...', 'info');
        
        const response = await fetch('/api/apple-calendar/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appleId, appPassword })
        });
        
        const data = await response.json();
        
        if (data.error) {
            showAlert(data.error + (data.hint ? '\n' + data.hint : ''), 'error');
            return;
        }
        
        showAlert('🍎 Apple Calendar connected successfully!', 'success');
        
        // Clear form
        document.getElementById('apple-id').value = '';
        document.getElementById('apple-password').value = '';
        
        // Reload status
        loadAppleCalendarStatus();
        
    } catch (error) {
        console.error('Error connecting Apple Calendar:', error);
        showAlert('Failed to connect: ' + error.message, 'error');
    }
}

async function disconnectAppleCalendar() {
    if (!confirm('Are you sure you want to disconnect Apple Calendar?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/apple-calendar/disconnect', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.error) {
            showAlert(data.error, 'error');
            return;
        }
        
        showAlert('Apple Calendar disconnected', 'success');
        loadAppleCalendarStatus();
        
    } catch (error) {
        console.error('Error disconnecting Apple Calendar:', error);
        showAlert('Failed to disconnect: ' + error.message, 'error');
    }
}

async function loadAppleCalendars() {
    const selectGroup = document.getElementById('apple-calendar-select-group');
    const select = document.getElementById('appleCalendarSelect');
    
    // Toon de selectie groep meteen
    selectGroup.style.display = 'block';
    select.innerHTML = '<option value="">Loading calendars...</option>';
    
    try {
        const response = await fetch('/api/apple-calendar/calendars');
        const data = await response.json();
        
        if (data.error) {
            console.error('Error loading calendars:', data.error);
            select.innerHTML = '<option value="">Error loading calendars</option>';
            return;
        }
        
        if (!data.calendars || data.calendars.length === 0) {
            select.innerHTML = '<option value="">No calendars found</option>';
            return;
        }
        
        select.innerHTML = '<option value="">Select a calendar...</option>';
        
        for (const calendar of data.calendars) {
            const option = document.createElement('option');
            option.value = calendar.url;
            option.textContent = calendar.name;
            select.appendChild(option);
        }
        
    } catch (error) {
        console.error('Error loading Apple calendars:', error);
        select.innerHTML = '<option value="">Error: ' + error.message + '</option>';
    }
}

async function loadAppleSyncSettings() {
    try {
        const response = await fetch('/api/apple-calendar/sync-settings');
        const data = await response.json();
        
        if (data.settings) {
            // Set sync direction
            const direction = data.settings.syncDirection || 'both';
            document.querySelector(`input[name="appleSyncDirection"][value="${direction}"]`).checked = true;
            
            // Set calendar
            if (data.settings.appleCalendarUrl) {
                document.getElementById('appleCalendarSelect').value = data.settings.appleCalendarUrl;
            }
            
            // Show sync now button if enabled
            if (data.settings.enabled) {
                document.getElementById('apple-sync-now-btn').style.display = 'inline-block';
            }
            
            // Show last sync time
            if (data.settings.lastSync) {
                document.getElementById('apple-last-sync-info').style.display = 'block';
                document.getElementById('apple-last-sync-time').textContent = 
                    new Date(data.settings.lastSync).toLocaleString();
            }
        }
    } catch (error) {
        console.error('Error loading Apple sync settings:', error);
    }
}

async function enableAppleCalendarSync() {
    const direction = document.querySelector('input[name="appleSyncDirection"]:checked')?.value || 'both';
    const calendarUrl = document.getElementById('appleCalendarSelect').value;
    
    if (!calendarUrl) {
        showAlert('Please select a calendar first', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/apple-calendar/sync-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enabled: true,
                syncDirection: direction,
                appleCalendarUrl: calendarUrl
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            showAlert(data.error, 'error');
            return;
        }
        
        showAlert('🍎 Apple Calendar sync enabled!', 'success');
        document.getElementById('apple-sync-now-btn').style.display = 'inline-block';
        
    } catch (error) {
        console.error('Error enabling Apple sync:', error);
        showAlert('Failed to enable sync: ' + error.message, 'error');
    }
}

async function syncAppleNow() {
    try {
        showAlert('🔄 Syncing with Apple Calendar...', 'info');
        
        const response = await fetch('/api/apple-calendar/sync', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.error) {
            showAlert(data.error, 'error');
            return;
        }
        
        let message = `✅ Sync complete! ${data.synced} items synchronized.`;
        if (data.errors && data.errors.length > 0) {
            message += ` (${data.errors.length} errors)`;
        }
        
        showAlert(message, 'success');
        
        // Update last sync time
        document.getElementById('apple-last-sync-info').style.display = 'block';
        document.getElementById('apple-last-sync-time').textContent = new Date().toLocaleString();
        
    } catch (error) {
        console.error('Error syncing Apple Calendar:', error);
        showAlert('Sync failed: ' + error.message, 'error');
    }
}

// ========== USER SMTP SETTINGS ==========

const SMTP_PROVIDER_INSTRUCTIONS = {
    gmail: {
        name: 'Gmail / Google Workspace',
        instructions: [
            'Ga naar <a href="https://myaccount.google.com/apppasswords" target="_blank">Google App Passwords</a>',
            'Log in met je Google account',
            'Klik op "Select app" → "Mail"',
            'Klik op "Select device" → "Other" en typ "PianoPlanner"',
            'Kopieer het 16-cijferige wachtwoord'
        ]
    },
    icloud: {
        name: 'iCloud / Apple Mail',
        instructions: [
            'Ga naar <a href="https://appleid.apple.com" target="_blank">appleid.apple.com</a>',
            'Log in en ga naar "Sign-In and Security"',
            'Klik op "App-Specific Passwords"',
            'Genereer een wachtwoord voor "PianoPlanner"',
            'Kopieer het wachtwoord'
        ]
    },
    outlook: {
        name: 'Outlook / Microsoft 365',
        instructions: [
            'Ga naar <a href="https://account.microsoft.com/security" target="_blank">Microsoft Security</a>',
            'Schakel 2-factor authenticatie in',
            'Ga naar "App passwords" en maak een nieuw wachtwoord',
            'Kopieer het wachtwoord'
        ]
    },
    custom: {
        name: 'Andere provider',
        instructions: [
            'Vraag de SMTP gegevens op bij je email provider',
            'Je hebt nodig: SMTP host, poort, email en wachtwoord'
        ]
    }
};

async function loadSmtpSettings() {
    try {
        const response = await fetch('/api/user-smtp/settings');
        const data = await response.json();
        
        const statusDiv = document.getElementById('smtp-status');
        
        if (data.enabled && data.verified) {
            statusDiv.className = 'sync-status connected';
            statusDiv.innerHTML = `<strong>✅ Eigen email geconfigureerd</strong><br>
                <small>Emails worden verstuurd vanaf: ${data.smtpUser}</small>`;
            
            // Select "own" radio
            document.querySelector('input[name="smtpChoice"][value="own"]').checked = true;
            document.getElementById('own-smtp-config').style.display = 'block';
            
            // Fill in fields
            document.getElementById('smtp-provider').value = data.provider || 'gmail';
            document.getElementById('smtp-email').value = data.smtpUser || '';
            document.getElementById('smtp-from-name').value = data.fromName || '';
            
            updateSmtpProviderInstructions();
        } else if (data.configured && !data.verified) {
            statusDiv.className = 'sync-status';
            statusDiv.style.background = '#fff3cd';
            statusDiv.style.border = '1px solid #ffc107';
            statusDiv.innerHTML = `<strong>⚠️ Niet geverifieerd</strong><br>
                <small>Test de verbinding om je instellingen te activeren</small>`;
            
            document.querySelector('input[name="smtpChoice"][value="own"]').checked = true;
            document.getElementById('own-smtp-config').style.display = 'block';
            document.getElementById('smtp-provider').value = data.provider || 'gmail';
            document.getElementById('smtp-email').value = data.smtpUser || '';
            
            updateSmtpProviderInstructions();
        } else {
            statusDiv.className = 'sync-status disconnected';
            statusDiv.innerHTML = `<strong>📧 PianoPlanner email</strong><br>
                <small>Emails worden verstuurd via info@pianoplanner.com met jouw naam</small>`;
        }
    } catch (error) {
        console.error('Error loading SMTP settings:', error);
    }
}

function updateSmtpProviderInstructions() {
    const provider = document.getElementById('smtp-provider').value;
    const config = SMTP_PROVIDER_INSTRUCTIONS[provider];
    const instructionsDiv = document.getElementById('smtp-provider-instructions');
    
    if (config) {
        instructionsDiv.innerHTML = `
            <strong>📱 Zo stel je ${config.name} in:</strong>
            <ol style="margin: 12px 0 0 20px; color: #444;">
                ${config.instructions.map(i => `<li>${i}</li>`).join('')}
            </ol>
        `;
    }
    
    // Show/hide custom fields
    document.getElementById('smtp-custom-fields').style.display = 
        provider === 'custom' ? 'block' : 'none';
}

async function saveSmtpSettings() {
    const useOwn = document.querySelector('input[name="smtpChoice"]:checked').value === 'own';
    
    if (!useOwn) {
        // Delete SMTP settings to revert to PianoPlanner
        try {
            await fetch('/api/user-smtp/settings', { method: 'DELETE' });
            showAlert('Emails worden nu verstuurd via PianoPlanner', 'success');
            loadSmtpSettings();
        } catch (error) {
            showAlert('Fout bij opslaan: ' + error.message, 'error');
        }
        return;
    }
    
    const provider = document.getElementById('smtp-provider').value;
    const email = document.getElementById('smtp-email').value.trim();
    const password = document.getElementById('smtp-password').value;
    const fromName = document.getElementById('smtp-from-name').value.trim();
    
    if (!email) {
        showAlert('Vul je email adres in', 'error');
        return;
    }
    
    if (!password && !document.getElementById('smtp-status').innerHTML.includes('geconfigureerd')) {
        showAlert('Vul je app-specifiek wachtwoord in', 'error');
        return;
    }
    
    const settings = {
        enabled: true,
        provider: provider,
        smtpUser: email,
        fromEmail: email,
        fromName: fromName || null
    };
    
    // Only send password if provided (allows updating other fields without changing password)
    if (password) {
        settings.smtpPass = password;
    }
    
    // Custom provider needs host/port
    if (provider === 'custom') {
        settings.smtpHost = document.getElementById('smtp-host').value.trim();
        settings.smtpPort = parseInt(document.getElementById('smtp-port').value) || 587;
    }
    
    try {
        const response = await fetch('/api/user-smtp/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        const data = await response.json();
        
        if (data.error) {
            showAlert(data.error, 'error');
        } else {
            showAlert('SMTP instellingen opgeslagen! Test nu de verbinding.', 'success');
            document.getElementById('smtp-password').value = ''; // Clear password field
            loadSmtpSettings();
        }
    } catch (error) {
        showAlert('Fout bij opslaan: ' + error.message, 'error');
    }
}

async function testSmtpConnection() {
    const resultDiv = document.getElementById('smtp-test-result');
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#e3f2fd';
    resultDiv.style.border = '1px solid #2196f3';
    resultDiv.innerHTML = '⏳ Verbinding testen...';
    
    try {
        const response = await fetch('/api/user-smtp/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            resultDiv.style.background = '#d4edda';
            resultDiv.style.border = '1px solid #28a745';
            resultDiv.innerHTML = `✅ ${data.message}`;
            showAlert('SMTP test geslaagd! Check je inbox.', 'success');
            loadSmtpSettings();
        } else {
            resultDiv.style.background = '#f8d7da';
            resultDiv.style.border = '1px solid #dc3545';
            resultDiv.innerHTML = `❌ ${data.error}${data.details ? '<br><small>' + data.details + '</small>' : ''}`;
        }
    } catch (error) {
        resultDiv.style.background = '#f8d7da';
        resultDiv.style.border = '1px solid #dc3545';
        resultDiv.innerHTML = '❌ Fout: ' + error.message;
    }
}

// Setup SMTP radio toggle
function setupSmtpToggle() {
    const radios = document.querySelectorAll('input[name="smtpChoice"]');
    radios.forEach(radio => {
        radio.addEventListener('change', () => {
            document.getElementById('own-smtp-config').style.display = 
                radio.value === 'own' ? 'block' : 'none';
        });
    });
    
    // Setup provider change
    document.getElementById('smtp-provider')?.addEventListener('change', updateSmtpProviderInstructions);
    
    // Initial instructions
    updateSmtpProviderInstructions();
}

// ========== INITIALIZATION ==========

document.addEventListener('DOMContentLoaded', async () => {
    if (await checkAuth()) {
        loadCompanySettings();
        loadServices();
        loadProfileSettings();
        loadBookingSettings();
        loadAppleCalendarStatus();
        loadSmtpSettings();
        
        // Event listeners
        document.getElementById('companyForm').addEventListener('submit', saveCompanySettings);
        document.getElementById('serviceForm').addEventListener('submit', saveService);
        document.getElementById('profileForm').addEventListener('submit', saveProfile);
        document.getElementById('passwordForm').addEventListener('submit', changePassword);
        document.getElementById('bookingSettingsForm').addEventListener('submit', saveBookingSettings);
        
        // Setup booking toggle
        setupBookingToggle();
        
        // Setup SMTP toggle
        setupSmtpToggle();
        
        // Close modal on click outside
        document.getElementById('serviceModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                closeServiceModal();
            }
        });
    }
});
