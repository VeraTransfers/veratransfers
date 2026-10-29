const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

let activeEngine = null; // 'pg' or 'sqlite'
let pool = null;
let sqlite = null;

const defaultDbUrl = "postgresql://postgres.vvrwqyqmfwkrjrykhxcz:richardbj8925%40v02ivy@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
const dbUrl = process.env.DATABASE_URL || defaultDbUrl;
const forceSQLite = process.env.USE_SQLITE === "true";

// Función auxiliar para convertir consultas SQLite (?) a PostgreSQL ($1, $2)
function convertQueryToPG(sql) {
    let i = 1;
    return sql.replace(/\?/g, () => `$${i++}`);
}

// Función auxiliar para normalizar consultas PostgreSQL ($1, $2) a SQLite (?)
function normalizeSqlForSQLite(sql) {
    return sql.replace(/\$\d+/g, '?');
}

function cleanParams(params) {
    if (params.length === 1 && Array.isArray(params[0])) {
        return params[0];
    }
    return params;
}

/* ============================================================
   SQLITE IMPLEMENTATION
============================================================ */
function initSQLite() {
    const Database = require("better-sqlite3");
    const dataDir = process.env.VERCEL ? "/tmp" : path.join(__dirname, "data");
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, "veratransfers.db");
    console.log(`[DB] Usando base de datos SQLite local: ${dbPath}`);

    sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    // Crear tablas
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'client',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            phone TEXT,
            address TEXT,
            city TEXT,
            state_province TEXT,
            country TEXT,
            document TEXT,
            date_of_birth TEXT,
            country_code TEXT,
            dial_code TEXT,
            phone_e164 TEXT,
            updated_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            balance_cents INTEGER NOT NULL DEFAULT 0,
            available_balance_cents INTEGER NOT NULL DEFAULT 0,
            pending_balance_cents INTEGER NOT NULL DEFAULT 0,
            guarantee_balance_cents INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'USD',
            account_number TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_account_id INTEGER REFERENCES accounts(id),
            to_account_id INTEGER REFERENCES accounts(id),
            amount_cents INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            status TEXT NOT NULL DEFAULT 'pending',
            description TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ledger_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            transaction_id INTEGER REFERENCES transactions(id),
            type TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            direction TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'completed',
            description TEXT,
            reference TEXT NOT NULL UNIQUE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS transfer_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_user_id INTEGER REFERENCES users(id),
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            metadata TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            read_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token TEXT NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            filename TEXT NOT NULL,
            base64_data TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            review_message TEXT,
            reviewer_id INTEGER REFERENCES users(id),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount_cents INTEGER NOT NULL,
            payment_cents INTEGER NOT NULL,
            frequency TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            signature_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            accepted_at DATETIME
        );
    `);

    // Crear índices
    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_id)',
        'CREATE INDEX IF NOT EXISTS idx_ledger_transaction ON ledger_entries(transaction_id)',
        'CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger_entries(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_ledger_reference ON ledger_entries(reference)',
        'CREATE INDEX IF NOT EXISTS idx_transfer_requests_user ON transfer_requests(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_transfer_requests_account ON transfer_requests(account_id)',
        'CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON transfer_requests(status)',
        'CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id)',
        'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id)'
    ];
    for (const idx of indexes) {
        sqlite.exec(idx);
    }

    // Sembrar usuarios iniciales si no existen
    seedInitialData();

    activeEngine = 'sqlite';
    console.log("✅ Base de datos SQLite inicializada correctamente");
}

function seedInitialData() {
    try {
        const checkUser = sqlite.prepare("SELECT COUNT(*) AS count FROM users").get();
        if (checkUser && checkUser.count > 0) {
            return;
        }

        console.log("[DB] Sembrando usuarios y datos de prueba...");
        const adminHash = bcrypt.hashSync("Admin1234*", 10);
        const jaimeHash = bcrypt.hashSync("Avanza1234*", 10);

        // 1. Admin (admin@veratransfers.com)
        const adminInsert = sqlite.prepare(`
            INSERT INTO users (name, email, password_hash, role, phone, country)
            VALUES (?, ?, ?, 'admin', '+1 (555) 019-2831', 'United States')
        `).run("Administrador VeraTransfers", "admin@veratransfers.com", adminHash);

        const adminAcc = sqlite.prepare(`
            INSERT INTO accounts (user_id, balance_cents, available_balance_cents, currency, account_number, status)
            VALUES (?, 5000000, 5000000, 'USD', 'VT-000001', 'active')
        `).run(adminInsert.lastInsertRowid);

        sqlite.prepare(`
            INSERT INTO cards (user_id, account_id, last4, expiry_month, expiry_year, card_number, cvv, credit_limit_cents, credit_used_cents, status)
            VALUES (?, ?, '1234', 12, 29, '4532892099881234', '741', 500000, 0, 'active')
        `).run(adminInsert.lastInsertRowid, adminAcc.lastInsertRowid);

        // 1b. Admin (tramitesvisasoficial@gmail.com)
        const admin2Insert = sqlite.prepare(`
            INSERT INTO users (name, email, password_hash, role, phone, country)
            VALUES (?, ?, ?, 'admin', '+1 (555) 019-2832', 'United States')
        `).run("Administrador Oficial", "tramitesvisasoficial@gmail.com", adminHash);

        const admin2Acc = sqlite.prepare(`
            INSERT INTO accounts (user_id, balance_cents, available_balance_cents, currency, account_number, status)
            VALUES (?, 5000000, 5000000, 'USD', 'VT-000005', 'active')
        `).run(admin2Insert.lastInsertRowid);

        // 2. Jaime (Cliente)
        const jaimeInsert = sqlite.prepare(`
            INSERT INTO users (name, email, password_hash, role, phone, country)
            VALUES (?, ?, ?, 'client', '+1 (305) 982-1200', 'United States')
        `).run("Jaime Alvarado-Ruiz", "jaime.alvarado@avanza.com", jaimeHash);

        const jaimeAcc = sqlite.prepare(`
            INSERT INTO accounts (user_id, balance_cents, available_balance_cents, currency, account_number, status)
            VALUES (?, 1245000, 1245000, 'USD', 'VT-000002', 'active')
        `).run(jaimeInsert.lastInsertRowid);

        sqlite.prepare(`
            INSERT INTO cards (user_id, account_id, last4, expiry_month, expiry_year, card_number, cvv, credit_limit_cents, credit_used_cents, status)
            VALUES (?, ?, '4819', 10, 28, '4532892011234819', '392', 250000, 0, 'active')
        `).run(jaimeInsert.lastInsertRowid, jaimeAcc.lastInsertRowid);

        // Movimientos de demostración
        sqlite.prepare(`
            INSERT INTO ledger_entries (account_id, type, amount_cents, currency, direction, status, description, reference)
            VALUES (?, 'deposit', 1500000, 'USD', 'inbound', 'completed', 'Depósito Inicial ACH Transfer', 'DEP-001')
        `).run(jaimeAcc.lastInsertRowid);

        sqlite.prepare(`
            INSERT INTO ledger_entries (account_id, type, amount_cents, currency, direction, status, description, reference)
            VALUES (?, 'transfer', 255000, 'USD', 'outbound', 'completed', 'Transferencia Zelle a Carlos Mendoza', 'TX-ZEL-002')
        `).run(jaimeAcc.lastInsertRowid);

        // Notificación de bienvenida
        sqlite.prepare(`
            INSERT INTO notifications (user_id, type, title, message)
            VALUES (?, 'info', '¡Bienvenido a VeraTransfers!', 'Tu cuenta ha sido activada exitosamente con todos los servicios habilitados.')
        `).run(jaimeInsert.lastInsertRowid);

        console.log("✅ Usuarios iniciales sembrados exitosamente:");
        console.log("   👉 Admin:  admin@veratransfers.com  / Admin1234*");
        console.log("   👉 Jaime:  jaime.alvarado@avanza.com / Avanza1234*");
    } catch (e) {
        console.error("Error sembrando datos iniciales:", e);
    }
}

/* ============================================================
   POSTGRESQL IMPLEMENTATION
============================================================ */
async function initPG() {
    const { Pool } = require("pg");
    const isLocalhost = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

    pool = new Pool({
        connectionString: dbUrl,
        ssl: isLocalhost ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
    });

    // Probar conexión
    const client = await pool.connect();
    client.release();

    console.log("[DB] Conexión establecida con PostgreSQL en la nube");

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
            country_code TEXT,
            dial_code TEXT,
            phone_e164 TEXT,
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

        CREATE TABLE IF NOT EXISTS documents (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            filename TEXT NOT NULL,
            base64_data TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            review_message TEXT,
            reviewer_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS loans (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount_cents INTEGER NOT NULL,
            payment_cents INTEGER NOT NULL,
            frequency TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            signature_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            accepted_at TIMESTAMP
        );
    `);

    // Migraciones
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
        for (const file of files) {
            const res = await pool.query('SELECT version FROM schema_migrations WHERE version = $1', [file]);
            if (res.rowCount === 0) {
                console.log(`Aplicando migración: ${file}`);
                const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
                await pool.query(sql);
                await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
            }
        }
    }

    activeEngine = 'pg';
    console.log("✅ PostgreSQL inicializado correctamente");
}

