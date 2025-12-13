const express = require("express");
const bodyParser = require("body-parser");
const soap = require("soap");
const fs = require("fs");
const http = require("http");
const cors = require("cors");
const path = require("path");

// Inicializa Firebase
require("./src/database/firebase"); // si no usas db/admin aquí, basta con inicializar

const allowedOrigins = [
  "https://notas-byjuanguzman.netlify.app",
  "http://localhost:5173",
];

const app = express();

// ✅ CORS para rutas normales (REST)
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "SOAPAction"],
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Endpoint de prueba
app.get("/", (req, res) => {
  res.json({
    message: "Backend de notas funcionando. API principal por SOAP en /soap",
  });
});

// Servidor HTTP
const server = http.createServer(app);

// ✅ CORS a nivel de SERVER para /soap (esto es lo que faltaba)
server.prependListener("request", (req, res) => {
  if (!req.url) return;

  // Solo para /soap (incluye /soap?wsdl)
  if (req.url.startsWith("/soap")) {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, SOAPAction");

    // Responder preflight
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
  }
});

// Servicio SOAP
const soapService = require("./src/soap/service");
const wsdlPath = path.join(__dirname, "src", "soap", "service.wsdl");
const wsdlXml = fs.readFileSync(wsdlPath, "utf8");

// Railway usa process.env.PORT
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  soap.listen(server, "/soap", soapService, wsdlXml);
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`✅ WSDL: /soap?wsdl`);
});
