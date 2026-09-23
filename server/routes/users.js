const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../database");

const router = express.Router();

const JWT_SECRET =
    process.env.JWT_SECRET ||
    "veratransfers-development-secret-change-before-production";

function autenticarToken(req, res, next) {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            ok: false,
            error: "Authentication required"
        });
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            ok: false,
            error: "Invalid or expired token"
        });
    }
}

function exigirAdmin(req, res, next) {
    if (req.user.role !== "admin") {
        return res.status(403).json({
            ok: false,
            error: "Administrator access required"
        });
    }
    next();
}

/*
 * REGISTRAR USUARIO
 */

router.post("/", async (req, res) => {
    try {
        const { name, email, password, phone, country_code, dial_code, phone_e164 } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                ok: false,
                error: "Nombre, email y contraseña son obligatorios"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                ok: false,
                error: "La contraseña debe tener al menos 6 caracteres"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const existingUser = await db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);

        if (existingUser) {
            return res.status(409).json({
                ok: false,
                error: "El email ya está registrado"
            });
        }

        if (phone_e164) {
            const e164Regex = /^\+[1-9]\d{1,14}$/;
            if (!e164Regex.test(phone_e164)) {
                return res.status(400).json({
                    ok: false,
                    error: "El formato del teléfono no es válido (E.164)"
                });
            }
            const existingPhone = await db.prepare("SELECT id FROM users WHERE phone_e164 = ?").get(phone_e164);
            if (existingPhone) {
                return res.status(409).json({
                    ok: false,
                    error: "Este número de teléfono internacional ya está registrado"
                });
            }
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const createUser = db.transaction(async (tx) => {
            const result = await tx.prepare(`
                INSERT INTO users (name, email, password_hash, role, phone, country_code, dial_code, phone_e164)
                VALUES (?, ?, ?, 'client', ?, ?, ?, ?)
            `).run(name.trim(), normalizedEmail, passwordHash, phone || null, country_code || null, dial_code || null, phone_e164 || null);

            const userId = Number(result.lastInsertRowid);

            await tx.prepare(`
                INSERT INTO accounts (user_id, balance_cents, currency)
                VALUES (?, 0, 'USD')
            `).run(userId);

            return userId;
        });

        const userId = await createUser();

        res.status(201).json({
            ok: true,
            message: "Usuario creado correctamente",
            user: {
                id: userId,
                name: name.trim(),
                email: normalizedEmail,
                role: "client"
            }
        });

    } catch (error) {
        console.error("Create user error:", error);
        res.status(500).json({
            ok: false,
            error: "Error interno del servidor"
        });
    }
});

/*
 * LISTAR USUARIOS
 *
 * Solo administrador.
 */

router.get("/", autenticarToken, exigirAdmin, async (req, res) => {
    try {
        const users = await db.prepare(`
            SELECT id, name, email, role, created_at
            FROM users
            ORDER BY id DESC
        `).all();

        res.json({ ok: true, users });
    } catch (error) {
        console.error("List users error:", error);
        res.status(500).json({
            ok: false,
            error: "Error interno del servidor"
        });
    }
});

/*
 * PERFIL DEL USUARIO AUTENTICADO
 */

router.get("/me", autenticarToken, async (req, res) => {
    try {
        const user = await db.prepare(`
            SELECT
                id, name, email, role, phone, country_code, dial_code, phone_e164,
                address, city, state_province, country,
                document, date_of_birth, created_at, updated_at
            FROM users
            WHERE id = ?
        `).get(req.user.userId);

        if (!user) {
            return res.status(404).json({
                ok: false,
                error: "Usuario no encontrado"
            });
        }

        res.json({ ok: true, user });
    } catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});

/*
 * ACTUALIZAR PERFIL DEL USUARIO AUTENTICADO
 */

router.patch("/me", autenticarToken, async (req, res) => {
    try {
        const allowedFields = [
            "name", "phone", "country_code", "dial_code", "phone_e164", "address",
            "city", "state_province", "country"
        ];

        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = String(req.body[field]).trim();
            }
        }

        if (updates.name !== undefined && updates.name.length < 2) {
            return res.status(400).json({
                ok: false,
                error: "El nombre debe tener al menos 2 caracteres"
            });
        }

        if (updates.phone_e164) {
            const e164Regex = /^\+[1-9]\d{1,14}$/;
            if (!e164Regex.test(updates.phone_e164)) {
                return res.status(400).json({
                    ok: false,
                    error: "El formato del teléfono no es válido (E.164)"
                });
            }
            const existingPhone = await db.prepare("SELECT id FROM users WHERE phone_e164 = ? AND id != ?").get(updates.phone_e164, req.user.userId);
            if (existingPhone) {
                return res.status(409).json({
                    ok: false,
                    error: "Este número de teléfono internacional ya está registrado por otra cuenta"
                });
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                ok: false,
                error: "No se enviaron campos para actualizar"
            });
        }

        const setClauses = Object.keys(updates).map(f => `${f} = ?`).join(", ");
        const values = [...Object.values(updates), req.user.userId];

        await db.prepare(`
            UPDATE users
            SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(...values);

        const updated = await db.prepare(`
            SELECT
                id, name, email, role, phone, country_code, dial_code, phone_e164,
                address, city, state_province, country,
                created_at, updated_at
            FROM users
            WHERE id = ?
        `).get(req.user.userId);

        res.json({
            ok: true,
            message: "Perfil actualizado correctamente",
            user: updated
        });
    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});

module.exports = router;