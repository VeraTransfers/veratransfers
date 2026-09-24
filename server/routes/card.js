const express = require("express");
const crypto = require("crypto");
const db = require("../database");

const { autenticarToken } = require("./auth");

const router = express.Router();

async function generarNumeroSintetico() {
    let numero;

    do {
        const parte1 = crypto.randomInt(1000, 10000).toString();
        const parte2 = crypto.randomInt(1000, 10000).toString();
        const parte3 = crypto.randomInt(1000, 10000).toString();
        const parte4 = crypto.randomInt(1000, 10000).toString();

        numero = `${parte1}${parte2}${parte3}${parte4}`;
    } while (
        await db.prepare(`
            SELECT id
            FROM cards
            WHERE card_number = ?
        `).get(numero)
    );

    return numero;
}

function generarCVV() {
    return crypto.randomInt(100, 1000).toString();
}

async function obtenerTarjeta(userId) {
    return await db.prepare(`
        SELECT
            id,
            user_id,
            account_id,
            card_number,
            last4,
            expiry_month,
            expiry_year,
            cvv,
            status,
            created_at
        FROM cards
        WHERE user_id = ?
    `).get(userId);
}


// =====================================================
// OBTENER TARJETA DEL CLIENTE AUTENTICADO
// =====================================================

router.get("/", autenticarToken, async (req, res) => {
    try {
        const card = await obtenerTarjeta(req.usuario.id);

        res.json({
            ok: true,
            card: card || null
        });

    } catch (error) {
        console.error("Error al obtener tarjeta:", error);

        res.status(500).json({
            ok: false,
            error: "No se pudo obtener la tarjeta"
        });
    }
});


// =====================================================
// SOLICITAR TARJETA
// =====================================================

router.post("/request", autenticarToken, async (req, res) => {
    try {
        const userId = req.usuario.id;

        // Si ya existe, devolver la misma tarjeta.
        const existingCard = await obtenerTarjeta(userId);

        if (existingCard) {
            return res.json({
                ok: true,
                created: false,
                card: existingCard
            });
        }

        // Buscar cuenta del usuario.
        const account = await db.prepare(`
            SELECT
                id,
                user_id,
                currency
            FROM accounts
            WHERE user_id = ?
        `).get(userId);

        if (!account) {
            return res.status(404).json({
                ok: false,
                error: "No se encontró una cuenta para este usuario"
            });
        }

        // Generar datos sintéticos de tarjeta.
        const cardNumber = await generarNumeroSintetico();
        const last4 = cardNumber.slice(-4);

        const expiryMonth = 12;
        const expiryYear = new Date().getFullYear() + 4;

        const cvv = generarCVV();

        // Guardar tarjeta.
        const result = await db.prepare(`
            INSERT INTO cards (
                user_id,
                account_id,
                card_number,
                last4,
                expiry_month,
                expiry_year,
                cvv,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(
            userId,
            account.id,
            cardNumber,
            last4,
            expiryMonth,
            expiryYear,
            cvv
        );

        const card = await db.prepare(`
            SELECT
                id,
                user_id,
                account_id,
                card_number,
                last4,
                expiry_month,
                expiry_year,
                cvv,
                status,
                created_at
            FROM cards
            WHERE id = ?
        `).get(result.lastInsertRowid);

        res.status(201).json({
            ok: true,
            created: true,
            card
        });

    } catch (error) {
        console.error("Error al solicitar tarjeta:", error);

        res.status(500).json({
            ok: false,
            error: "No se pudo crear la tarjeta"
        });
    }
});


// =====================================================
// CAMBIAR ESTADO DE TARJETA (ADMIN)
// =====================================================

router.patch("/:id/status", autenticarToken, async (req, res) => {
    try {
        if (req.usuario.role !== "admin") {
            return res.status(403).json({ ok: false, error: "Administrador requerido" });
        }

        const { status } = req.body;
        const cardId = req.params.id;

        const validStatuses = ["pending", "approved", "shipped", "delivered", "rejected", "active"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ ok: false, error: "Estado inválido" });
        }

        const result = await db.prepare(`
            UPDATE cards
            SET status = ?
            WHERE id = ?
        `).run(status, cardId);

        if (result.changes === 0) {
            return res.status(404).json({ ok: false, error: "Tarjeta no encontrada" });
        }

        res.json({ ok: true, message: "Estado de la tarjeta actualizado" });
    } catch (error) {
        console.error("Error al actualizar tarjeta:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor" });
    }
});

// =====================================================
// EXPORTAR ROUTER
// =====================================================

module.exports = router;