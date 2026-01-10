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
        const passwordSectionDesc = document.getElementById('passwordSectionDesc');
        const passwordSubmitBtn = document.getElementById('passwordSubmitBtn');
        
        if (profile.authType === 'google' && !profile.hasPassword) {
            // Google user without password - can set password
            if (currentPasswordGroup) currentPasswordGroup.style.display = 'none';
            if (passwordSectionDesc) passwordSectionDesc.textContent = 'You are logged in via Google. Set a password to also log in with email/password.';
            if (passwordSubmitBtn) passwordSubmitBtn.textContent = '🔐 Set Password';
        } else {
            // Normal situation - change password
            if (currentPasswordGroup) currentPasswordGroup.style.display = 'block';
            if (passwordSectionDesc) passwordSectionDesc.textContent = 'Enter your current password to set a new password.';
            if (passwordSubmitBtn) passwordSubmitBtn.textContent = '🔐 Change Password';
        }
        
    } catch (error) {
        console.error('Could not load profile:', error);
    }
    
    // Load timezone setting
    await loadTimezone();
}

// ========== TIMEZONE SETTINGS ==========

async function loadTimezone() {
    try {
        const response = await fetch('/api/user');
        if (!response.ok) return;
        
        const data = await response.json();
        const timezone = data.user?.timezone || 'Europe/Amsterdam';
        
        const timezoneSelect = document.getElementById('user-timezone');
        const timezoneBadge = document.getElementById('timezone-badge');
        
        if (timezoneSelect) {
            // Try to select the timezone, if not found it'll stay on default
            const option = timezoneSelect.querySelector(`option[value="${timezone}"]`);
            if (option) {
                timezoneSelect.value = timezone;
            }
        }
        
        if (timezoneBadge) {
            // Show friendly timezone name
            const friendlyName = timezone.split('/').pop().replace('_', ' ');
            timezoneBadge.textContent = friendlyName;
        }
    } catch (error) {
        console.error('Error loading timezone:', error);
    }
}

function detectTimezone() {
    try {
        const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const timezoneSelect = document.getElementById('user-timezone');
        const detectedSpan = document.getElementById('detected-timezone');
        
        if (timezoneSelect) {
            const option = timezoneSelect.querySelector(`option[value="${detectedTz}"]`);
            if (option) {
                timezoneSelect.value = detectedTz;
                if (detectedSpan) {
                    detectedSpan.textContent = `Detected: ${detectedTz}`;
                    detectedSpan.style.color = 'var(--green-600, #16a34a)';
                }
            } else {
                if (detectedSpan) {
                    detectedSpan.textContent = `${detectedTz} (not in list, but will be saved)`;
                    detectedSpan.style.color = 'var(--orange-600, #ea580c)';
                }
                // Add the detected timezone as an option
                const newOption = document.createElement('option');
                newOption.value = detectedTz;
                newOption.textContent = detectedTz;
                timezoneSelect.appendChild(newOption);
                timezoneSelect.value = detectedTz;
            }
        }
    } catch (error) {
        console.error('Could not detect timezone:', error);
        const detectedSpan = document.getElementById('detected-timezone');
        if (detectedSpan) {
            detectedSpan.textContent = 'Could not detect timezone';
            detectedSpan.style.color = 'var(--red-600, #dc2626)';
        }
    }
}

async function saveTimezone() {
    const timezoneSelect = document.getElementById('user-timezone');
    const timezone = timezoneSelect?.value;
    
    if (!timezone) {
        showAlert('Please select a timezone', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Could not save timezone');
        }
        
        // Update badge
        const timezoneBadge = document.getElementById('timezone-badge');
        if (timezoneBadge) {
            const friendlyName = timezone.split('/').pop().replace('_', ' ');
            timezoneBadge.textContent = friendlyName;
        }
        
        showAlert('🌍 Timezone saved!', 'success');
        
    } catch (error) {
        showAlert(error.message, 'error');
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
            
            // Load logo
            updateLogoPreview(settings.logoUrl);
            
            // Load availability - ondersteun beide formaten (workingHours en availability)
            renderAvailabilityGrid(settings.workingHours || settings.availability);
            
            // Load theater availability
            const theaterEnabled = settings.theaterHoursEnabled || false;
            document.getElementById('theaterHoursEnabled').checked = theaterEnabled;
            document.getElementById('theaterAvailabilitySection').style.display = theaterEnabled ? 'block' : 'none';
            renderTheaterAvailabilityGrid(settings.theaterHours);
            
            // Toggle theater section on checkbox change
            document.getElementById('theaterHoursEnabled').addEventListener('change', (e) => {
                document.getElementById('theaterAvailabilitySection').style.display = e.target.checked ? 'block' : 'none';
            });
        } else {
            console.error('🏢 Failed to load company settings:', await response.text());
        }
    } catch (error) {
        console.error('Could not load company settings:', error);
    }
}

// ========== LOGO UPLOAD ==========

function updateLogoPreview(logoUrl) {
    const preview = document.getElementById('logo-preview');
    const deleteBtn = document.getElementById('logo-delete-btn');
    
    if (logoUrl) {
        preview.innerHTML = `<img src="${logoUrl}" alt="Company logo" style="width: 100%; height: 100%; object-fit: contain;">`;
        preview.style.border = '2px solid #e5e5e5';
        deleteBtn.style.display = 'inline-block';
    } else {
        preview.innerHTML = '<span style="font-size: 40px; color: #ccc;">🏢</span>';
        preview.style.border = '2px dashed #ddd';
        deleteBtn.style.display = 'none';
    }
}

