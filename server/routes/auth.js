const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../database");

const router = express.Router();

const JWT_SECRET =
    process.env.JWT_SECRET ||
    "veratransfers-development-secret-change-before-production";


/* =========================================
   AUTENTICAR TOKEN
========================================= */

async function autenticarToken(req, res, next) {

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            ok: false,
            error: "Token requerido"
        });
    }

    const token = authHeader.split(" ")[1];

    try {

        const decoded = jwt.verify(
            token,
            JWT_SECRET
        );

        const user = await db.prepare(`
            SELECT
                id,
                name,
                email,
                role
            FROM users
            WHERE id = ?
        `).get(decoded.userId);

        if (!user) {
            return res.status(401).json({
                ok: false,
                error: "Usuario no encontrado"
            });
        }

        req.usuario = user;

        next();

    } catch (error) {

        return res.status(401).json({
            ok: false,
            error: "Token inválido o expirado"
        });

    }
}


/* =========================================
   LOGIN
========================================= */

router.post("/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                ok: false,
                error: "Email y contraseña son obligatorios"
            });
        }

        const normalizedEmail =
            String(email)
                .trim()
                .toLowerCase();

        const user = await db.prepare(`
            SELECT
                id,
                name,
                email,
                password_hash,
                role
            FROM users
            WHERE email = ?
        `).get(normalizedEmail);

        if (!user) {
            return res.status(401).json({
                ok: false,
                error: "Credenciales incorrectas"
            });
        }

        const passwordValid =
            await bcrypt.compare(
                password,
                user.password_hash
            );

        if (!passwordValid) {
            return res.status(401).json({
                ok: false,
                error: "Credenciales incorrectas"
            });
        }

        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role
            },
            JWT_SECRET,
            {
                expiresIn: "2h"
            }
        );

        res.json({
            ok: true,
            message: "Inicio de sesión correcto",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        res.status(500).json({
            ok: false,
            error: "Error interno del servidor"
        });

    }

});


/* =========================================
   EXPORTACIONES
========================================= */

/* =========================================
   RECUPERACIÓN DE CONTRASEÑA (SANDBOX)
   Sin proveedor de email configurado — el token
   se devuelve directamente en la respuesta.
========================================= */

router.post("/forgot-password", async (req, res) => {

    try {

        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                ok: false,
                error: "El email es obligatorio"
            });
        }

        const normalizedEmail =
            String(email).trim().toLowerCase();

        const user = await db.prepare(`
            SELECT id, name, email
            FROM users
            WHERE email = ?
        `).get(normalizedEmail);

        // Por seguridad, siempre respondemos igual
        // aunque el email no exista.
        if (!user) {
            return res.json({
                ok: true,
                sandbox: true,
                message: "Si el email existe, recibirás instrucciones."
            });
        }

        // Invalidar tokens anteriores del mismo usuario
        await db.prepare(`
            UPDATE password_reset_tokens
            SET used = 1
            WHERE user_id = ? AND used = 0
        `).run(user.id);

        // Generar token seguro
        const crypto = require("crypto");
        const token = crypto.randomBytes(32).toString("hex");

        // Expiración: 1 hora desde ahora
        const expiresAt = new Date(
            Date.now() + 60 * 60 * 1000
        ).toISOString();

        await db.prepare(`
            INSERT INTO password_reset_tokens
            (user_id, token, expires_at)
            VALUES (?, ?, ?)
        `).run(user.id, token, expiresAt);

        res.json({
            ok: true,
            sandbox: true,
            sandboxMessage:
                "MODO SANDBOX — Este token se muestra únicamente " +
                "para pruebas. En producción será enviado por correo electrónico.",
            token,
            expiresAt,
            userEmail: normalizedEmail
        });

    } catch (error) {

        console.error("Forgot password error:", error);

        res.status(500).json({
            ok: false,
            error: "Error interno del servidor"
        });

    }

});


/* =========================================
   RESTABLECER CONTRASEÑA
========================================= */

router.post("/reset-password", async (req, res) => {

    try {

        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({
                ok: false,
                error: "Token y nueva contraseña son obligatorios"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                ok: false,
                error: "La contraseña debe tener al menos 6 caracteres"
            });
        }

        const record = await db.prepare(`
            SELECT
                id,
                user_id,
                token,
                expires_at,
                used
            FROM password_reset_tokens
            WHERE token = ?
        `).get(token);

        if (!record) {
            return res.status(400).json({
                ok: false,
                error: "Token inválido"
            });
        }

        if (record.used) {
            return res.status(400).json({
                ok: false,
                error: "Este token ya fue utilizado"
            });
        }

        const now = new Date();
        const expiresAt = new Date(record.expires_at);

        if (now > expiresAt) {
            return res.status(400).json({
                ok: false,
                error: "El token ha expirado. Solicita uno nuevo."
            });
        }

        const passwordHash =
            await bcrypt.hash(newPassword, 12);

        const op = db.transaction(async (tx) => {
            await tx.prepare(`
                UPDATE users
                SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(passwordHash, record.user_id);

            await tx.prepare(`
                UPDATE password_reset_tokens
                SET used = 1
                WHERE id = ?
            `).run(record.id);
        });

        await op();

        res.json({
            ok: true,
            message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión."
        });

    } catch (error) {

        console.error("Reset password error:", error);

        res.status(500).json({
            ok: false,
            error: "Error interno del servidor"
        });

    }

});


/* =========================================
   CAMBIAR CONTRASEÑA (USUARIO AUTENTICADO)
========================================= */

router.post("/change-password", autenticarToken, async (req, res) => {

    try {

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                ok: false,
                error: "Contraseña actual y nueva son obligatorias"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                ok: false,
                error: "La nueva contraseña debe tener al menos 6 caracteres"
            });
        }

        const user = await db.prepare(`
            SELECT id, password_hash
            FROM users
            WHERE id = ?
        `).get(req.usuario.id);

        if (!user) {
            return res.status(404).json({
                ok: false,
                error: "Usuario no encontrado"
            });
        }

        const isValid =
            await bcrypt.compare(currentPassword, user.password_hash);

        if (!isValid) {
            return res.status(400).json({
                ok: false,
                error: "La contraseña actual es incorrecta"
            });
        }

        const newHash =
            await bcrypt.hash(newPassword, 12);

        await db.prepare(`
            UPDATE users
            SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(newHash, user.id);

        res.json({
            ok: true,
            message: "Contraseña actualizada correctamente"
        });

    } catch (error) {

        console.error("Change password error:", error);

        res.status(500).json({
            ok: false,
            error: "Error interno del servidor"
        });

    }

});


/* =========================================
   EXPORTACIONES
========================================= */

module.exports = router;

module.exports.autenticarToken = autenticarToken;