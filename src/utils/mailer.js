const nodemailer = require("nodemailer");
const { config } = require("../config"); // <-- asegúrate que existe y exporta { config }

const emailConfig = config?.email;
if (!emailConfig) {
  throw new Error("Config email no está definida. Revisa config.yml y src/config.js");
}

const transporter = nodemailer.createTransport({
  host: emailConfig.host,
  port: emailConfig.port,
  secure: emailConfig.secure, // false para 587
  auth: {
    user: emailConfig.user,
    pass: emailConfig.pass,
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
