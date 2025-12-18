// src/utils/mailer.js
const nodemailer = require("nodemailer");

function getEmailConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 0);
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  let pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;

  // Normaliza el app password (quita espacios)
  if (pass) pass = String(pass).replace(/\s+/g, "");

  if (!host || !port || !user || !pass || !from) return null;

  return { host, port, secure, user, pass, from };
}

async function sendMail(to, subject, html) {
  const cfg = getEmailConfig();

  if (!cfg) {
    console.warn("⚠️ SMTP no configurado. No se enviará correo.");
    return;
  }

  // ✅ Para Railway + Gmail: recomendado 587 + secure:false (STARTTLS)
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure, // false en 587, true SOLO en 465
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    // Timeouts para que no “cuelgue”
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,

    // STARTTLS
    requireTLS: cfg.port === 587,
    tls: {
      minVersion: "TLSv1.2",
    },
  });

  // ✅ Verificar pero NO romper tu flujo si falla (solo log)
  try {
    await transporter.verify();
  } catch (e) {
    console.error("❌ SMTP verify falló:", e?.code || e?.message || e);
    // NO return aquí; igual intentamos sendMail (a veces verify falla y sendMail pasa)
  }

  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      html,
    });

    console.log("✅ Email enviado:", info?.messageId || "(sin messageId)");
  } catch (e) {
    console.error("❌ SMTP sendMail falló:", e?.code || e?.message || e);
    // no lanzamos error para no tumbar el SOAP
  }
}

module.exports = { sendMail };
