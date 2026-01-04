// Admin Dashboard JavaScript

document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is logged in and is admin
    try {
        const response = await fetch('/api/user');
        const data = await response.json();
        
        if (!data.loggedIn) {
            window.location.href = '/?error=unauthorized';
            return;
        }
        
        if (!data.isAdmin) {
            document.getElementById('not-admin').style.display = 'block';
            document.getElementById('admin-content').style.display = 'none';
            return;
        }
        
        document.getElementById('admin-content').style.display = 'block';
        await loadUsers();
        
    } catch (err) {
        console.error('Error:', err);
        window.location.href = '/?error=unauthorized';
    }
    
    // Event listeners
    document.getElementById('refresh-btn').addEventListener('click', loadUsers);
});

async function loadUsers() {
    const container = document.getElementById('users-list');
    container.innerHTML = '<div class="loading">Laden...</div>';
    
    try {
        const response = await fetch('/api/admin/users');
        
        if (response.status === 403) {
            document.getElementById('not-admin').style.display = 'block';
            document.getElementById('admin-content').style.display = 'none';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Failed to load users');
        }
        
        const data = await response.json();
        
        document.getElementById('total-users').textContent = data.total;
        
        if (data.users.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👤</div>
                    <p>Nog geen gebruikers geregistreerd</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = data.users.map(user => createUserCard(user)).join('');
        
    } catch (err) {
        console.error('Error loading users:', err);
        container.innerHTML = '<div class="error-message">Kon gebruikers niet laden</div>';
    }
}

function createUserCard(user) {
    const createdDate = user.createdAt 
        ? new Date(user.createdAt).toLocaleDateString('nl-NL', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : 'Onbekend';
    
    const lastActive = user.updatedAt 
        ? new Date(user.updatedAt).toLocaleDateString('nl-NL', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : 'Onbekend';
    
    return `
        <div class="user-card">
            <div class="user-card-header">
                <img src="${user.picture || '/default-avatar.png'}" alt="" class="user-avatar">
                <div class="user-info-main">
                    <h3>${escapeHtml(user.name || 'Onbekende gebruiker')}</h3>
                    <span class="user-email">${escapeHtml(user.email)}</span>
                </div>
            </div>
            <div class="user-card-details">
                <div class="user-detail">
                    <span class="detail-label">📅 Geregistreerd:</span>
                    <span>${createdDate}</span>
                </div>
                <div class="user-detail">
                    <span class="detail-label">🕐 Laatst actief:</span>
                    <span>${lastActive}</span>
                </div>
            </div>
            <div class="user-card-actions">
                <button class="btn btn-small btn-danger" onclick="deleteUser('${user.id}', '${escapeHtml(user.email)}')">
                    🗑️ Verwijderen
                </button>
            </div>
        </div>
    `;
}

async function deleteUser(userId, email) {
    if (!confirm(`Weet je zeker dat je ${email} wilt verwijderen?\n\nDit verwijdert alleen de lokale registratie, niet hun Google account.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete user');
        }
        
        await loadUsers();
        
    } catch (err) {
        console.error('Error deleting user:', err);
        alert('Kon gebruiker niet verwijderen. Probeer het opnieuw.');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
