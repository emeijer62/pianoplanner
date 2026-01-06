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
        const response = await fetch('/api/settings/company');
        if (response.ok) {
            const settings = await response.json();
            
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

// ========== INITIALIZATION ==========

document.addEventListener('DOMContentLoaded', async () => {
    if (await checkAuth()) {
        loadCompanySettings();
        loadServices();
        loadProfileSettings();
        loadBookingSettings();
        
        // Event listeners
        document.getElementById('companyForm').addEventListener('submit', saveCompanySettings);
        document.getElementById('serviceForm').addEventListener('submit', saveService);
        document.getElementById('profileForm').addEventListener('submit', saveProfile);
        document.getElementById('passwordForm').addEventListener('submit', changePassword);
        document.getElementById('bookingSettingsForm').addEventListener('submit', saveBookingSettings);
        
        // Setup booking toggle
        setupBookingToggle();
        
        // Close modal on click outside
        document.getElementById('serviceModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                closeServiceModal();
            }
        });
    }
});
