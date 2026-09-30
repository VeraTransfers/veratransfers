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
 */
async function sendEmail(to, subject, html) {
    if (!SMTP_EMAIL || !SMTP_PASSWORD) {
        console.log(`[MAILER] Correo no configurado. Simulación de envío a ${to}: ${subject}`);
        return;
    }

    try {
        const mailOptions = {
            from: `"Avanza Financial" <${SMTP_EMAIL}>`,
            to,
            subject,
            html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[MAILER] Correo enviado exitosamente a ${to}: ${info.messageId}`);
    } catch (error) {
        console.error(`[MAILER ERROR] Error al enviar correo a ${to}:`, error);
    }
}

module.exports = {
    sendEmail
};
