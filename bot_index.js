require('dotenv').config();
const { Telegraf } = require('telegraf');

const token = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(token);

console.log('Bot de Avanza Financial iniciado correctamente...');

// Array de administradores
const adminIds = []; 

bot.start((ctx) => {
    const userName = ctx.from.first_name || 'Equipo';
    const welcomeMsg = `¡Hola, ${userName}! 💼 Bienvenido al asistente de Avanza Financial.\n\n` +
                       `Estoy aquí para proporcionarte herramientas y recursos rápidos.\n\n` +
                       `📋 *Comandos disponibles:*\n` +
                       `/enlaces - Links oficiales para clientes (App, Registro)\n` +
                       `/ubicacion - Dirección y datos de contacto oficiales\n` +
                       `/documentos - Lista de documentos requeridos al cliente\n` +
                       `/requisitos - Requisitos para aprobación de crédito\n` +
                       `/respuestas - Guiones de ventas y respuestas a clientes\n` +
                       `/herramientas - Audios de capacitación, foto de perfil y guiones\n` +
                       `/ayuda - Solicitar ayuda de un administrador`;
    ctx.replyWithMarkdown(welcomeMsg);
});

bot.command('enlaces', (ctx) => {
    const msg = `🔗 *Enlaces Oficiales de Avanza Financial*\n\n` +
                `*Aplicación Principal (Login/Registro):*\n` +
                `https://financiera-lyart.vercel.app\n\n` +
                `*Portal Administrativo (Solo para asesores):*\n` +
                `https://financiera-lyart.vercel.app/admin\n\n` +
                `_Copia y pega estos enlaces cuando el cliente los solicite._`;
    ctx.replyWithMarkdown(msg);
});

bot.command('ubicacion', (ctx) => {
    const msg = `📍 *Ubicación y Contacto Oficial*\n\n` +
                `*Oficina Principal:*\n` +
                `Avanza Financial Headquarters\n` +
                `New York, NY 10001\n` +
                `Estados Unidos\n\n` +
                `*Email de soporte:*\n` +
                `soporte@avanzafinancial.com\n\n` +
                `*Teléfono de atención al cliente:*\n` +
                `+1 (800) 123-4567`;
    ctx.replyWithMarkdown(msg);
});

bot.command('documentos', (ctx) => {
    const msg = `📄 *Documentos Requeridos al Cliente*\n\n` +
                `Para abrir una cuenta o procesar un crédito, el cliente debe subir desde su perfil:\n\n` +
                `1️⃣ *Identificación Oficial* (ID, Pasaporte o Licencia)\n` +
                `2️⃣ *Comprobante de Domicilio* (Recibo de luz, agua, menor a 3 meses)\n` +
                `3️⃣ *Selfie sosteniendo su ID* (Opcional, para verificación de identidad)\n\n` +
                `_Asegúrate de indicarle que las fotos deben ser claras y legibles._`;
    ctx.replyWithMarkdown(msg);
});

bot.command('requisitos', (ctx) => {
    const msg = `✅ *Requisitos para Aprobación de Crédito*\n\n` +
                `1. Estar registrado en la plataforma.\n` +
                `2. Haber subido los documentos de identidad.\n` +
                `3. Contar con un fondo de garantía depositado (mínimo el 10% del crédito solicitado).\n` +
                `4. Firmar digitalmente el contrato desde la pestaña 'Crédito'.\n\n` +
                `_Nota: No revisamos el historial crediticio externo (Buró), nos basamos 100% en la garantía interna._`;
    ctx.replyWithMarkdown(msg);
});

bot.command('respuestas', (ctx) => {
    const resMsg = `💬 *Guiones Rápidos para Clientes*\n\n` +
                   `*Si el cliente duda sobre la garantía:*\n` +
                   `"Tu dinero está 100% seguro en una bóveda virtual. Solo actúa como respaldo para autorizar tu préstamo. ¡Incluso puedes retirarlo cuando liquides tu línea de crédito!"\n\n` +
                   `*Si el cliente pregunta por la app bancaria:*\n` +
                   `"Te daremos acceso a una plataforma bancaria moderna donde podrás ver tu saldo, transferir y ver tu contrato digital de manera instantánea."`;
    ctx.replyWithMarkdown(resMsg);
});

bot.command('herramientas', (ctx) => {
    const msg = `🛠️ *Caja de Herramientas para Asesores*\n\n` +
                `Aquí encontrarás todos los audios de capacitación, la foto oficial de perfil y los guiones de WhatsApp listos para descargar e interactuar con el cliente.\n\n` +
                `👉 *Ingresa al Canal de Herramientas aquí:*\n` +
                `https://t.me/+8aL4fOStHpplN2Jh`;
    ctx.replyWithMarkdown(msg);
});

bot.command('ayuda', (ctx) => {
    ctx.reply('🚨 *ALERTA ENVIADA* 🚨\nHemos notificado a la gerencia. Por favor detalla tu problema en el grupo y un administrador intervendrá pronto.', { parse_mode: 'Markdown' });
});

// Listener general
bot.on('text', (ctx) => {
    const text = ctx.message.text.toLowerCase();
    if (text.startsWith('/')) return;

    if (text.includes('problema') || text.includes('no funciona') || text.includes('error')) {
        ctx.reply('🛠️ Parece que reportas un inconveniente. Asegúrate de tomar una captura de pantalla del error para agilizar el soporte.');
    }
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