async function uploadLogo(file) {
    const formData = new FormData();
    formData.append('logo', file);
    
    try {
        const response = await fetch('/api/uploads/logo', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }
        
        updateLogoPreview(data.logoUrl);
        showAlert('Logo uploaded successfully!', 'success');
        
    } catch (error) {
        console.error('Logo upload error:', error);
        showAlert('Upload failed: ' + error.message, 'error');
    }
}

async function deleteLogo() {
    if (!confirm('Are you sure you want to remove your logo?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/uploads/logo', {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Delete failed');
        }
        
        updateLogoPreview(null);
        showAlert('Logo removed', 'success');
        
    } catch (error) {
        console.error('Logo delete error:', error);
        showAlert('Could not remove logo: ' + error.message, 'error');
    }
}

// Initialize logo upload input
document.addEventListener('DOMContentLoaded', () => {
    const logoInput = document.getElementById('logo-input');
    if (logoInput) {
        logoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    showAlert('File is too large. Maximum size is 5MB.', 'error');
                    return;
                }
                uploadLogo(file);
            }
        });
    }
});

function renderAvailabilityGrid(availability) {
    const container = document.getElementById('availabilityGrid');
    
    // Dag namen in volgorde zondag (0) t/m zaterdag (6)
    const dayNameKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    // Default availability if none exists
    const defaultAvailability = {
        sunday: { enabled: false, start: '09:00', end: '18:00' },
        monday: { enabled: true, start: '09:00', end: '18:00' },
        tuesday: { enabled: true, start: '09:00', end: '18:00' },
        wednesday: { enabled: true, start: '09:00', end: '18:00' },
        thursday: { enabled: true, start: '09:00', end: '18:00' },
        friday: { enabled: true, start: '09:00', end: '18:00' },
        saturday: { enabled: false, start: '09:00', end: '18:00' }
    };
    
    // Converteer index-based naar dag-naam als nodig
    let avail = availability || defaultAvailability;
    if (avail[0] !== undefined || avail['0'] !== undefined) {
        // Index-based formaat - converteer naar dag-naam
        const converted = {};
        for (let i = 0; i < 7; i++) {
            const dayData = avail[i] || avail[String(i)] || defaultAvailability[dayNameKeys[i]];
            converted[dayNameKeys[i]] = {
                start: dayData.start || '09:00',
                end: dayData.end || '18:00',
                enabled: dayData.available === true || dayData.enabled === true
            };
        }
        avail = converted;
    }
    
    container.innerHTML = DAY_NAMES.map((day, index) => {
        const dayKey = dayNameKeys[index];
        const dayAvail = avail[dayKey] || defaultAvailability[dayKey];
        // Support beide veldnamen: 'enabled' (nieuw) en 'available' (oud)
        const isAvailable = dayAvail.enabled === true || dayAvail.available === true;
        
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
                    <span class="toggle-label ${isAvailable ? 'active' : ''}">${isAvailable ? 'Available' : 'Not available'}</span>
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
        label.classList.add('active');
        startInput.disabled = false;
        endInput.disabled = false;
    } else {
        row.classList.add('disabled');
        label.textContent = 'Not available';
        label.classList.remove('active');
        startInput.disabled = true;
        endInput.disabled = true;
    }
}

// Show toast notification
function showAvailabilityToast(message) {
    const toast = document.getElementById('availabilityToast');
    const messageEl = document.getElementById('toastMessage');
    
    if (messageEl) messageEl.textContent = message;
    if (toast) {
        toast.classList.add('show');
        
        // Initialize icons in toast
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Save weekly availability
async function saveAvailability() {
    const btn = document.getElementById('saveAvailabilityBtn');
    const originalText = btn.innerHTML;
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" style="width: 16px; height: 16px;" class="spin"></i> Saving...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        
        const availability = getAvailabilityFromForm();
        
        // Get current company settings
        const response = await fetch('/api/settings');
        const currentSettings = await response.json();
        
        // Update with new availability
        const updateResponse = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...currentSettings,
                availability: availability
            })
        });
        
        if (!updateResponse.ok) {
            throw new Error('Failed to save availability');
        }
        
        showAvailabilityToast('Weekly availability saved');
        
    } catch (error) {
        console.error('Error saving availability:', error);
        showAvailabilityToast('Failed to save availability');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// Save theater availability
async function saveTheaterAvailability() {
    try {
        const availability = getTheaterAvailabilityFromForm();
        
        // Get current company settings
        const response = await fetch('/api/settings');
        const currentSettings = await response.json();
        
        // Update with new theater availability
        const updateResponse = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...currentSettings,
                theaterHoursEnabled: document.getElementById('theaterHoursEnabled').checked,
                theaterAvailability: availability
            })
        });
        
        if (!updateResponse.ok) {
            throw new Error('Failed to save theater availability');
        }
        
        showAvailabilityToast('Theater availability saved');
        
    } catch (error) {
        console.error('Error saving theater availability:', error);
        showAvailabilityToast('Failed to save theater availability');
    }
}

