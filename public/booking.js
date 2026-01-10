// Booking Page JavaScript

let selectedService = null;
let selectedCustomer = null;
let selectedPianos = [];
let foundSlot = null;
let searchTimeout = null;
let allPianos = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Check login
    const userRes = await fetch('/api/user');
    const userData = await userRes.json();
    if (!userData.loggedIn) {
        window.location.href = '/?error=unauthorized';
        return;
    }
    
    // Load services and pianos
    await loadServices();
    await loadAllPianos();
    
    // Event listeners
    document.getElementById('customer-search').addEventListener('input', handleCustomerSearch);
    document.getElementById('customer-form').addEventListener('submit', handleCustomerSubmit);
    document.getElementById('find-slot-btn').addEventListener('click', findAvailableSlot);
    document.getElementById('back-to-date-btn').addEventListener('click', () => showStep('step-datetime'));
    document.getElementById('confirm-booking-btn').addEventListener('click', confirmBooking);
    document.getElementById('skip-piano-btn').addEventListener('click', skipPianoSelection);
    document.getElementById('continue-piano-btn').addEventListener('click', continueToPianoSelection);
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('appointment-date').value = today;
    document.getElementById('appointment-date').min = today;
    
    // Check if customer ID is provided in URL (coming from customer detail page)
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedCustomerId = urlParams.get('customer');
    if (preselectedCustomerId) {
        await preselectCustomer(preselectedCustomerId);
    }
});

// Load all pianos
async function loadAllPianos() {
    try {
        const response = await fetch('/api/pianos');
        const data = await response.json();
        allPianos = Array.isArray(data) ? data : (data.pianos || []);
    } catch (err) {
        console.error('Error loading pianos:', err);
        allPianos = [];
    }
}

async function loadServices() {
    try {
        const response = await fetch('/api/services');
        const data = await response.json();
        
        const grid = document.getElementById('services-grid');
        grid.innerHTML = data.services.map(service => `
            <div class="service-card" data-id="${service.id}" onclick="selectService('${service.id}')">
                <div class="service-card-header">
                    <div class="service-color" style="background: ${service.color}"></div>
                    <h3>${service.name}</h3>
                </div>
                <div class="service-card-meta">
                    <span>⏱️ ${service.duration} min</span>
                    <span>💰 ${service.price > 0 ? '€' + service.price : 'Op aanvraag'}</span>
                </div>
                <div class="service-card-description">${service.description}</div>
            </div>
        `).join('');
        
        // Store services data
        window.servicesData = data.services;
        
    } catch (err) {
        console.error('Error loading services:', err);
    }
}

function selectService(serviceId) {
    // Update UI
    document.querySelectorAll('.service-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelector(`.service-card[data-id="${serviceId}"]`).classList.add('selected');
    
    // Store selection
    selectedService = window.servicesData.find(s => s.id === serviceId);
    
    // If customer is already preselected, go to piano selection
    if (selectedCustomer) {
        showPianoSelectionStep();
    } else {
        // Go to customer step
        showStep('step-customer');
    }
}

async function handleCustomerSearch(e) {
    const query = e.target.value.trim();
    const resultsDiv = document.getElementById('search-results');
    
    if (query.length < 2) {
        resultsDiv.classList.remove('active');
        return;
    }
    
    // Debounce
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            if (data.customers.length === 0) {
                resultsDiv.innerHTML = '<div class="search-result-item">No customers found</div>';
            } else {
                resultsDiv.innerHTML = data.customers.map(customer => `
                    <div class="search-result-item" onclick="selectExistingCustomer('${customer.id}')">
                        <div class="search-result-name">${escapeHtml(customer.name)}</div>
                        <div class="search-result-details">
                            ${customer.address.city || ''} 
                            ${customer.phone ? '• ' + customer.phone : ''} 
                            ${customer.email ? '• ' + customer.email : ''}
                        </div>
                    </div>
                `).join('');
            }
            
            resultsDiv.classList.add('active');
            
        } catch (err) {
            console.error('Search error:', err);
        }
    }, 300);
}

