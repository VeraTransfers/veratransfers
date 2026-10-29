const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const toggleHtml = `
            <div style="position: absolute; top: 20px; right: 20px; z-index: 9999;">
                <button type="button" onclick="toggleAuthLanguage()" style="background: rgba(81, 28, 135, 0.8); border: 1px solid rgba(255,255,255,0.4); color: white; border-radius: 20px; padding: 6px 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 13px;">
                    🌐 <span id="currentLangBtnText">EN</span>
                </button>
            </div>
`;

if (!content.includes('toggleAuthLanguage()')) {
    // Add button to loginPage
    content = content.replace('<section id="loginPage" class="auth-split">', '<section id="loginPage" class="auth-split">\n' + toggleHtml);
    // Add button to registerPage
    content = content.replace('<section id="registerPage" class="auth-split hidden">', '<section id="registerPage" class="auth-split hidden">\n' + toggleHtml.replace('currentLangBtnText', 'currentLangBtnText2'));

    const translationJs = `
        let authLang = 'en';

        function toggleAuthLanguage() {
            authLang = authLang === 'en' ? 'es' : 'en';
            const btn1 = document.getElementById('currentLangBtnText');
            const btn2 = document.getElementById('currentLangBtnText2');
            if (btn1) btn1.textContent = authLang.toUpperCase();
            if (btn2) btn2.textContent = authLang.toUpperCase();
            
            applyAuthTranslations();
        }

        function applyAuthTranslations() {
            const isEn = authLang === 'en';
            
            // Login view
            const loginSection = document.getElementById('loginPage');
            if (loginSection) {
                const title = loginSection.querySelector('.login-title');
                if (title) title.textContent = isEn ? 'Welcome Back' : 'Bienvenido de nuevo';
                
                const sub = loginSection.querySelector('.login-subtitle');
                if (sub) sub.textContent = isEn ? 'Sign in to your VeraTransfers account' : 'Accede a tu cuenta.';
                
                const labels = loginSection.querySelectorAll('label');
                if (labels.length >= 2) {
                    labels[0].textContent = isEn ? 'Email Address' : 'Email';
                    labels[1].textContent = isEn ? 'Password' : 'Contraseña';
                }
                
                const btn = loginSection.querySelector('button[type="submit"]');
                if (btn) btn.textContent = isEn ? 'Sign In' : 'Iniciar sesión';
                
                const toReg = document.getElementById('showRegisterBtn');
                if (toReg) toReg.textContent = isEn ? "Don't have an account? Sign up" : 'Crear una cuenta';
                
                const toForgot = document.getElementById('forgotPasswordBtn');
                if (toForgot) toForgot.textContent = isEn ? 'Forgot your password?' : '¿Olvidaste tu contraseña?';
            }

            // Register view
            const regSection = document.getElementById('registerPage');
            if (regSection) {
                const title = regSection.querySelector('.login-title');
                if (title) title.textContent = isEn ? 'Create Account' : 'Crear tu cuenta';
                
                const sub = regSection.querySelector('.login-subtitle');
                if (sub) sub.textContent = isEn ? 'Join VeraTransfers today' : 'Únete a nuestra plataforma financiera.';
                
                const labels = regSection.querySelectorAll('label');
                if (labels.length >= 3) {
                    labels[0].textContent = isEn ? 'Full Name' : 'Nombre completo';
                    labels[1].textContent = isEn ? 'Email Address' : 'Email';
                    labels[3].textContent = isEn ? 'Create Password' : 'Contraseña segura';
                }
                
                const btn = regSection.querySelector('button[type="submit"]');
                if (btn) btn.textContent = isEn ? 'Create Account' : 'Crear cuenta';
                
                const toLogin = document.getElementById('backToLoginBtn');
                if (toLogin) toLogin.textContent = isEn ? 'Already have an account? Sign in' : 'Ya tengo una cuenta · Iniciar sesión';
            }
        }

        document.addEventListener("DOMContentLoaded", () => {
            setTimeout(() => {
                applyAuthTranslations();
            }, 300);
        });
    `;

    content = content.replace('/* =========================\n       LÓGICA DE AUTENTICACIÓN', translationJs + '\n\n    /* =========================\n       LÓGICA DE AUTENTICACIÓN');
    fs.writeFileSync('index.html', content, 'utf8');
    console.log('Language toggle properly inserted');
} else {
    console.log('Toggle already exists');
}