// Theater availability grid
function renderTheaterAvailabilityGrid(availability) {
    const container = document.getElementById('theaterAvailabilityGrid');
    if (!container) return;
    
    // Dag namen in volgorde zondag (0) t/m zaterdag (6)
    const dayNameKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    // Default theater availability - more flexible hours
    const defaultAvailability = {
        sunday: { enabled: true, start: '08:00', end: '22:00' },
        monday: { enabled: true, start: '08:00', end: '22:00' },
        tuesday: { enabled: true, start: '08:00', end: '22:00' },
        wednesday: { enabled: true, start: '08:00', end: '22:00' },
        thursday: { enabled: true, start: '08:00', end: '22:00' },
        friday: { enabled: true, start: '08:00', end: '22:00' },
        saturday: { enabled: true, start: '08:00', end: '22:00' }
    };
    
    // Converteer index-based naar dag-naam als nodig
    let avail = availability || defaultAvailability;
    if (avail[0] !== undefined || avail['0'] !== undefined) {
        // Index-based formaat - converteer naar dag-naam
        const converted = {};
        for (let i = 0; i < 7; i++) {
            const dayData = avail[i] || avail[String(i)] || defaultAvailability[dayNameKeys[i]];
            converted[dayNameKeys[i]] = {
                start: dayData.start || '08:00',
                end: dayData.end || '22:00',
                enabled: dayData.available === true || dayData.enabled === true
            };
        }
        avail = converted;
    }
    
    container.innerHTML = DAY_NAMES.map((day, index) => {
        const dayKey = dayNameKeys[index];
        const dayAvail = avail[dayKey] || defaultAvailability[dayKey];
        // Support beide veldnamen: 'enabled' (nieuw) en 'available' (oud)
        const isAvailable = dayAvail.enabled === true || dayAvail.available === true;
        
        return `
            <div class="availability-row ${!isAvailable ? 'disabled' : ''}" data-theater-day="${index}">
                <span class="day-name">${day}</span>
                <div class="toggle-container">
                    <label class="toggle-switch">
                        <input type="checkbox" 
                               id="theater-avail-${index}" 
                               ${isAvailable ? 'checked' : ''} 
                               onchange="toggleTheaterDayAvailability(${index}, this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                    <span class="toggle-label">${isAvailable ? 'Available' : 'Not available'}</span>
                </div>
                <input type="time" 
                       id="theater-avail-start-${index}" 
                       value="${dayAvail.start || '08:00'}" 
                       ${!isAvailable ? 'disabled' : ''}>
                <span>tot</span>
                <input type="time" 
                       id="theater-avail-end-${index}" 
                       value="${dayAvail.end || '22:00'}" 
                       ${!isAvailable ? 'disabled' : ''}>
            </div>
        `;
    }).join('');
}

