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
        container.innerHTML = '<div class="error-message">Kon klanten niet laden</div>';
    }
}

function renderCustomers(customers) {
    const container = document.getElementById('customers-list');
    
    if (customers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <p>Nog geen klanten</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = customers.map(customer => `
        <div class="user-card">
            <div class="user-card-header">
                <div class="user-avatar" style="display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
                    ${customer.name.charAt(0).toUpperCase()}
                </div>
                <div class="user-info-main">
                    <h3>${escapeHtml(customer.name)}</h3>
                    <span class="user-email">${escapeHtml(customer.address.city || 'Geen stad')}</span>
                </div>
            </div>
            <div class="user-card-details">
                <div class="user-detail">
                    <span class="detail-label">📧 Email:</span>
                    <span>${customer.email || '-'}</span>
                </div>
                <div class="user-detail">
                    <span class="detail-label">📞 Telefoon:</span>
                    <span>${customer.phone || '-'}</span>
                </div>
                <div class="user-detail">
                    <span class="detail-label">📍 Adres:</span>
                    <span>${customer.address.street || '-'} ${customer.address.postalCode || ''}</span>
                </div>
                <div class="user-detail">
                    <span class="detail-label">🎹 Piano's:</span>
                    <span>${customer.pianos?.length || 0}</span>
                </div>
            </div>
            <div class="user-card-actions">
                <button class="btn btn-small btn-secondary" onclick="openModal('${customer.id}')">
                    ✏️ Bewerken
                </button>
                <a href="/booking.html" class="btn btn-small btn-primary">
                    📅 Afspraak
                </a>
                <button class="btn btn-small btn-danger" onclick="deleteCustomer('${customer.id}', '${escapeHtml(customer.name)}')">
                    🗑️
                </button>
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
            document.getElementById('modal-title').textContent = 'Klant Bewerken';
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
        document.getElementById('modal-title').textContent = 'Nieuwe Klant';
    }
    
    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('customer-modal').style.display = 'none';
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
        alert('Kon klant niet opslaan. Probeer het opnieuw.');
    }
}

async function deleteCustomer(id, name) {
    if (!confirm(`Weet je zeker dat je "${name}" wilt verwijderen?`)) {
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
        alert('Kon klant niet verwijderen.');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Modal sluiten bij klikken buiten modal
document.getElementById('customer-modal').addEventListener('click', (e) => {
    if (e.target.id === 'customer-modal') closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});
