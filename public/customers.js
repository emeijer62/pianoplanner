// Customers Page JavaScript

let allCustomers = [];
let allServices = [];
let duplicatesData = [];
let theaterHoursEnabled = false;

document.addEventListener('DOMContentLoaded', async () => {
    // Check login
    const userRes = await fetch('/api/user');
    const userData = await userRes.json();
    if (!userData.loggedIn) {
        window.location.href = '/?error=unauthorized';
        return;
    }
    
    await loadCustomers();
    await checkDuplicates();
    await loadServices();
    await checkTheaterHoursEnabled();
    
    // Event listeners
    document.getElementById('add-customer-btn').addEventListener('click', () => openModal());
    document.getElementById('customer-form').addEventListener('submit', handleSubmit);
    document.getElementById('search-input').addEventListener('input', handleSearch);
    document.getElementById('duplicates-btn').addEventListener('click', openDuplicatesModal);
});

async function loadCustomers() {
    const container = document.getElementById('customers-list');
    
    try {
        const response = await fetch('/api/customers');
        const data = await response.json();
        
        allCustomers = data.customers;
        renderCustomers(allCustomers);
        
    } catch (err) {
        console.error('Error loading customers:', err);
        container.innerHTML = '<div class="error-message">Could not load customers</div>';
    }
}

async function loadServices() {
    try {
        const res = await fetch('/api/services');
        if (res.ok) {
            const data = await res.json();
            allServices = Array.isArray(data) ? data : (data.services || []);
            populateServiceDropdown();
        }
    } catch (err) {
        console.error('Error loading services:', err);
    }
}

async function checkTheaterHoursEnabled() {
    try {
        const res = await fetch('/api/settings/company');
        if (res.ok) {
            const data = await res.json();
            theaterHoursEnabled = data.theaterHoursEnabled || false;
            // Show/hide theater hours checkbox based on whether it's enabled in settings
            const theaterGroup = document.getElementById('theater-hours-group');
            if (theaterGroup) {
                theaterGroup.style.display = theaterHoursEnabled ? 'block' : 'none';
            }
        }
    } catch (err) {
        console.error('Error checking theater hours:', err);
    }
}

function populateServiceDropdown() {
    const select = document.getElementById('customer-default-service');
    if (!select) return;
    
    // Keep the first "None" option
    select.innerHTML = '<option value="">None (customer chooses from all services)</option>';
    
    allServices.forEach(service => {
        const option = document.createElement('option');
        option.value = service.id;
        option.textContent = service.name;
        select.appendChild(option);
    });
}