function toggleTheaterDayAvailability(day, isAvailable) {
    const row = document.querySelector(`.availability-row[data-theater-day="${day}"]`);
    const label = row.querySelector('.toggle-label');
    const startInput = document.getElementById(`theater-avail-start-${day}`);
    const endInput = document.getElementById(`theater-avail-end-${day}`);
    
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

function getTheaterAvailabilityFromForm() {
    const availability = {};
    
    for (let i = 0; i < 7; i++) {
        const checkbox = document.getElementById(`theater-avail-${i}`);
        const startInput = document.getElementById(`theater-avail-start-${i}`);
        const endInput = document.getElementById(`theater-avail-end-${i}`);
        
        if (checkbox && startInput && endInput) {
            availability[i] = {
                available: checkbox.checked,
                start: startInput.value,
                end: endInput.value
            };
        }
    }
    
    return availability;
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
    
    const theaterHoursEnabled = document.getElementById('theaterHoursEnabled').checked;
    
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
        availability: getAvailabilityFromForm(),
        theaterHoursEnabled: theaterHoursEnabled,
        theaterHours: theaterHoursEnabled ? getTheaterAvailabilityFromForm() : null
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
    
    // Focus op eerste veld na korte delay
    setTimeout(() => {
        document.getElementById('serviceName').focus();
    }, 100);
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
    console.log('deleteService called with id:', id, 'type:', typeof id);
    const service = services.find(s => s.id === id);
    console.log('Found service:', service);
    if (!service) {
        console.log('Service not found in local array, services:', services);
        return;
    }
    
    if (!confirm(`Are you sure you want to delete "${service.name}"?`)) {
        return;
    }
    
    try {
        const url = `/api/settings/services/${id}`;
        console.log('DELETE request to:', url);
        const response = await fetch(url, {
            method: 'DELETE'
        });
        
        console.log('Response status:', response.status);
        
        if (response.ok) {
            showAlert('Service deleted', 'success');
            loadServices();
        } else {
            const errorText = await response.text();
            console.log('Error response:', errorText);
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
        const statusBadge = document.getElementById('booking-status-badge');
        
        enabledCheckbox.checked = bookingSettings.enabled || false;
        
        if (bookingSettings.enabled && data.bookingUrl) {
            optionsDiv.style.display = 'block';
            linkDisplay.style.display = 'block';
            document.getElementById('booking-link-url').value = data.bookingUrl;
            document.getElementById('booking-link-preview').href = data.bookingUrl;
            statusDiv.className = 'sync-status connected';
            statusText.textContent = '✅ Booking link is active';
            // Update header badge
            if (statusBadge) {
                statusBadge.textContent = 'Active';
                statusBadge.className = 'status-badge connected';
            }
        } else {
            optionsDiv.style.display = enabledCheckbox.checked ? 'block' : 'none';
            linkDisplay.style.display = 'none';
            statusDiv.className = 'sync-status disconnected';
            statusText.textContent = '⏸️ Booking link is disabled';
            // Update header badge
            if (statusBadge) {
                statusBadge.textContent = 'Disabled';
                statusBadge.className = 'status-badge disconnected';
            }
        }
        
        // Fill form fields
        const titleEl = document.getElementById('booking-title');
        const descEl = document.getElementById('booking-description');
        const confirmEl = document.getElementById('booking-confirmation');
        const minAdvanceEl = document.getElementById('booking-min-advance');
        const maxAdvanceEl = document.getElementById('booking-max-advance');
        const reqEmailEl = document.getElementById('booking-require-email');
        const reqPhoneEl = document.getElementById('booking-require-phone');
        
        if (titleEl) titleEl.value = bookingSettings.title || 'Schedule Appointment';
        if (descEl) descEl.value = bookingSettings.description || '';
        if (confirmEl) confirmEl.value = bookingSettings.confirmationMessage || 'Thank you for your booking!';
        if (minAdvanceEl) minAdvanceEl.value = bookingSettings.minAdvanceHours || 24;
        if (maxAdvanceEl) maxAdvanceEl.value = bookingSettings.maxAdvanceDays || 60;
        if (reqEmailEl) reqEmailEl.checked = bookingSettings.requireEmail !== false;
        if (reqPhoneEl) reqPhoneEl.checked = bookingSettings.requirePhone !== false;
        
        // Load and render services for booking
        await renderBookingServices();
        
    } catch (error) {
        console.error('Could not load booking settings:', error);
    }
}

async function renderBookingServices() {
    const container = document.getElementById('booking-services-list');
    if (!container) return;
    
    // Get allowed service IDs (default to all if not set)
    const allowedServiceIds = bookingSettings.allowedServiceIds || [];
    const allServicesAllowed = allowedServiceIds.length === 0;
    
    // Fetch services if not already loaded
    if (services.length === 0) {
        try {
            const response = await fetch('/api/settings/services');
            if (response.ok) {
                const data = await response.json();
                services = data.services || data || [];
            }
        } catch (error) {
            console.error('Could not load services:', error);
        }
    }
    
    if (services.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center;">No services available. Add services first.</p>';
        return;
    }
    
    container.innerHTML = services.map(service => {
        const isChecked = allServicesAllowed || allowedServiceIds.includes(service.id);
        return `
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 8px; background: white; border-radius: 6px; border: 1px solid var(--gray-200);">
                <input type="checkbox" class="booking-service-checkbox" value="${service.id}" ${isChecked ? 'checked' : ''}>
                <span class="service-color" style="background: ${service.color}; width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;"></span>
                <span style="flex: 1; font-weight: 500;">${service.name}</span>
                <span style="color: var(--gray-500); font-size: 12px;">${service.duration} min • €${service.price}</span>
            </label>
        `;
    }).join('');
}

async function saveBookingSettings(e) {
    e.preventDefault();
    
    const confirmEl = document.getElementById('booking-confirmation');
    
    // Get selected service IDs
    const serviceCheckboxes = document.querySelectorAll('.booking-service-checkbox');
    const allowedServiceIds = Array.from(serviceCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    
    const settings = {
        enabled: document.getElementById('booking-enabled').checked,
        title: document.getElementById('booking-title').value.trim(),
        description: document.getElementById('booking-description').value.trim(),
        confirmationMessage: confirmEl ? confirmEl.value.trim() : 'Thank you for your booking!',
        minAdvanceHours: parseInt(document.getElementById('booking-min-advance').value),
        maxAdvanceDays: parseInt(document.getElementById('booking-max-advance').value),
        requireEmail: document.getElementById('booking-require-email').checked,
        requirePhone: document.getElementById('booking-require-phone').checked,
        allowedServiceIds: allowedServiceIds,
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

// ========== MICROSOFT CALENDAR SYNC ==========

async function loadMicrosoftCalendarStatus() {
    try {
        const response = await fetch('/api/microsoft/status');
        const data = await response.json();
        
        const statusDiv = document.getElementById('microsoft-calendar-status');
        const syncOptions = document.getElementById('microsoft-sync-options');
        const notConnected = document.getElementById('microsoft-not-connected');
        const statusBadge = document.getElementById('microsoft-status-badge');
        
        if (data.connected) {
            statusDiv.innerHTML = `<strong>✅ Connected to Microsoft Calendar</strong><br>
                <small>Account: ${data.email || 'Microsoft Account'}</small>`;
            
            syncOptions.style.display = 'block';
            notConnected.style.display = 'none';
            statusBadge.textContent = 'Connected';
            statusBadge.className = 'status-badge connected';
        } else {
            statusDiv.innerHTML = '<strong>⚪ Not connected to Microsoft Calendar</strong>';
            
            syncOptions.style.display = 'none';
            notConnected.style.display = 'block';
            statusBadge.textContent = 'Not connected';
            statusBadge.className = 'status-badge disconnected';
        }
    } catch (error) {
        console.error('Error loading Microsoft Calendar status:', error);
    }
}

async function disconnectMicrosoftCalendar() {
    if (!confirm('Are you sure you want to disconnect Microsoft Calendar?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/microsoft/disconnect', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.error) {
            showAlert(data.error, 'error');
            return;
        }
        
        showAlert('Microsoft Calendar disconnected', 'success');
        loadMicrosoftCalendarStatus();
        
    } catch (error) {
        console.error('Error disconnecting Microsoft Calendar:', error);
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
            'Go to <a href="https://myaccount.google.com/apppasswords" target="_blank">Google App Passwords</a>',
            'Log in with your Google account',
            'Click "Select app" → "Mail"',
            'Click "Select device" → "Other" and type "PianoPlanner"',
            'Copy the 16-character password'
        ]
    },
    icloud: {
        name: 'iCloud / Apple Mail',
        instructions: [
            'Go to <a href="https://appleid.apple.com" target="_blank">appleid.apple.com</a>',
            'Log in and go to "Sign-In and Security"',
            'Click "App-Specific Passwords"',
            'Generate a password for "PianoPlanner"',
            'Copy the password'
        ]
    },
    outlook: {
        name: 'Outlook / Microsoft 365',
        instructions: [
            'Go to <a href="https://account.microsoft.com/security" target="_blank">Microsoft Security</a>',
            'Enable 2-factor authentication',
            'Go to "App passwords" and create a new password',
            'Copy the password'
        ]
    },
    custom: {
        name: 'Other provider',
        instructions: [
            'Request SMTP details from your email provider',
            'You will need: SMTP host, port, email and password'
        ]
    }
};

async function loadSmtpSettings() {
    const statusDiv = document.getElementById('smtp-status');
    if (!statusDiv) return; // Skip if element doesn't exist
    
    try {
        const response = await fetch('/api/user-smtp/settings');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        
        const statusDiv = document.getElementById('smtp-status');
        
        if (data.enabled && data.verified) {
            statusDiv.className = 'sync-status connected';
            statusDiv.innerHTML = `<strong>✅ Own email configured</strong><br>
                <small>Emails will be sent from: ${data.smtpUser}</small>`;
            
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
            statusDiv.innerHTML = `<strong>⚠️ Not verified</strong><br>
                <small>Test the connection to activate your settings</small>`;
            
            document.querySelector('input[name="smtpChoice"][value="own"]').checked = true;
            document.getElementById('own-smtp-config').style.display = 'block';
            document.getElementById('smtp-provider').value = data.provider || 'gmail';
            document.getElementById('smtp-email').value = data.smtpUser || '';
            
            updateSmtpProviderInstructions();
        } else {
            statusDiv.className = 'sync-status disconnected';
            statusDiv.innerHTML = `<strong>📧 PianoPlanner email</strong><br>
                <small>Emails are sent via info@pianoplanner.com with your name</small>`;
        }
    } catch (error) {
        // Only log if it's not a network/auth error (those are expected if not on settings page)
        if (error.message !== 'Load failed' && !error.message.includes('401')) {
            console.error('Error loading SMTP settings:', error);
        }
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
            showAlert('Emails will now be sent via PianoPlanner', 'success');
            loadSmtpSettings();
        } catch (error) {
            showAlert('Error saving: ' + error.message, 'error');
        }
        return;
    }
    
    const provider = document.getElementById('smtp-provider').value;
    const email = document.getElementById('smtp-email').value.trim();
    const password = document.getElementById('smtp-password').value;
    const fromName = document.getElementById('smtp-from-name').value.trim();
    
    if (!email) {
        showAlert('Please enter your email address', 'error');
        return;
    }
    
    if (!password && !document.getElementById('smtp-status').innerHTML.includes('configured')) {
        showAlert('Please enter your app-specific password', 'error');
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
            showAlert('SMTP settings saved! Now test the connection.', 'success');
            document.getElementById('smtp-password').value = ''; // Clear password field
            loadSmtpSettings();
        }
    } catch (error) {
        showAlert('Error saving: ' + error.message, 'error');
    }
}

async function testSmtpConnection() {
    const resultDiv = document.getElementById('smtp-test-result');
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#e3f2fd';
    resultDiv.style.border = '1px solid #2196f3';
    resultDiv.innerHTML = '⏳ Testing connection...';
    
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
            showAlert('SMTP test successful! Check your inbox.', 'success');
            loadSmtpSettings();
        } else {
            resultDiv.style.background = '#f8d7da';
            resultDiv.style.border = '1px solid #dc3545';
            resultDiv.innerHTML = `❌ ${data.error}${data.details ? '<br><small>' + data.details + '</small>' : ''}`;
        }
    } catch (error) {
        resultDiv.style.background = '#f8d7da';
        resultDiv.style.border = '1px solid #dc3545';
        resultDiv.innerHTML = '❌ Error: ' + error.message;
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

// ========== EMAIL TEMPLATES ==========

let availableVariables = [];
let currentTemplateType = null;

async function loadEmailTemplates() {
    const container = document.getElementById('email-templates-list');
    if (!container) return;
    
    try {
        const response = await fetch('/api/email-templates');
        if (!response.ok) throw new Error('Kon templates niet laden');
        
        const data = await response.json();
        // API returns 'variables' array with {key, description} objects
        availableVariables = (data.variables || []).map(v => v.key || v);
        const templates = data.templates || [];
        
        // Template labels in Dutch
        const templateLabels = {
            'appointment_confirmation': { name: 'Afspraak Bevestiging', icon: '✅', desc: 'Email naar klant na het maken van een afspraak' },
            'booking_notification': { name: 'Nieuwe Boeking Melding', icon: '📥', desc: 'Email naar jou wanneer iemand online boekt' },
            'appointment_reminder': { name: 'Herinnering', icon: '⏰', desc: 'Email naar klant als herinnering voor afspraak' }
        };
        
        let html = '<div class="template-list" style="display: flex; flex-direction: column; gap: 12px;">';
        
        templates.forEach(template => {
            // API returns 'type' not 'template_type'
            const templateType = template.type || template.template_type;
            const info = templateLabels[templateType] || { name: templateType, icon: '📧', desc: '' };
            const isCustom = template.is_custom;
            
            html += `
                <div class="template-item" style="background: white; border: 1px solid #e5e5e5; border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 20px;">${info.icon}</span>
                            <strong>${info.name}</strong>
                            ${isCustom ? '<span style="background: #d4edda; color: #155724; padding: 2px 8px; border-radius: 12px; font-size: 11px;">Aangepast</span>' : '<span style="background: #e9ecef; color: #6c757d; padding: 2px 8px; border-radius: 12px; font-size: 11px;">Standaard</span>'}
                            ${template.is_active === 0 ? '<span style="background: #f8d7da; color: #721c24; padding: 2px 8px; border-radius: 12px; font-size: 11px;">Uitgeschakeld</span>' : ''}
                        </div>
                        <div style="color: #666; font-size: 13px; margin-top: 4px;">${info.desc}</div>
                        <div style="color: #999; font-size: 12px; margin-top: 4px;">Onderwerp: ${template.subject}</div>
                    </div>
                    <button class="btn btn-secondary" onclick="editTemplate('${templateType}')" style="white-space: nowrap;">
                        ✏️ Bewerken
                    </button>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading templates:', error);
        container.innerHTML = '<div style="color: #dc3545; padding: 20px; text-align: center;">❌ Kon templates niet laden</div>';
    }
}

async function editTemplate(templateType) {
    currentTemplateType = templateType;
    
    const templateLabels = {
        'appointment_confirmation': 'Afspraak Bevestiging',
        'booking_notification': 'Nieuwe Boeking Melding',
        'appointment_reminder': 'Herinnering'
    };
    
    document.getElementById('template-edit-title').textContent = `${templateLabels[templateType] || templateType} Bewerken`;
    
    // Load template data
    try {
        const response = await fetch(`/api/email-templates/${templateType}`);
        if (!response.ok) throw new Error('Kon template niet laden');
        
        const template = await response.json();
        
        document.getElementById('template-subject').value = template.subject || '';
        document.getElementById('template-body').value = template.body_html || '';
        document.getElementById('template-active').checked = template.is_active !== 0;
        
        // Show/hide reset button based on whether it's custom
        document.getElementById('template-reset-btn').style.display = template.is_custom ? 'block' : 'none';
        
    } catch (error) {
        console.error('Error loading template:', error);
        showAlert('Kon template niet laden', 'error');
        return;
    }
    
    // Render available variables
    const varsContainer = document.getElementById('template-variables');
    varsContainer.innerHTML = availableVariables.map(v => 
        `<button type="button" class="btn btn-sm" style="background: #f0f0f5; border: 1px solid #ddd; font-family: monospace; font-size: 12px;" onclick="insertVariable('${v}')">${v}</button>`
    ).join('');
    
    // Clear preview
    document.getElementById('template-preview').innerHTML = '<em style="color: #999;">Klik "Ververs" om een preview te zien</em>';
    
    // Show modal
    document.getElementById('template-edit-modal').style.display = 'flex';
}

function insertVariable(variable) {
    const bodyField = document.getElementById('template-body');
    const cursorPos = bodyField.selectionStart;
    const textBefore = bodyField.value.substring(0, cursorPos);
    const textAfter = bodyField.value.substring(cursorPos);
    bodyField.value = textBefore + variable + textAfter;
    bodyField.focus();
    bodyField.setSelectionRange(cursorPos + variable.length, cursorPos + variable.length);
}

async function refreshTemplatePreview() {
    const subject = document.getElementById('template-subject').value;
    const body = document.getElementById('template-body').value;
    
    try {
        const response = await fetch(`/api/email-templates/${currentTemplateType}/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, body_html: body })
        });
        
        if (!response.ok) throw new Error('Preview mislukt');
        
        const preview = await response.json();
        
        document.getElementById('template-preview').innerHTML = `
            <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #eee;">
                <strong>Onderwerp:</strong> ${preview.subject}
            </div>
            <div>${preview.body_html}</div>
        `;
        
    } catch (error) {
        console.error('Preview error:', error);
        document.getElementById('template-preview').innerHTML = '<span style="color: #dc3545;">❌ Preview kon niet worden geladen</span>';
    }
}

