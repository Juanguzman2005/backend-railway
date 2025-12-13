// src/utils/mailer.js
const nodemailer = require("nodemailer");

function getEmailConfig() {
  // lee de variables de entorno (Railway / producción)
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const secure = process.env.SMTP_SECURE;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;

  // Si NO hay config SMTP, devolvemos null (para no romper el server)
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

async function sendMail(to, subject, html) {
  const cfg = getEmailConfig();

  if (!cfg) {
    // No rompemos el servidor; solo avisamos.
    console.warn("⚠️ SMTP no configurado. No se enviará correo.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  });

  await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    html,
  });
}

module.exports = { sendMail };