// Preselect customer when coming from customer detail page
async function preselectCustomer(customerId) {
    try {
        const response = await fetch(`/api/customers/${customerId}`);
        if (!response.ok) {
            console.warn('Could not load preselected customer');
            return;
        }
        
        selectedCustomer = await response.json();
        
        // Show customer name in search box
        document.getElementById('customer-search').value = selectedCustomer.name;
        
        // Show a notification that customer is preselected
        const searchBox = document.querySelector('.customer-search-box');
        const notification = document.createElement('div');
        notification.className = 'preselected-notification';
        notification.innerHTML = `
            <span>✅ Klant geselecteerd: <strong>${escapeHtml(selectedCustomer.name)}</strong></span>
            <button onclick="clearPreselectedCustomer()" class="btn btn-small btn-secondary">Andere klant</button>
        `;
        notification.style.cssText = 'background: #e8f5e9; padding: 12px 16px; border-radius: 8px; margin-top: 12px; display: flex; justify-content: space-between; align-items: center;';
        searchBox.appendChild(notification);
        
        // Hide the new customer form
        document.getElementById('customer-form').style.display = 'none';
        document.querySelector('.divider').style.display = 'none';
        
        console.log(`📋 Klant voorgeselecteerd: ${selectedCustomer.name}`);
        
    } catch (err) {
        console.error('Error preselecting customer:', err);
    }
}

// Clear preselected customer and show form again
function clearPreselectedCustomer() {
    selectedCustomer = null;
    document.getElementById('customer-search').value = '';
    document.getElementById('customer-form').style.display = 'block';
    document.querySelector('.divider').style.display = 'block';
    
    // Remove notification
    const notification = document.querySelector('.preselected-notification');
    if (notification) notification.remove();
}

async function selectExistingCustomer(customerId) {
    try {
        const response = await fetch(`/api/customers/${customerId}`);
        selectedCustomer = await response.json();
        
        document.getElementById('search-results').classList.remove('active');
        document.getElementById('customer-search').value = selectedCustomer.name;
        
        // Go to piano selection step
        showPianoSelectionStep();
        
    } catch (err) {
        console.error('Error selecting customer:', err);
    }
}

async function handleCustomerSubmit(e) {
    e.preventDefault();
    
    const customerData = {
        name: document.getElementById('customer-name').value,
        phone: document.getElementById('customer-phone').value,
        email: document.getElementById('customer-email').value,
        street: document.getElementById('customer-street').value,
        postalCode: document.getElementById('customer-postalcode').value,
        city: document.getElementById('customer-city').value
    };
    
    try {
        const response = await fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(customerData)
        });
        
        if (!response.ok) throw new Error('Failed to save customer');
        
        selectedCustomer = await response.json();
        
        // Go to piano selection step (for new customer there won't be pianos, but they can skip)
        showPianoSelectionStep();
        
    } catch (err) {
        console.error('Error saving customer:', err);
        alert('Could not save customer. Please try again.');
    }
}