async function saveTemplate() {
    const subject = document.getElementById('template-subject').value.trim();
    const body = document.getElementById('template-body').value.trim();
    const isActive = document.getElementById('template-active').checked;
    
    if (!subject || !body) {
        showAlert('Vul onderwerp en inhoud in', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/email-templates/${currentTemplateType}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject,
                body_html: body,
                is_active: isActive
            })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Opslaan mislukt');
        }
        
        showAlert('Template opgeslagen!', 'success');
        closeTemplateModal();
        loadEmailTemplates();
        
    } catch (error) {
        console.error('Save error:', error);
        showAlert('Opslaan mislukt: ' + error.message, 'error');
    }
}

async function resetTemplateToDefault() {
    if (!confirm('Weet je zeker dat je dit template wilt resetten naar de standaard versie? Je aanpassingen worden verwijderd.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/email-templates/${currentTemplateType}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Reset mislukt');
        }
        
        showAlert('Template gereset naar standaard', 'success');
        closeTemplateModal();
        loadEmailTemplates();
        
    } catch (error) {
        console.error('Reset error:', error);
        showAlert('Reset mislukt: ' + error.message, 'error');
    }
}

function closeTemplateModal() {
    document.getElementById('template-edit-modal').style.display = 'none';
    currentTemplateType = null;
}

