// CyberGuard - Auth Logic v4
const API_BASE_URL = 'https://gradproject2026.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    if (localStorage.getItem('authToken') && window.location.pathname.includes('login')) {
        window.location.href = 'index.html';
    }
});

async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('username', document.getElementById('username').value.trim());
    formData.append('password', document.getElementById('password').value);

    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            body: formData
        });
        const result = await res.json();

        if (res.ok) {
            localStorage.setItem('authToken', result.access_token);
            localStorage.setItem('userInfo', JSON.stringify(result.user));
            localStorage.setItem('user', JSON.stringify(result.user));
            window.location.href = 'index.html';
        } else {
            alert(result.detail || 'Login failed');
        }
    } catch (err) {
        console.error(err);
        alert('Server connection failed');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const payload = {
        full_name: document.getElementById('full_name').value.trim(),
        username: document.getElementById('username').value.trim(),
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value
    };

    try {
        const res = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert('Account created!');
            window.location.href = 'login.html';
        } else {
            const err = await res.json();
            alert(err.detail || 'Registration failed');
        }
    } catch (err) {
        console.error(err);
        alert('Server connection failed');
    }
}
