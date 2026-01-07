// Customers Page JavaScript

let allCustomers = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Check login
    const userRes = await fetch('/api/user');
    const userData = await userRes.json();
    if (!userData.loggedIn) {
        window.location.href = '/?error=unauthorized';
        return;
    }
    
    await loadCustomers();
    
    // Event listeners
    document.getElementById('add-customer-btn').addEventListener('click', () => openModal());
    document.getElementById('customer-form').addEventListener('submit', handleSubmit);
    document.getElementById('search-input').addEventListener('input', handleSearch);
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
    
    container.innerHTML = customers.map(customer => `
        <div class="list-item" onclick="viewCustomer('${customer.id}')">
            <div class="list-item-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-weight: 600;">
                ${customer.name.charAt(0).toUpperCase()}
            </div>
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(customer.name)}</div>
                <div class="list-item-subtitle">
                    ${customer.address.city || 'No city'} 
                    ${customer.phone ? '• ' + customer.phone : ''} 
                    ${customer.pianos?.length ? '• 🎹 ' + customer.pianos.length : ''}
                </div>
            </div>
            <div class="list-item-meta" onclick="event.stopPropagation();">
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary btn-small" onclick="openModal('${customer.id}')">Edit</button>
                    <a href="/booking.html?customer=${customer.id}" class="btn btn-primary btn-small">+ Appointment</a>
                </div>
            </div>
        </div>
    `).join('');
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
    
    form.reset();
    document.getElementById('customer-id').value = '';
    
    if (customerId) {
        const customer = allCustomers.find(c => c.id === customerId);
        if (customer) {
            document.getElementById('modal-title').textContent = 'Edit Customer';
            document.getElementById('customer-id').value = customer.id;
            document.getElementById('customer-name').value = customer.name;
            document.getElementById('customer-email').value = customer.email || '';
            document.getElementById('customer-phone').value = customer.phone || '';
            document.getElementById('customer-street').value = customer.address.street || '';
            document.getElementById('customer-postalcode').value = customer.address.postalCode || '';
            document.getElementById('customer-city').value = customer.address.city || '';
            document.getElementById('customer-notes').value = customer.notes || '';
        }
    } else {
        document.getElementById('modal-title').textContent = 'New Customer';
    }
    
    modal.classList.add('active');
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
        notes: document.getElementById('customer-notes').value
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

// Close modal when clicking outside
document.getElementById('customer-modal').addEventListener('click', (e) => {
    if (e.target.id === 'customer-modal') closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});