function renderCustomers(customers) {
    const container = document.getElementById('customers-list');
    
    // Update stats
    const totalEl = document.getElementById('stat-total');
    const monthEl = document.getElementById('stat-month');
    const pianosEl = document.getElementById('stat-pianos');
    
    if (totalEl) totalEl.textContent = allCustomers.length;
    if (pianosEl) pianosEl.textContent = allCustomers.filter(c => c.pianos?.length > 0).length;
    
    // Count customers created this month
    const now = new Date();
    const thisMonth = allCustomers.filter(c => {
        if (!c.createdAt) return false;
        const created = new Date(c.createdAt);
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length;
    if (monthEl) monthEl.textContent = thisMonth;
    
    if (customers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <h3 class="empty-state-title">No customers yet</h3>
                <p class="empty-state-text">Add your first customer to get started</p>
                <button onclick="openModal()" class="btn btn-primary">+ Add Customer</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = customers.map(customer => {
        const address = customer.address || {};
        return `
        <div class="list-item" data-customer-id="${customer.id}">
            <div class="list-item-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-weight: 600;">
                ${(customer.name || '?').charAt(0).toUpperCase()}
            </div>
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(customer.name || '')}</div>
                <div class="list-item-subtitle">
                    ${address.city || 'No city'} 
                    ${customer.phone ? '• ' + customer.phone : ''} 
                    ${customer.pianos?.length ? '• 🎹 ' + customer.pianos.length : ''}
                </div>
            </div>
            <div class="list-item-meta" onclick="event.stopPropagation();">
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary btn-small" onclick="openModal('${customer.id}')">Edit</button>
                    <button class="btn btn-small" style="background: #fee2e2; color: #dc2626;" onclick="deleteCustomer('${customer.id}', '${escapeHtml(customer.name || '').replace(/'/g, "\\'")}')">Delete</button>
                    <a href="/booking.html?customer=${customer.id}" class="btn btn-primary btn-small">+ Appointment</a>
                </div>
            </div>
        </div>
    `}).join('');
    
    // Add scroll-aware tap handlers for mobile
    setupCustomerTapHandlers();
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
        renderCustomers(allCustomers);
        return;
    }
    
    const filtered = allCustomers.filter(c => 
        c.name.toLowerCase().includes(query) ||
        (c.email && c.email.toLowerCase().includes(query)) ||
        (c.phone && c.phone.includes(query)) ||
        (c.address.city && c.address.city.toLowerCase().includes(query))
    );
    
    renderCustomers(filtered);
}

function openModal(customerId = null) {
    const modal = document.getElementById('customer-modal');
    const form = document.getElementById('customer-form');
    const deleteBtn = document.getElementById('delete-customer-btn');
    const theaterGroup = document.getElementById('theater-hours-group');
    
    form.reset();
    document.getElementById('customer-id').value = '';
    
    // Show/hide theater hours based on whether it's enabled in settings
    if (theaterGroup) {
        theaterGroup.style.display = theaterHoursEnabled ? 'block' : 'none';
    }
    
    if (customerId) {
        // Convert to string for comparison since onclick passes string
        const customer = allCustomers.find(c => String(c.id) === String(customerId));
        if (customer) {
            document.getElementById('modal-title').textContent = 'Edit Customer';
            document.getElementById('customer-id').value = customer.id;
            document.getElementById('customer-name').value = customer.name || '';
            document.getElementById('customer-email').value = customer.email || '';
            document.getElementById('customer-phone').value = customer.phone || '';
            // Safely access address properties
            const address = customer.address || {};
            document.getElementById('customer-street').value = address.street || '';
            document.getElementById('customer-postalcode').value = address.postalCode || '';
            document.getElementById('customer-city').value = address.city || '';
            document.getElementById('customer-notes').value = customer.notes || '';
            document.getElementById('customer-default-service').value = customer.defaultServiceId || '';
            document.getElementById('customer-theater-hours').checked = customer.useTheaterHours || false;
            // Show delete button when editing
            if (deleteBtn) deleteBtn.style.display = 'block';
        }
    } else {
        document.getElementById('modal-title').textContent = 'New Customer';
        document.getElementById('customer-theater-hours').checked = false;
        // Hide delete button for new customer
        if (deleteBtn) deleteBtn.style.display = 'none';
    }
    
    modal.classList.add('active');
}

// Delete customer from within the modal
async function deleteCurrentCustomer() {
    const id = document.getElementById('customer-id').value;
    const name = document.getElementById('customer-name').value;
    
    if (!id) return;
    
    await deleteCustomer(id, name);
    closeModal();
}

function closeModal() {
    document.getElementById('customer-modal').classList.remove('active');
}

async function handleSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('customer-id').value;
    const data = {
        name: document.getElementById('customer-name').value,
        email: document.getElementById('customer-email').value,
        phone: document.getElementById('customer-phone').value,
        street: document.getElementById('customer-street').value,
        postalCode: document.getElementById('customer-postalcode').value,
        city: document.getElementById('customer-city').value,
        notes: document.getElementById('customer-notes').value,
        defaultServiceId: document.getElementById('customer-default-service').value || null,
        useTheaterHours: document.getElementById('customer-theater-hours').checked
    };
    
    try {
        const url = id ? `/api/customers/${id}` : '/api/customers';
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) throw new Error('Save failed');
        
        closeModal();
        await loadCustomers();
        
    } catch (err) {
        console.error('Error saving customer:', err);
        alert('Could not save customer. Please try again.');
    }
}

// Scroll-aware tap handler to prevent accidental navigation while scrolling
let touchStartY = 0;
let touchStartTime = 0;
const SCROLL_THRESHOLD = 10; // pixels moved to count as scroll
const TAP_TIMEOUT = 300; // max ms for a tap

function setupCustomerTapHandlers() {
    const container = document.getElementById('customers-list');
    if (!container) return;
    
    container.querySelectorAll('.list-item[data-customer-id]').forEach(item => {
        const customerId = item.dataset.customerId;
        
        // Touch events for mobile
        item.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
        }, { passive: true });
        
        item.addEventListener('touchend', (e) => {
            const touchEndY = e.changedTouches[0].clientY;
            const touchDuration = Date.now() - touchStartTime;
            const touchDistance = Math.abs(touchEndY - touchStartY);
            
            // Only navigate if it was a quick tap without much movement
            if (touchDistance < SCROLL_THRESHOLD && touchDuration < TAP_TIMEOUT) {
                viewCustomer(customerId);
            }
        }, { passive: true });
        
        // Click for desktop (mouse)
        item.addEventListener('click', (e) => {
            // Skip if this was a touch event (already handled)
            if (e.sourceCapabilities?.firesTouchEvents) return;
            viewCustomer(customerId);
        });
    });
}

