const express = require("express");
const bodyParser = require("body-parser");
const soap = require("soap");
const fs = require("fs");
const http = require("http");
const cors = require("cors");
const path = require("path");

// Inicializa Firebase
require("./src/database/firebase");

const allowedOrigins = [
  "https://notas-byjuanguzman.netlify.app",
  "http://localhost:5173",
];

const app = express();

// CORS para rutas normales (GET / por ejemplo)
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // Postman / server-to-server
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "SOAPAction"],
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({
    message: "Backend de notas funcionando. API principal por SOAP en /soap",
  });
});

// Servicio SOAP + WSDL
const soapService = require("./src/soap/service");
const wsdlPath = path.join(__dirname, "src", "soap", "service.wsdl");
const wsdlXml = fs.readFileSync(wsdlPath, "utf8");

// ✅ Crear server ANTES de usarlo
const server = http.createServer(app);

// ✅ FORZAR headers CORS también en /soap (incluye POST y OPTIONS)
server.prependListener("request", (req, res) => {
  if (!req.url) return;
  if (!req.url.startsWith("/soap")) return;

  const origin = req.headers.origin;

  // Si viene origin y está permitido, lo reflejamos
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    // si no viene origin (postman) o no coincide, puedes dejarlo en "*"
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, SOAPAction");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
  }
});

// Puerto Railway
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  soap.listen(server, "/soap", soapService, wsdlXml);
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`✅ WSDL: /soap?wsdl`);
});