// Show piano selection step
function showPianoSelectionStep() {
    // Find pianos for this customer
    const customerPianos = allPianos.filter(p => p.customerId === selectedCustomer.id);
    const container = document.getElementById('piano-selection');
    
    selectedPianos = []; // Reset
    
    if (customerPianos.length === 0) {
        container.innerHTML = `
            <div class="no-pianos-message">
                <p>🎹 No pianos registered for this customer yet.</p>
                <p style="font-size: 13px; margin-top: 8px;">You can add pianos later on the Pianos page.</p>
            </div>
        `;
        document.getElementById('continue-piano-btn').style.display = 'none';
        document.getElementById('skip-piano-btn').textContent = 'Continue without piano →';
    } else {
        container.innerHTML = customerPianos.map((piano, index) => {
            const pianoName = `${piano.brand || ''} ${piano.model || ''}`.trim() || 'Piano';
            const typeLabel = piano.type === 'grand' ? 'Grand' : (piano.type === 'upright' ? 'Upright' : 'Digital');
            return `
                <label class="piano-option" onclick="togglePianoSelection(this, '${piano.id}')">
                    <input type="checkbox" value="${piano.id}" ${index === 0 ? 'checked' : ''}>
                    <div class="piano-option-info">
                        <div class="piano-option-name">${escapeHtml(pianoName)}</div>
                        <div class="piano-option-details">
                            ${piano.serialNumber ? 'SN: ' + piano.serialNumber : ''}
                            ${piano.year ? ' • ' + piano.year : ''}
                        </div>
                    </div>
                    <span class="piano-option-badge ${piano.type || 'upright'}">${typeLabel}</span>
                </label>
            `;
        }).join('');
        
        // Auto-select first piano
        if (customerPianos.length > 0) {
            selectedPianos = [customerPianos[0].id];
            document.querySelector('.piano-option').classList.add('selected');
        }
        
        document.getElementById('continue-piano-btn').style.display = 'inline-flex';
        document.getElementById('continue-piano-btn').disabled = selectedPianos.length === 0;
        document.getElementById('skip-piano-btn').textContent = 'Skip (no piano)';
    }
    
    showStep('step-piano');
}

// Toggle piano selection
function togglePianoSelection(element, pianoId) {
    const checkbox = element.querySelector('input[type="checkbox"]');
    checkbox.checked = !checkbox.checked;
    
    if (checkbox.checked) {
        element.classList.add('selected');
        if (!selectedPianos.includes(pianoId)) {
            selectedPianos.push(pianoId);
        }
    } else {
        element.classList.remove('selected');
        selectedPianos = selectedPianos.filter(id => id !== pianoId);
    }
    
    // Update continue button state
    document.getElementById('continue-piano-btn').disabled = selectedPianos.length === 0;
}

// Skip piano selection
function skipPianoSelection() {
    selectedPianos = [];
    updateSelectedInfo();
    showStep('step-datetime');
}

// Continue from piano selection
function continueToPianoSelection() {
    updateSelectedInfo();
    showStep('step-datetime');
}

function updateSelectedInfo() {
    document.getElementById('selected-service-name').textContent = selectedService.name;
    document.getElementById('selected-service-duration').textContent = selectedService.duration + ' min';
    document.getElementById('selected-customer-name').textContent = selectedCustomer.name;
    document.getElementById('selected-customer-city').textContent = selectedCustomer.address.city || '';
    
    // Show selected pianos
    const pianosInfo = document.getElementById('selected-pianos-info');
    const pianosText = document.getElementById('selected-pianos-text');
    
    if (selectedPianos.length > 0) {
        const pianoNames = selectedPianos.map(id => {
            const piano = allPianos.find(p => p.id === id);
            return piano ? `${piano.brand || ''} ${piano.model || ''}`.trim() : 'Piano';
        });
        pianosText.textContent = pianoNames.join(', ');
        pianosInfo.style.display = 'block';
    } else {
        pianosInfo.style.display = 'none';
    }
}

