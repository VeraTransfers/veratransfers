require('dotenv').config();
const db = require('./server/database');
const bcrypt = require('bcryptjs');

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
    console.log("");
    console.error("❌ Error: Faltan datos.");
    console.log("👉 Uso correcto: node reset-password.js <correo> <nueva_contraseña>");
    console.log("👉 Ejemplo: node reset-password.js cliente@gmail.com temporal123");
    console.log("");
    process.exit(1);
}

async function resetPassword() {
    try {
        const normalizedEmail = email.toLowerCase().trim();
        const user = await db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
        
        if (!user) {
            console.log("");
            console.error(`❌ No se encontró ninguna cuenta con el correo: ${email}`);
            console.log("");
            process.exit(1);
        }

        if (newPassword.length < 6) {
            console.log("");
            console.error("❌ La contraseña debe tener al menos 6 caracteres.");
            console.log("");
            process.exit(1);
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);
        
        await db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(passwordHash, user.id);
        
        console.log("");
        console.log(`✅ ¡ÉXITO! La contraseña para la cuenta ${email} ha sido actualizada.`);
        console.log(`🔑 Nueva contraseña: ${newPassword}`);
        console.log("👉 El usuario ya puede iniciar sesión con esta nueva contraseña.");
        console.log("");
        process.exit(0);

    } catch (e) {
        console.error("Error del sistema:", e);
        process.exit(1);
    }
}

resetPassword();
