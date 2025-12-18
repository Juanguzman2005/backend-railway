// src/utils/mailer.js
const nodemailer = require("nodemailer");

let cachedTransporter = null;

function getEmailConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const secure = process.env.SMTP_SECURE;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;

  if (!host || !port || !user || !pass || !from) return null;

  return {
    host,
    port: Number(port),
    secure: String(secure).toLowerCase() === "true",
    user,
    pass,
    from,
  };
}

function getTransporter(cfg) {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },

    // evita cuelgues
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return cachedTransporter;
}

// Devuelve true si envió, false si no se pudo (pero sin romper el server)
async function sendMail(to, subject, html) {
  const cfg = getEmailConfig();

  if (!cfg) {
    console.warn("⚠️ SMTP no configurado (SMTP_HOST/PORT/USER/PASS/MAIL_FROM). No se enviará correo.");
    return false;
  }

  try {
    const transporter = getTransporter(cfg);

    await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      html,
    });

    return true;
  } catch (err) {
    console.error("❌ Error SMTP sendMail:", err?.message || err);
    return false;
  }
}

module.exports = { sendMail };
