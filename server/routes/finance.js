const express = require("express");
const jwt = require("jsonwebtoken");

const db = require("../database");
const {
    getAccount,
    getAccountByNumber,
    creditTestFunds,
    transferBetweenAccounts,
    allocateGuarantee,
    simulateCreditPayment,
    simulateCreditPurchase
} = require("../financial");

const router = express.Router();

const JWT_SECRET =
    process.env.JWT_SECRET ||
    "veratransfers-development-secret-change-before-production";

function authenticate(req, res, next) {
    try {
        const header = req.headers.authorization || "";

        if (!header.startsWith("Bearer ")) {
            return res.status(401).json({
                ok: false,
                error: "AUTH_REQUIRED"
            });
        }

        const token = header.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);

        req.user = decoded;

        next();
    } catch (error) {
        return res.status(401).json({
            ok: false,
            error: "INVALID_TOKEN"
        });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
            ok: false,
            error: "ADMIN_REQUIRED"
        });
    }

    next();
}

// ============================================================
// CUENTA DEL USUARIO
// ============================================================

router.get("/account", authenticate, async (req, res) => {
    try {
        const account = await db.prepare(`
            SELECT
                a.id,
                a.account_number,
                a.balance_cents,
                a.available_balance_cents,
                a.pending_balance_cents,
                a.guarantee_balance_cents,
                a.currency,
                a.status,
                a.created_at,
                a.updated_at
            FROM accounts a
            WHERE a.user_id = ?
        `).get(req.user.userId);
        
        const card = await db.prepare(`
            SELECT credit_limit_cents, credit_used_cents
            FROM cards
            WHERE user_id = ?
        `).get(req.user.userId);

        const user = await db.prepare(`
            SELECT
                id,
                name,
                email,
                role,
                phone,
                address,
                city,
                state_province,
                country,
                document,
                date_of_birth
            FROM users
            WHERE id = ?
        `).get(req.user.userId);

        if (!account) {
            return res.status(404).json({
                ok: false,
                error: "ACCOUNT_NOT_FOUND"
            });
        }

        res.json({
            ok: true,
            user: user ? {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                address: user.address,
                city: user.city,
                state_province: user.state_province,
                country: user.country,
                document: user.document,
                date_of_birth: user.date_of_birth
            } : null,
            account: {
                id: account.id,
                account_number: account.account_number,
                balance: account.balance_cents / 100,
                available_balance: account.available_balance_cents / 100,
                pending_balance: account.pending_balance_cents / 100,
                guarantee_balance: (account.guarantee_balance_cents || 0) / 100,
                currency: account.currency,
                status: account.status,
                created_at: account.created_at,
                updated_at: account.updated_at
            },
            credit: card ? {
                limit: card.credit_limit_cents / 100,
                used: card.credit_used_cents / 100,
                available: (card.credit_limit_cents - card.credit_used_cents) / 100
            } : null
        });

    } catch (error) {
        console.error("GET /finance/account:", error);

        res.status(500).json({
            ok: false,
            error: "INTERNAL_ERROR"
        });
    }
});

// ============================================================
// MOVIMIENTOS / LEDGER
// ============================================================

router.get("/movements", authenticate, async (req, res) => {
    try {
        const account = await db.prepare(`
            SELECT id
            FROM accounts
            WHERE user_id = ?
        `).get(req.user.userId);

        if (!account) {
            return res.status(404).json({
                ok: false,
                error: "ACCOUNT_NOT_FOUND"
            });
        }

        const movements = await db.prepare(`
            SELECT
                id,
                transaction_id,
                type,
                amount_cents,
                currency,
                direction,
                status,
                description,
                reference,
                created_at
            FROM ledger_entries
            WHERE account_id = ?
            ORDER BY created_at DESC, id DESC
        `).all(account.id);

        res.json({
            ok: true,
            movements: movements.map(item => ({
                id: item.id,
                transaction_id: item.transaction_id,
                type: item.type,
                amount: item.amount_cents / 100,
                currency: item.currency,
                direction: item.direction,
                status: item.status,
                description: item.description,
                reference: item.reference,
                created_at: item.created_at
            }))
        });

    } catch (error) {
        console.error("GET /finance/movements:", error);

        res.status(500).json({
            ok: false,
            error: "INTERNAL_ERROR"
        });
    }
});