// ========== CALENDAR FEED / AGENDA ABONNEMENT ==========

async function loadCalendarFeedSettings() {
    const statusEl = document.getElementById('feed-status');
    if (!statusEl) return; // Skip if element doesn't exist
    
    try {
        const response = await fetch('/api/calendar-feed/settings');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        
        // Even if there's an error property, we can still use the data
        updateCalendarFeedUI(data);
    } catch (error) {
        // Only log if it's not a network/auth error
        if (error.message !== 'Load failed' && !error.message.includes('401')) {
            console.error('Error loading calendar feed settings:', error);
        }
        // Show disabled state on error
        updateCalendarFeedUI({ enabled: false, feedUrl: null });
    }
}

function updateCalendarFeedUI(data) {
    const statusEl = document.getElementById('feed-status');
    const statusText = document.getElementById('feed-status-text');
    const urlDisplay = document.getElementById('feed-url-display');
    const urlInput = document.getElementById('feed-url');
    const instructions = document.getElementById('feed-instructions');
    const enableBtn = document.getElementById('feed-enable-btn');
    const disableBtn = document.getElementById('feed-disable-btn');
    const regenerateBtn = document.getElementById('feed-regenerate-btn');
    const securityNote = document.getElementById('feed-security-note');
    const badge = document.getElementById('feed-status-badge');
    const rangeSettings = document.getElementById('feed-range-settings');
    const startDateInput = document.getElementById('feed-start-date');
    const monthsAheadSelect = document.getElementById('feed-months-ahead');
    
    if (data.enabled && data.feedUrl) {
        // Feed is active
        if (statusEl) statusEl.className = 'sync-status connected';
        if (statusText) statusText.textContent = '✅ Feed is active';
        if (urlDisplay) urlDisplay.style.display = 'block';
        if (urlInput) urlInput.value = data.feedUrl;
        if (instructions) instructions.style.display = 'block';
        if (rangeSettings) rangeSettings.style.display = 'block';
        if (enableBtn) enableBtn.style.display = 'none';
        if (disableBtn) disableBtn.style.display = 'inline-flex';
        if (regenerateBtn) regenerateBtn.style.display = 'inline-flex';
        if (securityNote) securityNote.style.display = 'block';
        if (badge) {
            badge.textContent = 'Active';
            badge.className = 'status-badge connected';
        }
        
        // Populate range settings
        if (startDateInput && data.syncStartDate) {
            startDateInput.value = data.syncStartDate;
        } else if (startDateInput && !data.syncStartDate) {
            // Default: 30 days ago
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            startDateInput.value = thirtyDaysAgo.toISOString().split('T')[0];
        }
        if (monthsAheadSelect && data.syncMonthsAhead) {
            monthsAheadSelect.value = data.syncMonthsAhead;
        }
    } else {
        // Feed is inactive
        if (statusEl) statusEl.className = 'sync-status disconnected';
        if (statusText) statusText.textContent = '⏸️ Feed is inactive';
        if (urlDisplay) urlDisplay.style.display = 'none';
        if (instructions) instructions.style.display = 'none';
        if (rangeSettings) rangeSettings.style.display = 'none';
        if (enableBtn) enableBtn.style.display = 'inline-flex';
        if (disableBtn) disableBtn.style.display = 'none';
        if (regenerateBtn) regenerateBtn.style.display = 'none';
        if (securityNote) securityNote.style.display = 'none';
        if (badge) {
            badge.textContent = 'Inactive';
            badge.className = 'status-badge disconnected';
        }
    }
}

