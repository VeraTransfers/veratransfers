const bcrypt = require('bcryptjs');
const db = require('./server/database.js');

async function registerJaime() {
    try {
        const name = "Jaime Alvarado-Ruiz";
        const email = "jaime.alvarado@avanza.com";
        const password = "Avanza1234*";
        const currency = "USD";

        const existingUser = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
        if (existingUser) {
            console.log("El usuario ya existe en la base de datos.");
            return;
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const createUser = db.transaction(async (tx) => {
            const result = await tx.prepare(`
                INSERT INTO users (name, email, password_hash, role)
                VALUES (?, ?, ?, 'client')
            `).run(name, email, passwordHash);

            const userId = result.lastInsertRowid;

            await tx.prepare(`
                INSERT INTO accounts (user_id, balance_cents, currency)
                VALUES (?, 0, ?)
            `).run(userId, currency);

            return userId;
        });

        const newUserId = await createUser();
        console.log(`¡Usuario Jaime creado exitosamente! ID de usuario: ${newUserId}`);
        console.log(`Email: ${email}`);
        console.log(`Clave: ${password}`);

        process.exit(0);
    } catch (error) {
        console.error("Error al crear usuario:", error);
        process.exit(1);
    }
}

registerJaime();
