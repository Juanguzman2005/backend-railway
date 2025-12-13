console.log("ENV FIREBASE_SERVICE_ACCOUNT existe?:", !!process.env.FIREBASE_SERVICE_ACCOUNT);
console.log("ENV keys contienen FIREBASE?:", Object.keys(process.env).filter(k => k.includes("FIREBASE")));
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const str = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!str) throw new Error("FIREBASE_SERVICE_ACCOUNT no configurada");

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(str)),
  });
}

const db = admin.firestore();
module.exports = { admin, db };
