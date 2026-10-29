const nodemailer = require('nodemailer');

const SMTP_EMAIL = process.env.SMTP_EMAIL || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: SMTP_EMAIL,
        pass: SMTP_PASSWORD
    }
});

/**
 * Send an email to a specific user
 * @param {string} to - The recipient's email address
 * @param {string} subject - The subject of the email
 * @param {string} html - The HTML body of the email
 * @param {string} [senderName="VeraTransfers"] - Display name for sender
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail(to, subject, html, senderName = "VeraTransfers") {
    if (!SMTP_EMAIL || !SMTP_PASSWORD) {
        console.log(`[MAILER] Correo no configurado. Simulación de envío a ${to}: ${subject}`);
        return { success: false, error: "Credenciales de correo no configuradas" };
    }

    try {
        const mailOptions = {
            from: `"${senderName}" <${SMTP_EMAIL}>`,
            to,
            subject,
            html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[MAILER] Correo enviado exitosamente a ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`[MAILER ERROR] Error al enviar correo a ${to}:`, error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendEmail
};
