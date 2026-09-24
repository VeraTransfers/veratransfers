const { Pool } = require("pg");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const dbUrl = process.env.DATABASE_URL || "";
const isLocalhost = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

const pool = new Pool({
    connectionString: dbUrl,
    ssl: isLocalhost ? false : { rejectUnauthorized: false }
});

// Inicialización de la base de datos
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'client',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                phone TEXT,
                address TEXT,
                city TEXT,
                state_province TEXT,
                country TEXT,
                document TEXT,
                date_of_birth TEXT,
                updated_at TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS accounts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                balance_cents INTEGER NOT NULL DEFAULT 0,
                available_balance_cents INTEGER NOT NULL DEFAULT 0,
                pending_balance_cents INTEGER NOT NULL DEFAULT 0,
                guarantee_balance_cents INTEGER NOT NULL DEFAULT 0,
                currency TEXT NOT NULL DEFAULT 'USD',
                account_number TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                from_account_id INTEGER REFERENCES accounts(id),
                to_account_id INTEGER REFERENCES accounts(id),
                amount_cents INTEGER NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                status TEXT NOT NULL DEFAULT 'pending',
                description TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS cards (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
                last4 TEXT NOT NULL,
                expiry_month INTEGER NOT NULL,
                expiry_year INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                card_number TEXT,
                cvv TEXT,
                credit_limit_cents INTEGER NOT NULL DEFAULT 0,
                credit_used_cents INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ledger_entries (
                id SERIAL PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id),
                transaction_id INTEGER REFERENCES transactions(id),
                type TEXT NOT NULL,
                amount_cents INTEGER NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                direction TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'completed',
                description TEXT,
                reference TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS transfer_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                account_id INTEGER NOT NULL REFERENCES accounts(id),
                amount_cents INTEGER NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                destination_account_id INTEGER REFERENCES accounts(id),
                destination_account_number TEXT,
                reference TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'pending',
                description TEXT,
                admin_user_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                actor_user_id INTEGER REFERENCES users(id),
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id INTEGER,
                metadata TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                read_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Crear índices (IF NOT EXISTS funciona diferente para índices en Postgres, pero crearemos los que falten)
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_id)',
            'CREATE INDEX IF NOT EXISTS idx_ledger_transaction ON ledger_entries(transaction_id)',
            'CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger_entries(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_ledger_reference ON ledger_entries(reference)',
            'CREATE INDEX IF NOT EXISTS idx_transfer_requests_user ON transfer_requests(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_transfer_requests_account ON transfer_requests(account_id)',
            'CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON transfer_requests(status)',
            'CREATE INDEX IF NOT EXISTS idx_transfer_requests_reference ON transfer_requests(reference)',
            'CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id)',
            'CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id)',
            'CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_account_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_account_id)',
            'CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token)',
            'CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id)'
        ];

        for (const idx of indexes) {
            await pool.query(idx);
        }

        // Ejecutar migraciones SQL versionadas
        await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        const migrationsDir = path.join(__dirname, 'migrations');
        if (fs.existsSync(migrationsDir)) {
            const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
            for (const file of files) {
                const res = await pool.query('SELECT version FROM schema_migrations WHERE version = $1', [file]);
                if (res.rowCount === 0) {
                    console.log(`Applying migration: ${file}`);
                    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
                    await pool.query(sql);
                    await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
                }
            }
        }

        console.log("PostgreSQL Database initialized correctly");

    } catch (err) {
        console.error("Error initializing database", err);
    }
}

// Inicializar la base de datos si estamos en desarrollo (o al iniciar el servidor)
if (process.env.DATABASE_URL) {
    initDB();
}

// Función auxiliar para convertir consultas SQLite (?) a PostgreSQL ($1, $2)
function convertQuery(sql) {
    let i = 1;
    return sql.replace(/\?/g, () => `$${i++}`);
}

// Wrapper para imitar la API de SQLite de forma asíncrona
pool.get = async (sql, ...params) => {
    const res = await pool.query(convertQuery(sql), params);
    return res.rows[0];
};

pool.all = async (sql, ...params) => {
    const res = await pool.query(convertQuery(sql), params);
    return res.rows;
};

pool.run = async (sql, ...params) => {
    // Si es un INSERT, intentar retornar el ID para lastInsertRowid
    let modifiedSql = convertQuery(sql);
    if (modifiedSql.trim().toUpperCase().startsWith('INSERT') && !modifiedSql.toUpperCase().includes('RETURNING')) {
        modifiedSql += ' RETURNING id';
    }
    const res = await pool.query(modifiedSql, params);
    return {
        changes: res.rowCount,
        lastInsertRowid: res.rows.length > 0 ? res.rows[0].id : null
    };
};

pool.prepare = (sql) => {
    return {
        get: async (...params) => await pool.get(sql, ...params),
        all: async (...params) => await pool.all(sql, ...params),
        run: async (...params) => await pool.run(sql, ...params)
    };
};

// Wrapper para transacciones
pool.transaction = (callback) => {
    return async (...args) => {
        const client = await pool.connect();
        // Proveer al callback un cliente con la misma API (get, all, run, prepare)
        const txClient = {
            query: client.query.bind(client),
            get: async (sql, ...params) => {
                const res = await client.query(convertQuery(sql), params);
                return res.rows[0];
            },
            all: async (sql, ...params) => {
                const res = await client.query(convertQuery(sql), params);
                return res.rows;
            },
            run: async (sql, ...params) => {
                let modifiedSql = convertQuery(sql);
                if (modifiedSql.trim().toUpperCase().startsWith('INSERT') && !modifiedSql.toUpperCase().includes('RETURNING')) {
                    modifiedSql += ' RETURNING id';
                }
                const res = await client.query(modifiedSql, params);
                return {
                    changes: res.rowCount,
                    lastInsertRowid: res.rows.length > 0 ? res.rows[0].id : null
                };
            },
            prepare: (sql) => ({
                get: async (...params) => await txClient.get(sql, ...params),
                all: async (...params) => await txClient.all(sql, ...params),
                run: async (...params) => await txClient.run(sql, ...params)
            })
        };

        try {
            await client.query('BEGIN');
            const result = await callback(txClient, ...args);
            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    };
};

pool.initDB = initDB;
module.exports = pool;