// ============================================================
// GARANTÍA DE CRÉDITO
// ============================================================

router.post("/guarantee", authenticate, async (req, res) => {
    try {
        const { amount } = req.body || {};

        if (!amount || amount <= 0) {
            return res.status(400).json({ ok: false, error: "INVALID_AMOUNT" });
        }

        const account = await db.prepare(`SELECT id FROM accounts WHERE user_id = ?`).get(req.user.userId);
        if (!account) return res.status(404).json({ ok: false, error: "ACCOUNT_NOT_FOUND" });

        const result = await allocateGuarantee({
            userId: req.user.userId,
            accountId: account.id,
            amount: amount,
            currency: "USD"
        });

        res.status(201).json({
            ok: true,
            transaction: result
        });

    } catch (error) {
        console.error("POST /finance/guarantee:", error);
        res.status(500).json({ ok: false, error: error.message || "INTERNAL_ERROR" });
    }
});

// ============================================================
// PAGO DE CRÉDITO
// ============================================================

router.post("/pay-credit", authenticate, async (req, res) => {
    try {
        const { amount } = req.body || {};

        if (!amount || amount <= 0) {
            return res.status(400).json({ ok: false, error: "INVALID_AMOUNT" });
        }

        const account = await db.prepare(`SELECT id FROM accounts WHERE user_id = ?`).get(req.user.userId);
        if (!account) return res.status(404).json({ ok: false, error: "ACCOUNT_NOT_FOUND" });

        const result = await simulateCreditPayment({
            userId: req.user.userId,
            accountId: account.id,
            amount: amount,
            currency: "USD"
        });

        res.status(201).json({
            ok: true,
            transaction: result
        });

    } catch (error) {
        console.error("POST /finance/pay-credit:", error);
        res.status(500).json({ ok: false, error: error.message || "INTERNAL_ERROR" });
    }
});

// ============================================================
// TRANSFERENCIA INTERNA
// ============================================================

router.post("/transfer", authenticate, async (req, res) => {
    try {
        const {
            destination_account_number,
            amount,
            description
        } = req.body || {};

        if (!destination_account_number) {
            return res.status(400).json({
                ok: false,
                error: "DESTINATION_ACCOUNT_REQUIRED"
            });
        }

        const account = await db.prepare(`
            SELECT id
            FROM accounts
            WHERE user_id = ?
        `).get(req.user.userId);

        if (!account) {
            return res.status(404).json({
                ok: false,
                error: "ACCOUNT_NOT_FOUND"
            });
        }

        const result = await transferBetweenAccounts({
            userId: req.user.userId,
            sourceAccountId: account.id,
            destinationAccountNumber: String(destination_account_number).trim(),
            amount,
            currency: "USD",
            description: description || "Internal test transfer"
        });

        res.status(201).json({
            ok: true,
            environment: "TEST",
            transaction: result
        });

    } catch (error) {
        console.error("POST /finance/transfer:", error);

        const knownErrors = {
            INVALID_AMOUNT: 400,
            UNSUPPORTED_CURRENCY: 400,
            SOURCE_ACCOUNT_NOT_FOUND: 404,
            DESTINATION_ACCOUNT_NOT_FOUND: 404,
            SAME_ACCOUNT: 400,
            UNAUTHORIZED_SOURCE_ACCOUNT: 403,
            SOURCE_ACCOUNT_NOT_ACTIVE: 403,
            DESTINATION_ACCOUNT_NOT_ACTIVE: 403,
            INSUFFICIENT_FUNDS: 400
        };

        return res.status(knownErrors[error.message] || 500).json({
            ok: false,
            error: error.message || "INTERNAL_ERROR"
        });
    }
});

