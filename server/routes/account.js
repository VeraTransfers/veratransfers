const express = require("express");
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


/*
 * INFORMACIÓN DE LA CUENTA
 */

router.get("/", autenticarToken, async (req, res) => {
    try {
        const user = await db.prepare(`
            SELECT
                id,
                name,
                email,
                role,
                created_at
            FROM users
            WHERE id = ?
        `).get(req.user.userId);

        if (!user) {
            return res.status(404).json({
                ok: false,
                error: "User not found"
            });
        }

        const account = await db.prepare(`
            SELECT
                id,
                user_id,
                balance_cents,
                currency
            FROM accounts
            WHERE user_id = ?
        `).get(req.user.userId);

        if (!account) {
            return res.status(404).json({
                ok: false,
                error: "Account not found"
            });
        }

        res.json({
            ok: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                created_at: user.created_at
            },
            account: {
                id: account.id,
                user_id: account.user_id,
                balance_cents: account.balance_cents,
                currency: account.currency
            }
        });

    } catch (error) {
        console.error("Account error:", error);
        res.status(500).json({
            ok: false,
            error: "Error interno del servidor"
        });
    }
});


module.exports = router;