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