function viewCustomer(customerId) {
    window.location.href = `/customer-detail.html?id=${customerId}`;
}

async function deleteCustomer(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/customers/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Delete failed');
        
        await loadCustomers();
        
    } catch (err) {
        console.error('Error deleting customer:', err);
        alert('Could not delete customer.');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== DUPLICATES ====================

async function checkDuplicates() {
    try {
        const response = await fetch('/api/customers/duplicates');
        const data = await response.json();
        
        duplicatesData = data.duplicates || [];
        const count = duplicatesData.length;
        
        const btn = document.getElementById('duplicates-btn');
        const countSpan = document.getElementById('duplicate-count');
        
        if (count > 0) {
            btn.style.display = 'inline-flex';
            countSpan.textContent = count;
        } else {
            btn.style.display = 'none';
        }
    } catch (err) {
        console.error('Error checking duplicates:', err);
    }
}

function openDuplicatesModal() {
    const modal = document.getElementById('duplicates-modal');
    const container = document.getElementById('duplicates-list');
    
    if (duplicatesData.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No duplicates found!</p></div>';
    } else {
        container.innerHTML = duplicatesData.map((dup, index) => `
            <div class="duplicate-group" style="background: var(--gray-50); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <strong>${dup.matchType === 'email' ? '📧 ' + escapeHtml(dup.email) : '👤 ' + escapeHtml(dup.name)}</strong>
                    <span style="background: var(--gray-200); padding: 4px 12px; border-radius: 20px; font-size: 12px;">${dup.count} duplicates</span>
                </div>
                <div class="duplicate-customers" style="display: flex; flex-direction: column; gap: 8px;">
                    ${dup.customers.map((c, i) => `
                        <div class="duplicate-customer" style="background: white; border-radius: 8px; padding: 12px; border: 2px solid ${i === 0 ? 'var(--accent)' : 'transparent'};">
                            <div style="display: flex; justify-content: space-between; align-items: start;">
                                <div>
                                    <strong>${escapeHtml(c.name)}</strong>
                                    ${i === 0 ? '<span style="background: var(--accent); color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; margin-left: 8px;">KEEP</span>' : ''}
                                    <div style="color: var(--text-secondary); font-size: 13px; margin-top: 4px;">
                                        ${c.phone || 'No phone'} • ${c.address?.city || 'No city'}
                                    </div>
                                    <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">
                                        📅 ${c.appointmentCount} appointments • 🎹 ${c.pianoCount} pianos
                                        • Created: ${new Date(c.createdAt).toLocaleDateString('nl-NL')}
                                    </div>
                                </div>
                                ${i > 0 ? `
                                    <button class="btn btn-small" style="background: #ff9500; color: white;" onclick="mergeCustomer('${dup.customers[0].id}', '${c.id}', '${escapeHtml(c.name)}')">
                                        ↗️ Merge into first
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }
    
    modal.classList.add('active');
}

function closeDuplicatesModal() {
    document.getElementById('duplicates-modal').classList.remove('active');
}

async function mergeCustomer(targetId, sourceId, sourceName) {
    if (!confirm(`Are you sure you want to merge "${sourceName}" into the first customer?\n\nAll appointments, pianos and notes will be transferred. This cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/customers/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetId, sourceId })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Merge failed');
        }
        
        alert('Customers merged successfully!');
        
        // Refresh data
        closeDuplicatesModal();
        await loadCustomers();
        await checkDuplicates();
        
        // Reopen modal if there are more duplicates
        if (duplicatesData.length > 0) {
            openDuplicatesModal();
        }
        
    } catch (err) {
        console.error('Error merging customers:', err);
        alert('Could not merge customers: ' + err.message);
    }
}

// Close modal when clicking outside
document.getElementById('customer-modal').addEventListener('click', (e) => {
    if (e.target.id === 'customer-modal') closeModal();
});

document.getElementById('duplicates-modal').addEventListener('click', (e) => {
    if (e.target.id === 'duplicates-modal') closeDuplicatesModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closeDuplicatesModal();
    }
});
