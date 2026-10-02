const express = require('express');
const router = express.Router();
const db = require('../database');
const { autenticarToken } = require('./auth');

// Get current user's loans
router.get('/my-loans', autenticarToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const loans = await db.all('SELECT * FROM loans WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        res.json({ ok: true, loans });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
});

// Sign and accept loan
router.post('/:id/sign', autenticarToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const loanId = req.params.id;
        const { signatureData } = req.body;

        if (!signatureData) return res.status(400).json({ ok: false, error: 'Firma requerida' });

        const loan = await db.prepare('SELECT * FROM loans WHERE id = $1 AND user_id = $2').get(loanId, userId);
        if (!loan) return res.status(404).json({ ok: false, error: 'Préstamo no encontrado' });
        if (loan.status !== 'pending') return res.status(400).json({ ok: false, error: 'Este préstamo ya fue procesado' });

        await db.prepare('UPDATE loans SET status = $1, signature_data = $2, accepted_at = CURRENT_TIMESTAMP WHERE id = $3').run('accepted', signatureData, loanId);

        // Record a notification
        const notifTitle = 'Contrato de Préstamo Firmado';
        const notifMsg = 'Has firmado exitosamente tu contrato de préstamo. Tu asesor de Avanza Financial está revisándolo para autorizar el desembolso.';
        await db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)').run(userId, 'info', notifTitle, notifMsg);

        res.json({ ok: true, message: 'Préstamo firmado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
});

module.exports = router;
