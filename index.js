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

// Crear app de Express
const app = express();
app.use(cors());
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
