// src/utils/mailer.js
const nodemailer = require("nodemailer");

let cachedTransporter = null;
let cachedCfgKey = null;

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
  const key = `${cfg.host}|${cfg.port}|${cfg.secure}|${cfg.user}`;

  if (cachedTransporter && cachedCfgKey === key) return cachedTransporter;

  cachedCfgKey = key;

  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },

    // ✅ IMPORTANTES para que no se quede colgado
    connectionTimeout: 10_000, // 10s
    greetingTimeout: 10_000,
    socketTimeout: 15_000,     // 15s
  });

  return cachedTransporter;
}

async function sendMail(to, subject, html) {
  const cfg = getEmailConfig();
  if (!cfg) {
    console.warn("⚠️ SMTP no configurado. No se enviará correo.");
    return { ok: false, skipped: true };
  }

  const transporter = getTransporter(cfg);

  // ✅ Hard-timeout por si igual se cuelga
  const HARD_TIMEOUT_MS = 18_000;

  const sendPromise = transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    html,
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("SMTP timeout")), HARD_TIMEOUT_MS)
  );

  await Promise.race([sendPromise, timeoutPromise]);
  return { ok: true };
}

module.exports = { sendMail };
