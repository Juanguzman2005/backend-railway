const express = require("express");
const bodyParser = require("body-parser");
const soap = require("soap");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

// Inicializa Firebase
require("./src/database/firebase");

const allowedOrigins = [
  "https://notas-byjuanguzman.netlify.app",
  "http://localhost:5173",
];

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Postman / server-to-server
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "SOAPAction"],
  credentials: false,
  optionsSuccessStatus: 204,
};

const app = express();

// ✅ CORS primero
app.use(cors(corsOptions));
// ✅ Preflight para cualquier ruta (incluye /soap)
app.options("*", cors(corsOptions));

// Body parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Endpoint de prueba
app.get("/", (req, res) => {
  res.json({
    message: "Backend de notas funcionando. API principal por SOAP en /soap",
  });
});

// SOAP + WSDL
const soapService = require("./src/soap/service");
const wsdlPath = path.join(__dirname, "src", "soap", "service.wsdl");
const wsdlXml = fs.readFileSync(wsdlPath, "utf8");

// ✅ Monta SOAP sobre express app (así lo cubre CORS)
soap.listen(app, "/soap", soapService, wsdlXml);

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`✅ API REST: /`);
  console.log(`✅ SOAP: /soap`);
  console.log(`✅ WSDL: /soap?wsdl`);
});
