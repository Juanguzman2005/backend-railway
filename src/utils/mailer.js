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

function buildTransporter(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure, // 465 => true, 587 => false
    auth: { user: cfg.user, pass: cfg.pass },

    // 🔥 IMPORTANTES para evitar “se queda pegado” / timeouts eternos
    connectionTimeout: 10000, // 10s
    greetingTimeout: 10000,
    socketTimeout: 15000,

    // Si usas 587 normalmente necesitas STARTTLS:
    requireTLS: !cfg.secure,

    // OJO: NO recomiendo dejar esto así siempre.
    // Solo úsalo si tu proveedor tiene problemas de certificados.
    // tls: { rejectUnauthorized: false },
  });
}

async function sendMail(to, subject, html) {
  const cfg = getEmailConfig();

  if (!cfg) {
    console.warn("⚠️ SMTP no configurado. (Faltan ENV SMTP_*/MAIL_FROM)");
    return { ok: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  const transporter = buildTransporter(cfg);

  // ✅ Verifica conexión antes de enviar (para detectar rápido el problema)
  try {
    await transporter.verify();
  } catch (err) {
    console.error(
      "❌ SMTP verify falló:",
      err?.code || "",
      err?.message || err
    );
    return { ok: false, reason: "SMTP_VERIFY_FAILED", error: err?.message || String(err) };
  }

  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      html,
    });

    console.log("✅ Email enviado:", { to, messageId: info.messageId });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(
      "❌ SMTP sendMail falló:",
      err?.code || "",
      err?.message || err
    );
    return { ok: false, reason: "SMTP_SEND_FAILED", error: err?.message || String(err) };
  }
}

module.exports = { sendMail };