async function saveFeedRangeSettings() {
    const startDate = document.getElementById('feed-start-date').value;
    const monthsAhead = document.getElementById('feed-months-ahead').value;
    
    try {
        const response = await fetch('/api/calendar-feed/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                syncStartDate: startDate,
                syncMonthsAhead: parseInt(monthsAhead)
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert('Sync range saved. Calendar apps will update on next refresh.', 'success');
        } else {
            throw new Error(data.error || 'Could not save settings');
        }
    } catch (error) {
        console.error('Save feed range error:', error);
        showAlert('Could not save range: ' + error.message, 'error');
    }
}

async function enableCalendarFeed() {
    try {
        const btn = document.getElementById('feed-enable-btn');
        btn.disabled = true;
        btn.textContent = '⏳ Enabling...';
        
        const response = await fetch('/api/calendar-feed/enable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert('Calendar feed is now active! Copy the URL to subscribe.', 'success');
            updateCalendarFeedUI({ enabled: true, feedUrl: data.feedUrl });
        } else {
            throw new Error(data.error || 'Could not enable feed');
        }
    } catch (error) {
        console.error('Enable feed error:', error);
        showAlert('Could not enable feed: ' + error.message, 'error');
    } finally {
        const btn = document.getElementById('feed-enable-btn');
        btn.disabled = false;
        btn.textContent = 'Enable Feed';
    }
}