// ============================================================
// NOTIFICACIONES
// ============================================================

router.get("/notifications", authenticate, async (req, res) => {
    try {
        const notifications = await db.prepare(`
            SELECT
                id,
                type,
                title,
                message,
                read_at,
                created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 100
        `).all(req.user.userId);

        res.json({
            ok: true,
            notifications
        });

    } catch (error) {
        console.error("GET /finance/notifications:", error);

        res.status(500).json({
            ok: false,
            error: "INTERNAL_ERROR"
        });
    }
});

// ============================================================
// ADMIN — ACREDITAR FONDOS DE PRUEBA
// ============================================================

router.post(
    "/admin/test-funds",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {
            const {
                account_id,
                amount,
                concept
            } = req.body || {};

            if (!account_id) {
                return res.status(400).json({
                    ok: false,
                    error: "ACCOUNT_REQUIRED"
                });
            }

            const result = await creditTestFunds({
                adminUserId: req.user.userId,
                accountId: Number(account_id),
                amount,
                currency: "USD",
                concept: concept || "Test Funds"
            });

            const account = await getAccount(result.accountId);

            res.status(201).json({
                ok: true,
                environment: "TEST",
                message: "Fondos de prueba acreditados correctamente",
                account: {
                    id: account.id,
                    account_number: account.account_number,
                    balance: account.balance_cents / 100,
                    available_balance: account.available_balance_cents / 100,
                    currency: account.currency
                },
                transaction: result
            });

        } catch (error) {
            console.error("POST /finance/admin/test-funds:", error);

            const knownErrors = {
                INVALID_AMOUNT: 400,
                UNSUPPORTED_CURRENCY: 400,
                ACCOUNT_NOT_FOUND: 404,
                ACCOUNT_NOT_ACTIVE: 403
            };

            return res.status(knownErrors[error.message] || 500).json({
                ok: false,
                error: error.message || "INTERNAL_ERROR"
            });
        }
    }
);

// ============================================================
// ADMIN — VER LEDGER DE UNA CUENTA
// ============================================================

router.get(
    "/admin/accounts/:accountId/movements",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {
            const account = await getAccount(Number(req.params.accountId));

            if (!account) {
                return res.status(404).json({
                    ok: false,
                    error: "ACCOUNT_NOT_FOUND"
                });
            }

            const movements = await db.prepare(`
                SELECT
                    id,
                    transaction_id,
                    type,
                    amount_cents,
                    currency,
                    direction,
                    status,
                    description,
                    reference,
                    created_at,
                    created_by
                FROM ledger_entries
                WHERE account_id = ?
                ORDER BY created_at DESC, id DESC
            `).all(account.id);

            res.json({
                ok: true,
                account: {
                    id: account.id,
                    account_number: account.account_number,
                    user_name: account.user_name,
                    user_email: account.user_email
                },
                movements: movements.map(item => ({
                    ...item,
                    amount: item.amount_cents / 100
                }))
            });

        } catch (error) {
            console.error("GET admin movements:", error);

            res.status(500).json({
                ok: false,
                error: "INTERNAL_ERROR"
            });
        }
    }
);

// =====================================================
// SIMULAR USO DE CRÉDITO (SANDBOX)
// =====================================================

router.post("/spend-credit", autenticarToken, async (req, res) => {
    try {
        const { amount } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ ok: false, error: "Monto inválido" });
        }

        const account = await db.prepare("SELECT id FROM accounts WHERE user_id = ?").get(req.usuario.id);
        
        if (!account) {
            return res.status(404).json({ ok: false, error: "Cuenta no encontrada" });
        }

        const result = await simulateCreditPurchase({
            userId: req.usuario.id,
            accountId: account.id,
            amount: Number(amount)
        });

        res.json({
            ok: true,
            message: "Compra simulada correctamente",
            transaction: result
        });
    } catch (error) {
        console.error("Error en simulación de compra:", error);
        res.status(400).json({ ok: false, error: error.message });
    }
});

module.exports = router;
