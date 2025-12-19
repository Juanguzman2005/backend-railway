// src/utils/mailer.js
const nodemailer = require("nodemailer");

async function sendMail(to, subject, html) {
  const provider = (process.env.EMAIL_PROVIDER || "").toLowerCase();

  // ✅ RESEND (recomendado)
  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEnv = process.env.MAIL_FROM || "";
    const from =
      fromEnv.includes("@gmail.com")
        ? "Notas Universitarias <onboarding@resend.dev>"
        : fromEnv || "Notas Universitarias <onboarding@resend.dev>";

    if (!apiKey) {
      console.warn("⚠️ RESEND_API_KEY no configurado. Email NO enviado (skipped):", to);
      return;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("❌ Resend falló:", res.status, t);
      return;
    }

    console.log("✅ Email enviado (Resend) a:", to);
    return;
  }

  // ✅ SMTP (fallback si algún día lo vuelves a usar)
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 0);
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
  const from = process.env.MAIL_FROM;

  if (!host || !port || !user || !pass || !from) {
    console.warn("⚠️ SMTP no configurado. Email NO enviado (skipped):", to);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    requireTLS: port === 587,
    tls: { minVersion: "TLSv1.2" },
  });

  try {
    await transporter.sendMail({ from, to, subject, html });
    console.log("✅ Email enviado (SMTP) a:", to);
  } catch (e) {
    console.error("❌ SMTP sendMail falló:", e?.code || e?.message || e);
  }
}

module.exports = { sendMail };
