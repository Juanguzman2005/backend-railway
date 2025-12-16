const express = require("express");
const bodyParser = require("body-parser");
const soap = require("soap");
const fs = require("fs");
const http = require("http");
const cors = require("cors");
const path = require("path");

// Inicializa Firebase (si tu archivo exporta admin/db está bien dejarlo así)
require("./src/database/firebase");

const allowedOrigins = new Set([
  "https://notas-byjuanguzman.netlify.app",
  "http://localhost:5173",
]);

const app = express();

// CORS para rutas normales (GET /)
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ message: "Backend de notas funcionando. SOAP en /soap" });
});

// SOAP + WSDL
const soapService = require("./src/soap/service");
const wsdlPath = path.join(__dirname, "src", "soap", "service.wsdl");
const wsdlXml = fs.readFileSync(wsdlPath, "utf8");

const server = http.createServer(app);

// ✅ CORS fuerte para /soap (sirve para OPTIONS y para el POST real)
server.prependListener("request", (req, res) => {
  if (!req.url) return;
  if (!req.url.startsWith("/soap")) return;

  const origin = req.headers.origin;

  // refleja el origin si está permitido, si no, no lo pongas (evita problemas)
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, SOAPAction");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
  }
});

// Railway
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  soap.listen(server, "/soap", soapService, wsdlXml);
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`✅ WSDL: /soap?wsdl`);
});