async function findAvailableSlot() {
    const date = document.getElementById('appointment-date').value;
    const resultDiv = document.getElementById('slot-result');
    
    if (!date) {
        alert('Please select a date first');
        return;
    }
    
    resultDiv.innerHTML = '<div class="loading">Checking availability...</div>';
    resultDiv.style.display = 'block';
    
    try {
        const response = await fetch('/api/booking/find-slot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serviceId: selectedService.id,
                customerId: selectedCustomer.id,
                date: date
            })
        });
        
        const data = await response.json();
        
        if (data.available && data.slots && data.slots.length > 0) {
            // Meerdere opties tonen
            const slotsHtml = data.slots.map((slotData, index) => {
                const startTime = new Date(slotData.slot.appointmentStart);
                const endTime = new Date(slotData.slot.appointmentEnd);
                const isFirstChoice = index === 0;
                
                return `
                    <div class="slot-option ${isFirstChoice ? 'recommended' : ''}" 
                         onclick="selectSlotOption(${index})"
                         data-slot-index="${index}"
                         style="background: ${isFirstChoice ? '#dcfce7' : '#f8f9fa'}; 
                                border: 2px solid ${isFirstChoice ? '#22c55e' : '#e5e5e5'}; 
                                border-radius: 10px; padding: 12px; margin-bottom: 10px; 
                                cursor: pointer; transition: all 0.2s ease;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-weight: 600; color: ${isFirstChoice ? '#22c55e' : '#333'}; font-size: 15px;">
                                    ${isFirstChoice ? '⭐ ' : ''}${startTime.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                                </div>
                                <div style="font-size: 18px; font-weight: 500; color: #333; margin-top: 4px;">
                                    ${formatTime(startTime)} - ${formatTime(endTime)}
                                </div>
                            </div>
                            <div style="color: #007AFF; font-size: 24px;">→</div>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Store all slots for selection
            window.availableSlots = data.slots;
            foundSlot = data; // Keep first slot as default
            
            resultDiv.className = 'slot-result slot-found';
            resultDiv.innerHTML = `
                <div style="margin-bottom: 12px;">
                    <div style="font-weight: 600; font-size: 16px; color: #333; margin-bottom: 4px;">
                        ✓ ${data.slots.length} ${data.slots.length === 1 ? 'time' : 'times'} available
                    </div>
                    <div style="font-size: 13px; color: #666;">
                        🚗 ${data.travelInfo.durationText} travel • ⏱️ ${data.service.duration} min service
                    </div>
                </div>
                <div id="slot-options">${slotsHtml}</div>
                <div style="font-size: 12px; color: #888; text-align: center; margin-top: 8px;">
                    Click a time to select it
                </div>
            `;
        } else if (data.available && data.slot) {
            // Fallback: enkele slot (oude formaat)
            foundSlot = data;
            const startTime = new Date(data.slot.appointmentStart);
            const endTime = new Date(data.slot.appointmentEnd);
            
            resultDiv.className = 'slot-result slot-found';
            resultDiv.innerHTML = `
                <div class="slot-time">
                    ${formatTime(startTime)} - ${formatTime(endTime)}
                </div>
                <div>First available time on ${formatDate(startTime)}</div>
                <div class="slot-details">
                    <div class="slot-detail">
                        <span>🚗</span>
                        <span>Travel time: ${data.travelInfo.durationText} (${data.travelInfo.distanceText})</span>
                    </div>
                    <div class="slot-detail">
                        <span>⏱️</span>
                        <span>Service: ${data.service.duration} min</span>
                    </div>
                </div>
                <button class="btn btn-primary" style="margin-top: 1rem;" onclick="proceedToConfirm()">
                    Continue with this time →
                </button>
            `;
        } else {
            // Format error message with i18n support
            let errorMessage = data.message;
            if (data.message === 'not_available_on_day' && typeof data.dayIndex !== 'undefined') {
                const days = window.i18n?.t('calendar.days') || ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const dayName = Array.isArray(days) ? days[data.dayIndex] : days;
                errorMessage = `${window.i18n?.t('booking.notAvailableOn') || 'Not available on'} ${dayName}. ${window.i18n?.t('booking.noSlotsIn14Days') || 'No time found in the next 14 days.'}`;
            } else if (data.message === 'no_slots_found') {
                errorMessage = window.i18n?.t('booking.noSlotsIn14Days') || 'No available time found in the next 14 days';
            }
            
            resultDiv.className = 'slot-result slot-not-found';
            resultDiv.innerHTML = `
                <div>❌ ${errorMessage}</div>
                <p style="margin-top: 0.5rem; color: rgba(255,255,255,0.6);">
                    ${window.i18n?.t('booking.tryDifferentDate') || 'Try selecting a different starting date.'}
                </p>
            `;
        }
        
    } catch (err) {
        console.error('Error finding slot:', err);
        resultDiv.className = 'slot-result slot-not-found';
        resultDiv.innerHTML = '<div>Something went wrong. Please try again.</div>';
    }
}

// Selecteer een slot optie
function selectSlotOption(index) {
    const slotData = window.availableSlots[index];
    if (!slotData) return;
    
    // Update foundSlot met de geselecteerde slot
    foundSlot.slot = slotData.slot;
    foundSlot.foundDate = slotData.foundDate;
    
    // Visual feedback
    document.querySelectorAll('.slot-option').forEach((el, i) => {
        if (i === index) {
            el.style.background = '#dcfce7';
            el.style.borderColor = '#22c55e';
            el.style.transform = 'scale(1.02)';
        } else {
            el.style.background = '#f8f9fa';
            el.style.borderColor = '#e5e5e5';
            el.style.transform = 'scale(1)';
        }
    });
    
    // Ga door naar bevestiging
    setTimeout(() => {
        proceedToConfirm();
    }, 300);
}

function proceedToConfirm() {
    // Fill confirmation details
    document.getElementById('confirm-service').textContent = 
        `${selectedService.name} (${selectedService.duration} min)`;
    document.getElementById('confirm-customer').textContent = 
        `${selectedCustomer.name}`;
    
    // Show piano if selected
    const pianoRow = document.getElementById('confirm-piano-row');
    if (selectedPianos.length > 0) {
        const pianoNames = selectedPianos.map(id => {
            const piano = allPianos.find(p => p.id === id);
            return piano ? `${piano.brand || ''} ${piano.model || ''}`.trim() : 'Piano';
        });
        document.getElementById('confirm-piano').textContent = pianoNames.join(', ');
        pianoRow.style.display = 'flex';
    } else {
        pianoRow.style.display = 'none';
    }
    
    document.getElementById('confirm-location').textContent = 
        `${selectedCustomer.address.street || ''} ${selectedCustomer.address.postalCode || ''} ${selectedCustomer.address.city || ''}`.trim() || 'No address';
    document.getElementById('confirm-travel').textContent = 
        `${foundSlot.travelInfo.durationText} (${foundSlot.travelInfo.distanceText})`;
    
    const startTime = new Date(foundSlot.slot.appointmentStart);
    const endTime = new Date(foundSlot.slot.appointmentEnd);
    document.getElementById('confirm-datetime').textContent = 
        `${formatDate(startTime)} from ${formatTime(startTime)} to ${formatTime(endTime)}`;
    
    showStep('step-confirm');
}

async function confirmBooking() {
    const btn = document.getElementById('confirm-booking-btn');
    btn.disabled = true;
    btn.textContent = 'Booking...';
    
    try {
        const response = await fetch('/api/booking/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serviceId: selectedService.id,
                customerId: selectedCustomer.id,
                pianoId: selectedPianos.length > 0 ? selectedPianos[0] : null,
                pianoIds: selectedPianos,
                appointmentStart: foundSlot.slot.appointmentStart,
                notes: document.getElementById('booking-notes').value
            })
        });
        
        if (!response.ok) throw new Error('Booking failed');
        
        showStep('step-success');
        
    } catch (err) {
        console.error('Error creating booking:', err);
        alert('Could not book appointment. Please try again.');
        btn.disabled = false;
        btn.textContent = '✅ Confirm Appointment';
    }
}

function showStep(stepId) {
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.style.display = 'none';
    });
    document.getElementById(stepId).style.display = 'block';
}

function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.customer-search-box')) {
        document.getElementById('search-results').classList.remove('active');
    }
});
