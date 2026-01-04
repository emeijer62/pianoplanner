// Check login status on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Check for error in URL
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    
    if (error) {
        showError(getErrorMessage(error));
    }
    
    // Check if user is logged in
    try {
        const response = await fetch('/api/user');
        const data = await response.json();
        
        if (data.loggedIn) {
            showUserSection(data.user);
        } else {
            showLoginSection();
        }
    } catch (err) {
        console.error('Error checking user status:', err);
        showLoginSection();
    }
});

function showLoginSection() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('user-section').style.display = 'none';
}

function showUserSection(user) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('user-section').style.display = 'block';
    
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-email').textContent = user.email;
    
    if (user.picture) {
        document.getElementById('user-picture').src = user.picture;
    }
}

function showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function getErrorMessage(error) {
    const messages = {
        'no_code': 'Er ging iets mis bij het inloggen. Probeer het opnieuw.',
        'oauth_failed': 'Google authenticatie mislukt. Probeer het opnieuw.',
        'unauthorized': 'Je bent niet ingelogd. Log eerst in.'
    };
    return messages[error] || 'Er is een fout opgetreden.';
}
