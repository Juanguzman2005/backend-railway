// src/utils/mailer.js
const nodemailer = require("nodemailer");

function getEmailConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 0);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;

  if (!host || !port || !user || !pass || !from) return null;

  return { host, port, secure, user, pass, from };
}

async function sendMail(to, subject, html) {
  const cfg = getEmailConfig();

  // ✅ No rompe el server si no hay SMTP
  if (!cfg) {
    console.warn("⚠️ SMTP no configurado. No se enviará correo.");
    return { ok: false, skipped: true };
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },

    // ✅ evita colgadas eternas
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  // ✅ valida conexión antes de enviar
  await transporter.verify();

  const info = await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    html,
  });

  return { ok: true, messageId: info.messageId };
}

module.exports = { sendMail };
