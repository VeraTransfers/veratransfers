const crypto = require("crypto");
const db = require("./database");

function moneyToCents(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("INVALID_AMOUNT");
    }

    return Math.round(amount * 100);
}

function generateReference(prefix = "VT") {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

async function getAccount(accountId, tx = db) {
    return await tx.prepare(`
        SELECT
            a.*,
            u.name AS user_name,
            u.email AS user_email
        FROM accounts a
        INNER JOIN users u ON u.id = a.user_id
        WHERE a.id = ?
    `).get(accountId);
}

async function getAccountByNumber(accountNumber, tx = db) {
    return await tx.prepare(`
        SELECT
            a.*,
            u.name AS user_name,
            u.email AS user_email
        FROM accounts a
        INNER JOIN users u ON u.id = a.user_id
        WHERE a.account_number = ?
    `).get(accountNumber);
}

async function createAudit(actorUserId, action, entityType, entityId, metadata = {}, tx = db) {
    await tx.prepare(`
        INSERT INTO audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            metadata
        )
        VALUES (?, ?, ?, ?, ?)
    `).run(
        actorUserId,
        action,
        entityType,
        entityId,
        JSON.stringify(metadata)
    );
}

async function createNotification(userId, type, title, message, tx = db) {
    await tx.prepare(`
        INSERT INTO notifications (
            user_id,
            type,
            title,
            message
        )
        VALUES (?, ?, ?, ?)
    `).run(
        userId,
        type,
        title,
        message
    );
}

async function creditTestFunds({
    adminUserId,
    accountId,
    amount,
    currency = "USD",
    concept = "Test Funds"
}) {
    const amountCents = moneyToCents(amount);

    if (!["USD", "COP", "MXN"].includes(currency)) {
        throw new Error("UNSUPPORTED_CURRENCY");
    }

    const reference = generateReference("TEST");

    const operation = db.transaction(async (tx) => {
        const account = await getAccount(accountId, tx);

        if (!account) {
            throw new Error("ACCOUNT_NOT_FOUND");
        }

        if (account.status !== "active") {
            throw new Error("ACCOUNT_NOT_ACTIVE");
        }

        const transactionResult = await tx.prepare(`
            INSERT INTO transactions (
                from_account_id,
                to_account_id,
                amount_cents,
                currency,
                status,
                description
            )
            VALUES (NULL, ?, ?, ?, 'completed', ?)
        `).run(
            account.id,
            amountCents,
            currency,
            concept
        );

        const transactionId = transactionResult.lastInsertRowid;

        await tx.prepare(`
            UPDATE accounts
            SET
                balance_cents = balance_cents + ?,
                available_balance_cents = available_balance_cents + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            amountCents,
            amountCents,
            account.id
        );

        await tx.prepare(`
            INSERT INTO ledger_entries (
                account_id,
                transaction_id,
                type,
                amount_cents,
                currency,
                direction,
                status,
                description,
                reference,
                created_by
            )
            VALUES (?, ?, 'credit', ?, ?, 'credit', 'completed', ?, ?, ?)
        `).run(
            account.id,
            transactionId,
            amountCents,
            currency,
            concept,
            reference,
            adminUserId
        );

        await createAudit(
            adminUserId,
            "TEST_FUNDS_CREDITED",
            "account",
            account.id,
            {
                amount_cents: amountCents,
                currency,
                reference,
                concept
            },
            tx
        );

        await createNotification(
            account.user_id,
            "funds_credited",
            "Fondos de prueba acreditados",
            `Se acreditaron ${amount.toFixed(2)} ${currency}. Referencia: ${reference}`,
            tx
        );

        return {
            accountId: account.id,
            accountNumber: account.account_number,
            amountCents,
            currency,
            reference,
            transactionId
        };
    });

    return await operation();
}

async function transferBetweenAccounts({
    userId,
    sourceAccountId,
    destinationAccountNumber,
    amount,
    currency = "USD",
    description = "Internal test transfer"
}) {
    const amountCents = moneyToCents(amount);

    if (!["USD", "COP", "MXN"].includes(currency)) {
        throw new Error("UNSUPPORTED_CURRENCY");
    }

    const operation = db.transaction(async (tx) => {
        const source = await getAccount(sourceAccountId, tx);
        const destination = await getAccountByNumber(destinationAccountNumber, tx);

        if (!source) {
            throw new Error("SOURCE_ACCOUNT_NOT_FOUND");
        }

        if (!destination) {
            throw new Error("DESTINATION_ACCOUNT_NOT_FOUND");
        }

        if (source.id === destination.id) {
            throw new Error("SAME_ACCOUNT");
        }

        if (source.user_id !== userId) {
            throw new Error("UNAUTHORIZED_SOURCE_ACCOUNT");
        }

        if (source.status !== "active") {
            throw new Error("SOURCE_ACCOUNT_NOT_ACTIVE");
        }

        if (destination.status !== "active") {
            throw new Error("DESTINATION_ACCOUNT_NOT_ACTIVE");
        }

        if (source.currency !== destination.currency) {
            throw new Error("CURRENCY_MISMATCH");
        }

        if (source.available_balance_cents < amountCents) {
            throw new Error("INSUFFICIENT_FUNDS");
        }

        const reference = generateReference("TRF");

        const transactionResult = await tx.prepare(`
            INSERT INTO transactions (
                from_account_id,
                to_account_id,
                amount_cents,
                currency,
                status,
                description
            )
            VALUES (?, ?, ?, ?, 'completed', ?)
        `).run(
            source.id,
            destination.id,
            amountCents,
            currency,
            description
        );

        const transactionId = transactionResult.lastInsertRowid;

        await tx.prepare(`
            UPDATE accounts
            SET
                balance_cents = balance_cents - ?,
                available_balance_cents = available_balance_cents - ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            amountCents,
            amountCents,
            source.id
        );

        await tx.prepare(`
            UPDATE accounts
            SET
                balance_cents = balance_cents + ?,
                available_balance_cents = available_balance_cents + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            amountCents,
            amountCents,
            destination.id
        );

        const debitReference = `${reference}-D`;
        const creditReference = `${reference}-C`;

        await tx.prepare(`
            INSERT INTO ledger_entries (
                account_id,
                transaction_id,
                type,
                amount_cents,
                currency,
                direction,
                status,
                description,
                reference,
                created_by
            )
            VALUES (?, ?, 'transfer', ?, ?, 'debit', 'completed', ?, ?, ?)
        `).run(
            source.id,
            transactionId,
            amountCents,
            currency,
            description,
            debitReference,
            userId
        );

        await tx.prepare(`
            INSERT INTO ledger_entries (
                account_id,
                transaction_id,
                type,
                amount_cents,
                currency,
                direction,
                status,
                description,
                reference,
                created_by
            )
            VALUES (?, ?, 'transfer', ?, ?, 'credit', 'completed', ?, ?, ?)
        `).run(
            destination.id,
            transactionId,
            amountCents,
            currency,
            description,
            creditReference,
            userId
        );

        await createAudit(
            userId,
            "INTERNAL_TRANSFER_COMPLETED",
            "transaction",
            transactionId,
            {
                source_account: source.account_number,
                destination_account: destination.account_number,
                amount_cents: amountCents,
                currency,
                reference
            },
            tx
        );

        await createNotification(
            source.user_id,
            "transfer_sent",
            "Transferencia enviada",
            `Envió ${amount.toFixed(2)} ${currency}. Referencia: ${reference}`,
            tx
        );

        await createNotification(
            destination.user_id,
            "transfer_received",
            "Transferencia recibida",
            `Recibió ${amount.toFixed(2)} ${currency}. Referencia: ${reference}`,
            tx
        );

        return {
            transactionId,
            reference,
            amountCents,
            currency,
            sourceAccount: source.account_number,
            destinationAccount: destination.account_number
        };
    });

    return await operation();
}

async function allocateGuarantee({ userId, accountId, amount, currency = "USD" }) {
    const amountCents = moneyToCents(amount);

    if (!["USD", "COP", "MXN"].includes(currency)) {
        throw new Error("UNSUPPORTED_CURRENCY");
    }

    const operation = db.transaction(async (tx) => {
        const account = await getAccount(accountId, tx);

        if (!account || account.user_id !== userId) {
            throw new Error("ACCOUNT_NOT_FOUND");
        }

        if (account.status !== "active") {
            throw new Error("ACCOUNT_NOT_ACTIVE");
        }

        if (account.available_balance_cents < amountCents) {
            throw new Error("INSUFFICIENT_FUNDS");
        }

        // Deduct from available, add to guarantee
        await tx.prepare(`
            UPDATE accounts
            SET
                available_balance_cents = available_balance_cents - ?,
                guarantee_balance_cents = guarantee_balance_cents + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(amountCents, amountCents, account.id);

        // Update credit limit on the card
        const card = await tx.prepare(`SELECT id, credit_limit_cents FROM cards WHERE user_id = ?`).get(userId);
        if (card) {
            await tx.prepare(`
                UPDATE cards
                SET credit_limit_cents = credit_limit_cents + ?
                WHERE id = ?
            `).run(amountCents, card.id);
        }

        const reference = generateReference("GUARANTEE");
        const transactionResult = await tx.prepare(`
            INSERT INTO transactions (
                from_account_id,
                to_account_id,
                amount_cents,
                currency,
                status,
                description
            )
            VALUES (?, NULL, ?, ?, 'completed', 'Asignación a garantía de crédito')
        `).run(account.id, amountCents, currency);
        
        const transactionId = transactionResult.lastInsertRowid;

        await tx.prepare(`
            INSERT INTO ledger_entries (
                account_id,
                transaction_id,
                type,
                amount_cents,
                currency,
                direction,
                status,
                description,
                reference,
                created_by
            )
            VALUES (?, ?, 'guarantee', ?, ?, 'debit', 'completed', 'Bloqueo de garantía', ?, ?)
        `).run(account.id, transactionId, amountCents, currency, reference, userId);

        return { amountCents, reference, transactionId };
    });

    return await operation();
}

async function simulateCreditPayment({ userId, accountId, amount, currency = "USD" }) {
    const amountCents = moneyToCents(amount);

    if (!["USD", "COP", "MXN"].includes(currency)) {
        throw new Error("UNSUPPORTED_CURRENCY");
    }

    const operation = db.transaction(async (tx) => {
        const account = await getAccount(accountId, tx);

        if (!account || account.user_id !== userId) {
            throw new Error("ACCOUNT_NOT_FOUND");
        }

        if (account.available_balance_cents < amountCents) {
            throw new Error("INSUFFICIENT_FUNDS");
        }

        const card = await tx.prepare(`SELECT id, credit_used_cents FROM cards WHERE user_id = ?`).get(userId);
        if (!card) {
            throw new Error("CARD_NOT_FOUND");
        }
        
        if (card.credit_used_cents < amountCents) {
            throw new Error("PAYMENT_EXCEEDS_DEBT");
        }

        // Deduct from available balance (it pays off the credit, money leaves account)
        await tx.prepare(`
            UPDATE accounts
            SET
                balance_cents = balance_cents - ?,
                available_balance_cents = available_balance_cents - ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(amountCents, amountCents, account.id);

        // Deduct from credit used
        await tx.prepare(`
            UPDATE cards
            SET credit_used_cents = credit_used_cents - ?
            WHERE id = ?
        `).run(amountCents, card.id);

        const reference = generateReference("CREDITPAY");
        const transactionResult = await tx.prepare(`
            INSERT INTO transactions (
                from_account_id,
                to_account_id,
                amount_cents,
                currency,
                status,
                description
            )
            VALUES (?, NULL, ?, ?, 'completed', 'Pago de tarjeta de crédito')
        `).run(account.id, amountCents, currency);
        
        const transactionId = transactionResult.lastInsertRowid;

        await tx.prepare(`
            INSERT INTO ledger_entries (
                account_id,
                transaction_id,
                type,
                amount_cents,
                currency,
                direction,
                status,
                description,
                reference,
                created_by
            )
            VALUES (?, ?, 'payment', ?, ?, 'debit', 'completed', 'Pago de tarjeta', ?, ?)
        `).run(account.id, transactionId, amountCents, currency, reference, userId);

        return { amountCents, reference, transactionId };
    });

    return await operation();
}

async function simulateCreditPurchase({ userId, accountId, amount, currency = "USD" }) {
    const amountCents = moneyToCents(amount);

    if (!["USD", "COP", "MXN"].includes(currency)) {
        throw new Error("UNSUPPORTED_CURRENCY");
    }

    const operation = db.transaction(async (tx) => {
        const account = await getAccount(accountId, tx);

        if (!account || account.user_id !== userId) {
            throw new Error("ACCOUNT_NOT_FOUND");
        }

        const card = await tx.prepare(`SELECT id, credit_limit_cents, credit_used_cents FROM cards WHERE user_id = ?`).get(userId);
        if (!card) {
            throw new Error("CARD_NOT_FOUND");
        }
        
        if (card.credit_used_cents + amountCents > card.credit_limit_cents) {
            throw new Error("PURCHASE_EXCEEDS_LIMIT");
        }

        // Add to credit used
        await tx.prepare(`
            UPDATE cards
            SET credit_used_cents = credit_used_cents + ?
            WHERE id = ?
        `).run(amountCents, card.id);

        const reference = generateReference("PURCHASE");
        const transactionResult = await tx.prepare(`
            INSERT INTO transactions (
                from_account_id,
                to_account_id,
                amount_cents,
                currency,
                status,
                description
            )
            VALUES (NULL, ?, ?, ?, 'completed', 'Compra con Tarjeta de Crédito')
        `).run(account.id, amountCents, currency);
        
        const transactionId = transactionResult.lastInsertRowid;

        // Although it's credit, we log it to the ledger as an informative debit against the "credit account", 
        // but since we only have one ledger per account, we can log it as a "purchase" type for tracking.
        await tx.prepare(`
            INSERT INTO ledger_entries (
                account_id,
                transaction_id,
                type,
                amount_cents,
                currency,
                direction,
                status,
                description,
                reference,
                created_by
            )
            VALUES (?, ?, 'purchase', ?, ?, 'debit', 'completed', 'Compra con tarjeta', ?, ?)
        `).run(account.id, transactionId, amountCents, currency, reference, userId);

        return { amountCents, reference, transactionId };
    });

    return await operation();
}

module.exports = {
    moneyToCents,
    getAccount,
    getAccountByNumber,
    creditTestFunds,
    transferBetweenAccounts,
    allocateGuarantee,
    simulateCreditPayment,
    simulateCreditPurchase,
    createAudit,
    createNotification
};
