const express = require("express");
const bodyParser = require("body-parser");
const soap = require("soap");
const fs = require("fs");
const http = require("http");
const cors = require("cors");
const path = require("path");

// 🔥 NO config.yml en producción
// Railway / PM2 / servidores usan process.env

// Inicializa Firebase
const { db, admin } = require("./src/database/firebase");
const allowedOrigins = [
  "https://notas-byjuanguzman.netlify.app",
  "http://localhost:5173",
];

// Crear app de Express
const app = express();
app.use(
  cors({
    origin: function (origin, callback) {
      // permitir herramientas tipo Postman o llamadas sin origin
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error("Not allowed by CORS: " + origin));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "SOAPAction"],
    credentials: false,
  })
);

// 👇 importante: responder preflight
app.options("*", cors());
app.options("/soap", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, SOAPAction");
  return res.sendStatus(204);
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Endpoint de prueba
app.get("/", (req, res) => {
  res.json({
    message: "Backend de notas funcionando. API principal por SOAP en /soap",
  });
});

// Servicio SOAP
const soapService = require("./src/soap/service");
const wsdlPath = path.join(__dirname, "src", "soap", "service.wsdl");
const wsdlXml = fs.readFileSync(wsdlPath, "utf8");

// Servidor HTTP
const server = http.createServer(app);

// 🔑 Railway usa process.env.PORT
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  soap.listen(server, "/soap", soapService, wsdlXml);
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`✅ WSDL: /soap?wsdl`);
});
