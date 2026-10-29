const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// 1. Insert the language toggle HTML in the Auth Container
const toggleHtml = `
            <div style="position: absolute; top: 20px; right: 20px; z-index: 10;">
                <button type="button" id="langToggleBtn" onclick="toggleAuthLanguage()" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); color: white; border-radius: 20px; padding: 6px 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 13px;">
                    🌐 <span id="currentLang">EN</span>
                </button>
            </div>
`;

if (!content.includes('langToggleBtn')) {
    // Let's insert it inside the auth-container
    content = content.replace('<div class="auth-container">', '<div class="auth-container">\n' + toggleHtml);
}

// 2. Insert the Javascript logic for the translation
const translationJs = `
    let authLang = 'en'; // Default to English since it's a US app

    const authTranslations = {
        en: {
            // Login
            'login-title': 'Welcome Back',
            'login-subtitle': 'Sign in to your VeraTransfers account',
            'login-email-label': 'Email Address',
            'login-pass-label': 'Password',
            'login-btn': 'Sign In',
            'login-to-register': 'Don\\'t have an account? Sign up',
            'login-to-forgot': 'Forgot your password?',
            
            // Register
            'reg-title': 'Create Account',
            'reg-subtitle': 'Join VeraTransfers today',
            'reg-name-label': 'Full Name',
            'reg-email-label': 'Email Address',
            'reg-phone-label': 'Phone Number (Optional)',
            'reg-pass-label': 'Create Password',
            'reg-btn': 'Create Account',
            'reg-to-login': 'Already have an account? Sign in',
            
            // Forgot
            'forgot-title': 'Reset Password',
            'forgot-subtitle': 'Enter your email to receive instructions',
            'forgot-btn': 'Send Instructions',
            'forgot-to-login': 'Back to Sign In'
        },
        es: {
            // Login
            'login-title': 'Bienvenido de nuevo',
            'login-subtitle': 'Inicia sesión en tu cuenta VeraTransfers',
            'login-email-label': 'Correo electrónico',
            'login-pass-label': 'Contraseña',
            'login-btn': 'Iniciar sesión',
            'login-to-register': '¿No tienes cuenta? Regístrate',
            'login-to-forgot': '¿Olvidaste tu contraseña?',
            
            // Register
            'reg-title': 'Crear Cuenta',
            'reg-subtitle': 'Únete a VeraTransfers hoy',
            'reg-name-label': 'Nombre completo',
            'reg-email-label': 'Correo electrónico',
            'reg-phone-label': 'Teléfono (Opcional)',
            'reg-pass-label': 'Crear contraseña',
            'reg-btn': 'Crear cuenta',
            'reg-to-login': '¿Ya tienes cuenta? Inicia sesión',
            
            // Forgot
            'forgot-title': 'Recuperar Contraseña',
            'forgot-subtitle': 'Ingresa tu correo para recibir instrucciones',
            'forgot-btn': 'Enviar Instrucciones',
            'forgot-to-login': 'Volver al inicio de sesión'
        }
    };

    function toggleAuthLanguage() {
        authLang = authLang === 'en' ? 'es' : 'en';
        document.getElementById('currentLang').textContent = authLang.toUpperCase();
        applyAuthTranslations();
    }

    function applyAuthTranslations() {
        const t = authTranslations[authLang];
        
        // Login View
        const loginTitle = document.querySelector('#authView h2');
        if (loginTitle && loginTitle.textContent.includes('Bienvenido')) loginTitle.textContent = t['login-title'];
        if (loginTitle && loginTitle.textContent.includes('Welcome')) loginTitle.textContent = t['login-title'];
        
        // We will query by labels or placeholders to replace them
        const loginLabels = document.querySelectorAll('#authView label');
        if (loginLabels.length > 0) {
            loginLabels[0].textContent = t['login-email-label'];
            loginLabels[1].textContent = t['login-pass-label'];
        }
        
        const loginBtn = document.querySelector('#loginBtn');
        if (loginBtn) loginBtn.textContent = t['login-btn'];
        
        const loginToReg = document.querySelector('#showRegisterBtn');
        if (loginToReg) loginToReg.textContent = t['login-to-register'];
        
        const loginToForgot = document.querySelector('#showForgotBtn');
        if (loginToForgot) loginToForgot.textContent = t['login-to-forgot'];

        // Register View
        const regTitle = document.querySelector('#registerView h2');
        if (regTitle) regTitle.textContent = t['reg-title'];
        
        const regLabels = document.querySelectorAll('#registerView label');
        if (regLabels.length >= 3) {
            regLabels[0].textContent = t['reg-name-label'];
            regLabels[1].textContent = t['reg-email-label'];
            regLabels[3].textContent = t['reg-pass-label'];
        }
        
        const regBtn = document.querySelector('#registerBtn');
        if (regBtn) regBtn.textContent = t['reg-btn'];
        
        const regToLogin = document.querySelector('#showLoginFromRegisterBtn');
        if (regToLogin) regToLogin.textContent = t['reg-to-login'];
    }

    // Call it initially after DOM load
    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => {
            // Ensure English is applied by default as requested
            applyAuthTranslations();
        }, 500);
    });
`;

if (!content.includes('toggleAuthLanguage')) {
    content = content.replace('/* LÓGICA DE AUTENTICACIÓN */', '/* LÓGICA DE AUTENTICACIÓN */\n' + translationJs);
}

fs.writeFileSync('index.html', content, 'utf8');
console.log('Language toggle added to index.html');