async function disableCalendarFeed() {
    if (!confirm('Are you sure you want to disable the calendar feed? Existing subscriptions will stop working.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/calendar-feed/disable', {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert('Calendar feed disabled', 'success');
            updateCalendarFeedUI({ enabled: false, feedUrl: null });
        } else {
            throw new Error(data.error || 'Could not disable feed');
        }
    } catch (error) {
        console.error('Disable feed error:', error);
        showAlert('Could not disable feed: ' + error.message, 'error');
    }
}

async function regenerateCalendarFeed() {
    if (!confirm('Are you sure you want to generate a new link? The current link will stop working and you need to re-subscribe in your calendar apps.')) {
        return;
    }
    
    try {
        const btn = document.getElementById('feed-regenerate-btn');
        btn.disabled = true;
        btn.textContent = '⏳ Generating...';
        
        const response = await fetch('/api/calendar-feed/regenerate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert('New feed link generated. Remember to re-subscribe!', 'success');
            updateCalendarFeedUI({ enabled: true, feedUrl: data.feedUrl });
        } else {
            throw new Error(data.error || 'Could not regenerate feed');
        }
    } catch (error) {
        console.error('Regenerate feed error:', error);
        showAlert('Could not generate new link: ' + error.message, 'error');
    } finally {
        const btn = document.getElementById('feed-regenerate-btn');
        btn.disabled = false;
        btn.textContent = '🔄 New Link';
    }
}

function copyFeedUrl() {
    const urlInput = document.getElementById('feed-url');
    urlInput.select();
    document.execCommand('copy');
    
    // Visual feedback
    const btn = event.target.closest('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '✅ Copied!';
    setTimeout(() => {
        btn.innerHTML = originalText;
    }, 2000);
}

// ========== CALENDAR EXPORT / BACKUP ==========

function exportCalendar() {
    const fromDate = document.getElementById('export-from').value;
    const toDate = document.getElementById('export-to').value;
    
    // Build URL with optional date params
    let url = '/api/calendar-feed/export';
    const params = new URLSearchParams();
    
    if (fromDate) params.append('from', fromDate);
    if (toDate) params.append('to', toDate);
    
    if (params.toString()) {
        url += '?' + params.toString();
    }
    
    // Trigger download
    window.location.href = url;
    
    showAlert('Downloading calendar...', 'success');
}

// Set default export dates on page load
function initExportDates() {
    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(today.getFullYear() + 1);
    
    // Format as YYYY-MM-DD
    document.getElementById('export-from').value = oneYearAgo.toISOString().split('T')[0];
    document.getElementById('export-to').value = oneYearFromNow.toISOString().split('T')[0];
}

// ========== TRAVEL SETTINGS ==========

let travelSettings = {};

async function loadTravelSettings() {
    try {
        const response = await fetch('/api/settings/travel');
        if (!response.ok) throw new Error('Could not load travel settings');
        
        const data = await response.json();
        travelSettings = data.settings || {};
        
        // Update UI
        const enabledCheckbox = document.getElementById('travel-enabled');
        const optionsDiv = document.getElementById('travel-options');
        const statusBadge = document.getElementById('travel-status-badge');
        
        if (enabledCheckbox) {
            enabledCheckbox.checked = travelSettings.enabled || false;
        }
        
        if (optionsDiv) {
            optionsDiv.style.display = travelSettings.enabled ? 'block' : 'none';
        }
        
        if (statusBadge) {
            if (travelSettings.enabled) {
                statusBadge.textContent = 'Active';
                statusBadge.className = 'status-badge connected';
            } else {
                statusBadge.textContent = 'Disabled';
                statusBadge.className = 'status-badge disconnected';
            }
        }
        
        // Fill form fields
        const maxBookingEl = document.getElementById('travel-max-booking');
        const farMessageEl = document.getElementById('travel-far-message');
        const maxBetweenEl = document.getElementById('travel-max-between');
        
        if (maxBookingEl) maxBookingEl.value = travelSettings.maxBookingTravelMinutes || '';
        if (farMessageEl) farMessageEl.value = travelSettings.farLocationMessage || '';
        if (maxBetweenEl) maxBetweenEl.value = travelSettings.maxBetweenTravelMinutes || '';
        
    } catch (error) {
        console.error('Could not load travel settings:', error);
    }
}

async function saveTravelSettings(e) {
    e.preventDefault();
    
    const settings = {
        enabled: document.getElementById('travel-enabled').checked,
        maxBookingTravelMinutes: document.getElementById('travel-max-booking').value || null,
        farLocationMessage: document.getElementById('travel-far-message').value.trim() || null,
        maxBetweenTravelMinutes: document.getElementById('travel-max-between').value || null
    };
    
    try {
        const response = await fetch('/api/settings/travel', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Could not save settings');
        }
        
        showAlert('Travel settings saved!', 'success');
        
        // Update UI with new settings
        await loadTravelSettings();
        
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

function setupTravelToggle() {
    const checkbox = document.getElementById('travel-enabled');
    const optionsDiv = document.getElementById('travel-options');
    
    if (checkbox && optionsDiv) {
        checkbox.addEventListener('change', () => {
            optionsDiv.style.display = checkbox.checked ? 'block' : 'none';
        });
    }
}

// ========== INITIALIZATION ==========

document.addEventListener('DOMContentLoaded', async () => {
    if (await checkAuth()) {
        loadCompanySettings();
        loadServices();
        loadProfileSettings();
        loadBookingSettings();
        loadTravelSettings();
        loadAppleCalendarStatus();
        loadMicrosoftCalendarStatus();
        loadSmtpSettings();
        loadCalendarFeedSettings();
        loadEmailTemplates();
        initExportDates();
        loadCalendarDisplaySettings();
        
        // Event listeners
        document.getElementById('companyForm').addEventListener('submit', saveCompanySettings);
        document.getElementById('serviceForm').addEventListener('submit', saveService);
        document.getElementById('profileForm').addEventListener('submit', saveProfile);
        document.getElementById('passwordForm').addEventListener('submit', changePassword);
        document.getElementById('bookingSettingsForm').addEventListener('submit', saveBookingSettings);
        document.getElementById('travelSettingsForm').addEventListener('submit', saveTravelSettings);
        
        // Setup booking toggle
        setupBookingToggle();
        
        // Setup travel toggle
        setupTravelToggle();
        
        // Setup SMTP toggle
        setupSmtpToggle();
        
        // Close modal on click outside
        document.getElementById('serviceModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                closeServiceModal();
            }
        });
        
        // ESC key sluit modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const serviceModal = document.getElementById('serviceModal');
                if (serviceModal.classList.contains('active')) {
                    closeServiceModal();
                }
            }
        });
        
        // Prevent form inputs from losing value on blur
        document.getElementById('serviceForm').addEventListener('focusout', (e) => {
            // Don't do anything special, just prevent any weird behavior
            e.stopPropagation();
        });
    }
});

// ========== CALENDAR DISPLAY SETTINGS ==========

function loadCalendarDisplaySettings() {
    // Load from localStorage (these are user preferences, not server-side)
    const startHour = localStorage.getItem('calendarStartHour') || '8';
    const endHour = localStorage.getItem('calendarEndHour') || '18';
    
    const startSelect = document.getElementById('calendar-start-hour');
    const endSelect = document.getElementById('calendar-end-hour');
    
    if (startSelect) startSelect.value = startHour;
    if (endSelect) endSelect.value = endHour;
}

function saveCalendarDisplaySettings() {
    const startHour = document.getElementById('calendar-start-hour').value;
    const endHour = document.getElementById('calendar-end-hour').value;
    
    // Validate: end must be after start
    if (parseInt(endHour) <= parseInt(startHour)) {
        showAlert('End hour must be after start hour', 'error');
        return;
    }
    
    localStorage.setItem('calendarStartHour', startHour);
    localStorage.setItem('calendarEndHour', endHour);
    
    showAlert('Calendar display settings saved!', 'success');
}