const admin = require("firebase-admin");
const path = require("path");

// ✅ Ruta correcta: backend/firebase-key.json
const keyPath = path.join(__dirname, "..", "..", "firebase-key.json");
console.log("Buscando firebase-key en:", keyPath);

let serviceAccount;
try {
  serviceAccount = require(keyPath);
} catch (e) {
  throw new Error(
    `No se encontró firebase-key.json en: ${keyPath}\n` +
    `Asegúrate de que el archivo exista en la raíz del backend: backend/firebase-key.json`
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = { admin, db };