/* ============================================================
   INICIALIZACIÓN GENERAL (AUTO-FALLBACK)
============================================================ */
async function initDB() {
    if (forceSQLite) {
        initSQLite();
        return;
    }

    try {
        await initPG();
    } catch (err) {
        console.warn("⚠️ No se pudo conectar a PostgreSQL (el proyecto en Supabase puede estar pausado o inactivo).");
        console.warn(`Detalle del error: ${err.message}`);
        console.log("🔄 Activando modo local SQLite automáticamente...");
        initSQLite();
    }
}

let initPromise = null;
async function ensureDBReady() {
    if (!activeEngine) {
        if (!initPromise) {
            initPromise = initDB().catch((err) => {
                console.error("Error crítico inicializando base de datos:", err);
                if (!activeEngine) {
                    initSQLite();
                }
            });
        }
        await initPromise;
    }
}

// Inicializar inmediatamente
initPromise = initDB().catch((err) => {
    console.error("Error crítico inicializando base de datos:", err);
    if (!activeEngine) {
        initSQLite();
    }
});

/* ============================================================
   EXPORTED UNIFIED INTERFACE
============================================================ */
const db = {
    get isSQLite() {
        return activeEngine === 'sqlite';
    },

    initDB,
    ensureDBReady,

    query: async (sql, params = []) => {
        await ensureDBReady();
        if (activeEngine === 'sqlite') {
            const normalized = normalizeSqlForSQLite(sql);
            const stmt = sqlite.prepare(normalized);
            const p = cleanParams(params);
            const isSelect = /^\s*SELECT/i.test(normalized);
            if (isSelect) {
                const rows = stmt.all(...p);
                return { rows, rowCount: rows.length };
            } else {
                const info = stmt.run(...p);
                return { rows: [], rowCount: info.changes };
            }
        } else {
            return await pool.query(sql, cleanParams(params));
        }
    },

    get: async (sql, ...params) => {
        await ensureDBReady();
        if (activeEngine === 'sqlite') {
            const stmt = sqlite.prepare(normalizeSqlForSQLite(sql));
            return stmt.get(...cleanParams(params));
        } else {
            const res = await pool.query(convertQueryToPG(sql), cleanParams(params));
            return res.rows[0];
        }
    },

    all: async (sql, ...params) => {
        await ensureDBReady();
        if (activeEngine === 'sqlite') {
            const stmt = sqlite.prepare(normalizeSqlForSQLite(sql));
            return stmt.all(...cleanParams(params));
        } else {
            const res = await pool.query(convertQueryToPG(sql), cleanParams(params));
            return res.rows;
        }
    },

    run: async (sql, ...params) => {
        await ensureDBReady();
        if (activeEngine === 'sqlite') {
            const stmt = sqlite.prepare(normalizeSqlForSQLite(sql));
            const info = stmt.run(...cleanParams(params));
            return {
                changes: info.changes,
                lastInsertRowid: Number(info.lastInsertRowid)
            };
        } else {
            let modifiedSql = convertQueryToPG(sql);
            if (modifiedSql.trim().toUpperCase().startsWith('INSERT') && !modifiedSql.toUpperCase().includes('RETURNING')) {
                modifiedSql += ' RETURNING id';
            }
            const res = await pool.query(modifiedSql, cleanParams(params));
            return {
                changes: res.rowCount,
                lastInsertRowid: res.rows.length > 0 ? res.rows[0].id : null
            };
        }
    },

    prepare: (sql) => {
        return {
            get: async (...params) => await db.get(sql, ...params),
            all: async (...params) => await db.all(sql, ...params),
            run: async (...params) => await db.run(sql, ...params)
        };
    },

    transaction: (callback) => {
        return async (...args) => {
            await ensureDBReady();
            if (activeEngine === 'sqlite') {
                sqlite.exec('BEGIN IMMEDIATE');
                const txClient = {
                    query: db.query,
                    get: async (sql, ...params) => sqlite.prepare(normalizeSqlForSQLite(sql)).get(...cleanParams(params)),
                    all: async (sql, ...params) => sqlite.prepare(normalizeSqlForSQLite(sql)).all(...cleanParams(params)),
                    run: async (sql, ...params) => {
                        const info = sqlite.prepare(normalizeSqlForSQLite(sql)).run(...cleanParams(params));
                        return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
                    },
                    prepare: (sql) => ({
                        get: async (...params) => sqlite.prepare(normalizeSqlForSQLite(sql)).get(...cleanParams(params)),
                        all: async (...params) => sqlite.prepare(normalizeSqlForSQLite(sql)).all(...cleanParams(params)),
                        run: async (...params) => {
                            const info = sqlite.prepare(normalizeSqlForSQLite(sql)).run(...cleanParams(params));
                            return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
                        }
                    })
                };

                try {
                    const result = await callback(txClient, ...args);
                    sqlite.exec('COMMIT');
                    return result;
                } catch (e) {
                    sqlite.exec('ROLLBACK');
                    throw e;
                }
            } else {
                const client = await pool.connect();
                const txClient = {
                    query: client.query.bind(client),
                    get: async (sql, ...params) => {
                        const res = await client.query(convertQueryToPG(sql), cleanParams(params));
                        return res.rows[0];
                    },
                    all: async (sql, ...params) => {
                        const res = await client.query(convertQueryToPG(sql), cleanParams(params));
                        return res.rows;
                    },
                    run: async (sql, ...params) => {
                        let modifiedSql = convertQueryToPG(sql);
                        if (modifiedSql.trim().toUpperCase().startsWith('INSERT') && !modifiedSql.toUpperCase().includes('RETURNING')) {
                            modifiedSql += ' RETURNING id';
                        }
                        const res = await client.query(modifiedSql, cleanParams(params));
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
            }
        };
    }
};

module.exports = db;
