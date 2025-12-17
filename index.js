const express = require("express");
const bodyParser = require("body-parser");
const soap = require("soap");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

// Inicializa Firebase
require("./src/database/firebase");

// ✅ CREA app ANTES de usar app.use
const app = express();

// ✅ Orígenes permitidos fijos
const allowedOrigins = [
  "http://localhost:5173",
  // Si quieres forzar solo tu dominio, descomenta y pon el tuyo:
  // "https://notas-byjuanguzman2005.netlify.app",
];

// ✅ Permitir cualquier subdominio de netlify
const isNetlify = (origin) => origin && origin.endsWith(".netlify.app");

// ✅ Una sola config de CORS
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Postman / server-to-server
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (isNetlify(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "SOAPAction"],
  credentials: false,
  optionsSuccessStatus: 204,
};

// ✅ CORS primero
app.use(cors(corsOptions));
// ✅ Preflight para todas las rutas (incluye /soap)
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

// ✅ SOAP montado sobre Express (queda cubierto por CORS)
soap.listen(app, "/soap", soapService, wsdlXml);

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`✅ API REST: /`);
  console.log(`✅ SOAP: /soap`);
  console.log(`✅ WSDL: /soap?wsdl`);
});
