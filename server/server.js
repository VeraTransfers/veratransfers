const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const express = require('express');
const cors = require("cors");
const db = require("./database");
const financeRoutes = require('./routes/finance');

const usersRouter = require("./routes/users");
const authRouter = require("./routes/auth");
const accountRouter = require("./routes/account");
const adminRouter = require("./routes/admin");
const cardRouter = require("./routes/card");
const loansRouter = require("./routes/loans");

const app = express();

const PORT = process.env.PORT || 3000;

/* =========================================
MIDDLEWARE
========================================= */

app.use(cors());
app.use(express.json({ limit: '10mb' }));

/* =========================================
SERVIR FRONTEND
========================================= */

app.use(
express.static(
path.join(__dirname, "..")
)
);

/* =========================================
ESTADO DEL SISTEMA
========================================= */

app.use('/api/finance', financeRoutes);

app.get("/api/status", (req, res) => {

res.json({
    ok: true,
    application: "VeraTransfers",
    environment: "development",
    database: db.isSQLite ? "sqlite" : "postgres",
    currency: "USD",
    message: "Backend funcionando correctamente"
});

});

/* =========================================
USUARIOS
========================================= */

app.use(
"/api/users",
usersRouter
);

app.use(
"/api/loans",
loansRouter
);

/* =========================================
AUTENTICACIÃ“N
========================================= */

app.use(
"/api/auth",
authRouter
);

/* =========================================
CUENTA
========================================= */

app.use(
"/api/account",
accountRouter
);

/* =========================================
ADMINISTRACIÃ“N
========================================= */

app.use(
"/api/admin",
adminRouter
);

/* =========================================
TARJETAS
========================================= */

app.use(
"/api/card",
cardRouter
);

/* =========================================
API NO ENCONTRADA
========================================= */

app.use("/api", (req, res) => {

res.status(404).json({
    ok: false,
    error: "API route not found"
});

});

/* =========================================
ERRORES
========================================= */

app.use((err, req, res, next) => {

console.error(
    "Server error:",
    err
);

res.status(500).json({
    ok: false,
    error: "Internal server error"
});

});

/* =========================================
INICIAR SERVIDOR
========================================= */

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(
            `VeraTransfers ejecutándose en http://localhost:${PORT}`
        );
    });
}

module.exports = app;


