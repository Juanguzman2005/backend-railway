const nodemailer = require("nodemailer");
const { config } = require("../config"); // <-- asegúrate que existe y exporta { config }

const emailConfig = config?.email;
if (!emailConfig) {
  throw new Error("Config email no está definida. Revisa config.yml y src/config.js");
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


async function sendMail(to, subject, html) {
  return transporter.sendMail({
    from: emailConfig.from,
    to,
    subject,
    html,
  });
}

module.exports = { sendMail };
