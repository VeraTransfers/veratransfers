const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../database");
const { sendEmail } = require("../mailer");

const router = express.Router();

const JWT_SECRET =
    process.env.JWT_SECRET ||
    "veratransfers-development-secret-change-before-production";

const ALLOWED_ORIGINS = [
    "https://veratransfers.vercel.app",
    "https://veratransfers.com",
    "https://www.veratransfers.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
];

function getSafeBaseUrl(req) {
    if (process.env.APP_URL) {
        return process.env.APP_URL.replace(/\/+$/, "");
    }
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        return origin;
    }
    const referer = req.headers.referer;
    if (referer) {
        try {
            const parsed = new URL(referer);
            const refOrigin = `${parsed.protocol}//${parsed.host}`;
            if (ALLOWED_ORIGINS.includes(refOrigin)) {
                return refOrigin;
            }
        } catch (_) {}
    }
    return process.env.NODE_ENV === "production"
        ? "https://veratransfers.vercel.app"
        : `http://localhost:${process.env.PORT || 3000}`;
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


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

        if (user.role === "blocked") {
            return res.status(403).json({
                ok: false,
                error: "Cuenta bloqueada temporalmente por seguridad. Contacta a tu asesor para resolverlo."
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
   RECUPERACIÓN DE CONTRASEÑA
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

        // Por seguridad y para evitar enumeración de usuarios,
        // devolvemos una respuesta neutra y consistente.
        if (!user) {
            return res.json({
                ok: true,
                message: "Si el correo está registrado en nuestra plataforma, hemos enviado las instrucciones para restablecer tu contraseña."
            });
        }

        // Invalidar tokens anteriores sin usar del mismo usuario
        await db.prepare(`
            UPDATE password_reset_tokens
            SET used = 1
            WHERE user_id = ? AND used = 0
        `).run(user.id);

        // Generar token seguro criptográfico (64 hex chars)
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

        // Construir URL segura con token validado contra dominios autorizados
        const baseUrl = getSafeBaseUrl(req);
        const resetUrl = `${baseUrl}/?token=${token}`;

        const safeName = escapeHtml(user.name || "Cliente");
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px;">
                <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e1e7e4; box-shadow: 0 4px 16px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(135deg, #09472e 0%, #0d6d45 100%); padding: 26px 20px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">VeraTransfers</h1>
                        <p style="color: #a3e6c5; margin: 4px 0 0 0; font-size: 13px;">Seguridad Financiera</p>
                    </div>
                    <div style="padding: 28px 24px; color: #1c2826;">
                        <h2 style="color: #0d6d45; margin-top: 0; font-size: 18px;">Recuperación de Contraseña</h2>
                        <p style="font-size: 15px; line-height: 1.5; color: #33413d;">
                            Hola <strong>${safeName}</strong>,
                        </p>
                        <p style="font-size: 15px; line-height: 1.5; color: #33413d;">
                            Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>VeraTransfers</strong>. Haz clic en el botón de abajo para establecer una nueva contraseña:
                        </p>
                        <div style="text-align: center; margin: 28px 0;">
                            <a href="${resetUrl}" style="background-color: #0d6d45; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block;">
                                Restablecer mi contraseña
                            </a>
                        </div>
                        <p style="font-size: 13px; line-height: 1.5; color: #62726d; background: #f8faf9; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2eae6;">
                            <strong>Nota de seguridad:</strong> Este enlace expirará en <strong>60 minutos</strong> y sólo puede ser utilizado una sola vez. Si tú no solicitaste este cambio, puedes ignorar este mensaje de forma segura.
                        </p>
                        <p style="font-size: 12px; color: #879993; margin-top: 22px; word-break: break-all;">
                            Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:<br>
                            <a href="${resetUrl}" style="color: #0d6d45;">${resetUrl}</a>
                        </p>
                    </div>
                    <div style="background-color: #f7f9f8; padding: 16px 20px; text-align: center; border-top: 1px solid #e8ecea; font-size: 12px; color: #879993;">
                        &copy; VeraTransfers. Todos los derechos reservados.
                    </div>
                </div>
            </div>
        `;

        const emailResult = await sendEmail(
            user.email,
            "Recuperación de Contraseña — VeraTransfers",
            emailHtml,
            "VeraTransfers"
        );

        if (!emailResult || !emailResult.success) {
            console.error("[AUTH] Error al enviar email de recuperación:", emailResult?.error || "Error desconocido");
            return res.status(500).json({
                ok: false,
                error: "No fue posible enviar el correo de recuperación en este momento. Por favor intenta más tarde."
            });
        }

        res.json({
            ok: true,
            message: "Si el correo está registrado en nuestra plataforma, hemos enviado las instrucciones para restablecer tu contraseña."
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