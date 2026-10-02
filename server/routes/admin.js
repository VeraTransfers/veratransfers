const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../database");
const { creditTestFunds, getAccount } = require("../financial");
const { sendEmail } = require("../mailer");
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
        req.user = jwt.verify(token, JWT_SECRET);
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
 * LISTAR CLIENTES Y SUS CUENTAS
 */

router.get("/clients", autenticarToken, exigirAdmin, async (req, res) => {
    try {
        const clients = await db.prepare(`
            SELECT
                users.id,
                users.name,
                users.email,
                users.role,
                users.created_at,
                accounts.id AS account_id,
                accounts.balance_cents,
                accounts.currency,
                cards.id AS card_id,
                cards.status AS card_status,
                cards.last4 AS card_last4
            FROM users
            INNER JOIN accounts
                ON accounts.user_id = users.id
            LEFT JOIN cards
                ON cards.account_id = accounts.id
            ORDER BY users.id DESC
        `).all();

        res.json({ ok: true, clients });
    } catch (error) {
        console.error("Admin clients error:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});


/*
 * ACREDITAR FONDOS A UNA CUENTA
 */

router.post("/accounts/:accountId/credit", autenticarToken, exigirAdmin, async (req, res) => {
    try {
        const accountId = Number(req.params.accountId);
        const amount = Number(req.body.amount);
        const description = String(req.body.description || "Funds credited").trim();

        if (!Number.isInteger(accountId) || accountId <= 0) {
            return res.status(400).json({ ok: false, error: "Invalid account ID" });
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ ok: false, error: "Amount must be greater than zero" });
        }

        const amountCents = Math.round(amount * 100);

        if (amountCents <= 0) {
            return res.status(400).json({ ok: false, error: "Invalid amount" });
        }

        const account = await getAccount(accountId);

        if (!account) {
            return res.status(404).json({ ok: false, error: "Account not found" });
        }

        const result = await creditTestFunds({
            adminUserId: req.user.id || req.user.userId || null,
            accountId: accountId,
            amount: amount,
            currency: account.currency,
            concept: description
        });

        res.status(201).json({
            ok: true,
            message: "Funds credited successfully",
            transaction: {
                id: result.transactionId,
                account_id: accountId,
                amount_cents: result.amountCents,
                amount: result.amountCents / 100,
                currency: result.currency,
                status: "completed",
                description: description
            },
            account: {
                id: accountId,
                balance_cents: account.balance_cents + result.amountCents,
                balance: (account.balance_cents + result.amountCents) / 100,
                currency: result.currency
            }
        });

    } catch (error) {
        console.error("Credit funds error:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});
/*
 * ELIMINAR CLIENTE
 */

router.delete("/users/:userId", autenticarToken, exigirAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({ ok: false, error: "ID de usuario inválido" });
        }
        
        // Evitar que el admin se borre a sí mismo
        if (req.user.id === userId || req.user.userId === userId) {
            return res.status(400).json({ ok: false, error: "No puedes eliminar tu propia cuenta" });
        }

        // Eliminar el usuario (ON DELETE CASCADE se encarga del resto)
        const result = await db.prepare("DELETE FROM users WHERE id = ?").run(userId);

        if (result.changes === 0) {
            return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
        }

        res.json({ ok: true, message: "Usuario eliminado correctamente" });

    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});
/*
 * BLOQUEAR / DESBLOQUEAR CLIENTE
 */

router.put("/users/:userId/block", autenticarToken, exigirAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({ ok: false, error: "ID de usuario inválido" });
        }
        
        // Evitar que el admin se bloquee a sí mismo
        if (req.user.id === userId || req.user.userId === userId) {
            return res.status(400).json({ ok: false, error: "No puedes bloquear tu propia cuenta" });
        }

        const user = await db.prepare("SELECT role FROM users WHERE id = ?").get(userId);
        if (!user) {
            return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
        }

        const newRole = user.role === "blocked" ? "client" : "blocked";
        await db.prepare("UPDATE users SET role = ? WHERE id = ?").run(newRole, userId);

        res.json({ ok: true, message: `Usuario ${newRole === "blocked" ? "bloqueado" : "desbloqueado"} correctamente`, newRole });

    } catch (error) {
        console.error("Block user error:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});

/*
 * ENVIAR NOTIFICACIÓN
 */

router.post("/notifications", autenticarToken, exigirAdmin, async (req, res) => {
    try {
        const { userId, type, title, message } = req.body;
        
        if (!userId || !title || !message) {
            return res.status(400).json({ ok: false, error: "Faltan campos requeridos" });
        }

        await db.prepare(`
            INSERT INTO notifications (user_id, type, title, message)
            VALUES (?, ?, ?, ?)
        `).run(userId, type || "info", title, message);

        // Enviar correo si existe el usuario
        const user = await db.prepare("SELECT email, name FROM users WHERE id = ?").get(userId);
        if (user && user.email) {
            await sendEmail(
                user.email,
                `Notificación de Avanza Financial: ${title}`,
                `<div style="font-family: Arial, sans-serif; color: #17231d; max-width: 600px; margin: 0 auto; border: 1px solid #d5e0da; border-radius: 10px; overflow: hidden;">
                    <div style="background-color: #087a4d; padding: 20px; text-align: center;">
                        <h2 style="color: white; margin: 0; font-size: 24px;">Avanza Financial</h2>
                    </div>
                    <div style="padding: 30px; background-color: #f9fdfa;">
                        <h3 style="color: #087a4d; margin-top: 0;">Hola ${user.name},</h3>
                        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                            ${message}
                        </p>
                        <p style="font-size: 14px; color: #69756f; margin-top: 30px;">
                            Para más detalles, inicie sesión en su cuenta de VeraTransfers.
                        </p>
                    </div>
                    <div style="background-color: #17231d; padding: 15px; text-align: center; color: #d5e0da; font-size: 12px;">
                        &copy; ${new Date().getFullYear()} Avanza Financial / VeraTransfers. Todos los derechos reservados.
                    </div>
                </div>`
            );
        }

        res.json({ ok: true, message: "Notificación enviada" });
    } catch (error) {
        console.error("Send notification error:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});

/*
 * OBTENER HISTORIAL DE NOTIFICACIONES DE UN CLIENTE
 */

router.get("/users/:userId/notifications", autenticarToken, exigirAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.userId);
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({ ok: false, error: "ID de usuario inválido" });
        }
        
        const notifications = await db.prepare(`
            SELECT id, type, title, message, read_at, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
        `).all(userId);

        res.json({ ok: true, notifications });
    } catch (error) {
        console.error("Get admin user notifications error:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});

/*
 * PRÉSTAMOS
 */

// Crear nuevo préstamo para un usuario
router.post('/users/:userId/loans', autenticarAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { amountCents, paymentCents, frequency } = req.body;
        
        if (!amountCents || !paymentCents || !frequency) {
            return res.status(400).json({ ok: false, error: "Datos incompletos" });
        }

        const user = await db.prepare("SELECT id FROM users WHERE id = $1").get(userId);
        if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

        await db.prepare(`
            INSERT INTO loans (user_id, amount_cents, payment_cents, frequency) 
            VALUES ($1, $2, $3, $4)
        `).run(userId, amountCents, paymentCents, frequency);

        // Notificar al usuario
        const title = 'Nuevo contrato de préstamo disponible';
        const msg = 'Tu asesor ha generado una nueva propuesta de préstamo. Ve a la pestaña Crédito para revisarla y firmarla.';
        await db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)').run(userId, 'info', title, msg);

        res.json({ ok: true, message: "Préstamo creado con éxito" });
    } catch (err) {
        console.error("Crear préstamo admin error:", err);
        res.status(500).json({ ok: false, error: "Error interno" });
    }
});

// Obtener préstamos de un usuario
router.get('/users/:userId/loans', autenticarAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const loans = await db.prepare("SELECT * FROM loans WHERE user_id = $1 ORDER BY created_at DESC").all(userId);
        res.json({ ok: true, loans });
    } catch (err) {
        console.error("Obtener préstamos admin error:", err);
        res.status(500).json({ ok: false, error: "Error interno" });
    }
});

/*
 * GESTIÓN DE DOCUMENTOS
 */

router.get("/documents", autenticarToken, exigirAdmin, async (req, res) => {
    try {
        const docs = await db.prepare(`
            SELECT d.id, d.user_id, u.name, u.email, d.type, d.status, d.created_at 
            FROM documents d
            JOIN users u ON d.user_id = u.id
            ORDER BY d.created_at DESC
        `).all();
        res.json({ ok: true, documents: docs });
    } catch (error) {
        console.error("Get documents error:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});

router.get("/documents/:id", autenticarToken, exigirAdmin, async (req, res) => {
    try {
        const doc = await db.prepare("SELECT base64_data FROM documents WHERE id = ?").get(req.params.id);
        if (!doc) {
            return res.status(404).json({ ok: false, error: "Documento no encontrado" });
        }
        res.json({ ok: true, data: doc.base64_data });
    } catch (error) {
        console.error("Get document data error:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});

router.put("/documents/:id/status", autenticarToken, exigirAdmin, async (req, res) => {
    try {
        const { status, message } = req.body;
        if (!["approved", "rejected", "pending"].includes(status)) {
            return res.status(400).json({ ok: false, error: "Estado inválido" });
        }

        const docId = req.params.id;
        const doc = await db.prepare("SELECT * FROM documents WHERE id = ?").get(docId);
        if (!doc) return res.status(404).json({ ok: false, error: "Documento no encontrado" });

        await db.prepare(`
            UPDATE documents 
            SET status = ?, review_message = ?, reviewer_id = ? 
            WHERE id = ?
        `).run(status, message || null, req.user.userId, docId);

        // Enviar notificación al cliente
        const typeStr = doc.type === 'id' ? 'Identificación' : (doc.type === 'proof_of_address' ? 'Comprobante de domicilio' : 'Documento');
        let notifTitle = "";
        let notifMessage = "";

        if (status === "approved") {
            notifTitle = "Documento Aprobado";
            notifMessage = `Tu ${typeStr} ha sido aprobado exitosamente.`;
        } else if (status === "rejected") {
            notifTitle = "Documento requiere corrección";
            notifMessage = `Tu ${typeStr} ha sido rechazado. Motivo: ${message || 'Por favor, envíalo nuevamente.'}`;
        }

        if (status !== "pending") {
            await db.prepare(`
                INSERT INTO notifications (user_id, type, title, message)
                VALUES (?, 'info', ?, ?)
            `).run(doc.user_id, notifTitle, notifMessage);

            // Enviar correo si existe el usuario
            const user = await db.prepare("SELECT email, name FROM users WHERE id = ?").get(doc.user_id);
            if (user && user.email) {
                await sendEmail(
                    user.email,
                    `Avanza Financial: ${notifTitle}`,
                    `<div style="font-family: Arial, sans-serif; color: #17231d; max-width: 600px; margin: 0 auto; border: 1px solid #d5e0da; border-radius: 10px; overflow: hidden;">
                        <div style="background-color: #087a4d; padding: 20px; text-align: center;">
                            <h2 style="color: white; margin: 0; font-size: 24px;">Avanza Financial</h2>
                        </div>
                        <div style="padding: 30px; background-color: #f9fdfa;">
                            <h3 style="color: #087a4d; margin-top: 0;">Hola ${user.name},</h3>
                            <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                                ${notifMessage}
                            </p>
                            <p style="font-size: 14px; color: #69756f; margin-top: 30px;">
                                Para más detalles, inicie sesión en su cuenta de VeraTransfers.
                            </p>
                        </div>
                        <div style="background-color: #17231d; padding: 15px; text-align: center; color: #d5e0da; font-size: 12px;">
                            &copy; ${new Date().getFullYear()} Avanza Financial / VeraTransfers. Todos los derechos reservados.
                        </div>
                    </div>`
                );
            }
        }

        res.json({ ok: true, message: "Estado de documento actualizado" });
    } catch (error) {
        console.error("Update document status error:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});

module.exports = router;