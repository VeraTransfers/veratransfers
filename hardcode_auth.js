const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Hardcode English texts for Login
content = content.replace('<h1 class="login-title">Bienvenido</h1>', '<h1 class="login-title">Welcome</h1>');
content = content.replace('Accede a tu cuenta.', 'Sign in to your account.');
content = content.replace('<label for="password">\n                    Contraseña\n                </label>', '<label for="password">\n                    Password\n                </label>');
content = content.replace('Iniciar sesión', 'Sign In');
content = content.replace('Crear una cuenta', 'Create an account');
content = content.replace('¿Olvidaste tu contraseña?', 'Forgot your password?');

// Hardcode English texts for Register
content = content.replace('<h1 class="login-title">Crear tu cuenta</h1>', '<h1 class="login-title">Create Account</h1>');
content = content.replace('Únete a nuestra plataforma financiera.', 'Join our financial platform.');
content = content.replace('<label for="registerName">\n                    Nombre completo\n                </label>', '<label for="registerName">\n                    Full Name\n                </label>');
content = content.replace('<label for="registerPassword">\n                    Contraseña segura\n                </label>', '<label for="registerPassword">\n                    Secure Password\n                </label>');
content = content.replace('Crear cuenta', 'Create Account');
content = content.replace('Ya tengo una cuenta · Iniciar sesión', 'Already have an account? Sign in');

// Also fix some buttons 
content = content.replace('type="submit">\n                    Iniciar sesión\n                </button>', 'type="submit">\n                    Sign In\n                </button>');
content = content.replace('type="submit">\n                    Crear cuenta\n                </button>', 'type="submit">\n                    Create Account\n                </button>');

fs.writeFileSync('index.html', content, 'utf8');
console.log('Done hardcoding english auth');
