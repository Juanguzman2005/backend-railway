const express = require("express");
const bodyParser = require("body-parser");
const soap = require("soap");
const fs = require("fs");
const http = require("http");
const cors = require("cors");
const path = require("path");
const YAML = require("yamljs");

// ================== CONFIG ==================
const config = YAML.load(path.join(__dirname, "config.yml"));

// ================== FIREBASE ==================
const { db, admin } = require("./src/database/firebase");

// ================== EXPRESS ==================
const app = express();
app.use(cors({
  origin: ["http://localhost:5173", "https://notas-byjuanguzman.netlify.app/"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "SOAPAction", "Authorization"]
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ================== FRONTEND (DIST) ==================
const FRONTEND_PATH = path.join(__dirname, "dist");

// Servir frontend compilado
app.use(express.static(FRONTEND_PATH));

// Soporte para React Router (evita error 404 al recargar)
app.get("*", (req, res, next) => {
  if (req.originalUrl.startsWith("/soap")) return next();
  res.sendFile(path.join(FRONTEND_PATH, "index.html"));
});

// ================== SOAP ==================
const soapService = require("./src/soap/service");
const wsdlPath = path.join(__dirname, "src", "soap", "service.wsdl");
const wsdlXml = fs.readFileSync(wsdlPath, "utf8");

// ================== SERVER ==================
const server = http.createServer(app);

// Render / Railway / local
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  soap.listen(server, "/soap", soapService, wsdlXml);
  console.log(`✅ http://localhost:${PORT}`);
});

