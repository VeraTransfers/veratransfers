require('dotenv').config();
const db = require('./server/database');
const email = process.argv[2];

if (!email) {
    console.log("");
    console.error("❌ Por favor ingresa el email con el que te registraste.");
    console.log("👉 Ejemplo: node make-admin.js micorreo@gmail.com");
    console.log("");
    process.exit(1);
}

async function makeAdmin() {
    try {
        const user = await db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
        if (!user) {
            console.log("");
            console.error(`❌ No se encontró la cuenta: ${email}`);
            console.log("👉 Primero debes ir a veratransfers.vercel.app y registrarte.");
            console.log("");
            process.exit(1);
        }
        await db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
        console.log("");
        console.log(`✅ ¡ÉXITO! Tu cuenta ${email} ahora tiene el poder de ADMINISTRADOR.`);
        console.log("👉 Ahora inicia sesión en la página web y verás el Panel de Administración.");
        console.log("");
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}
makeAdmin();
