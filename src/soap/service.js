const { db, admin } = require("../database/firebase");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendMail } = require("../utils/mailer");
const { v4: uuidv4 } = require("uuid");

const SECRET = process.env.JWT_SECRET || "CLAVE_SUPER_SECRETA";
const USERS_COLLECTION = "usuarios";

// Utilidad para verificar token
async function verifyToken(token) {
  try {
    const payload = jwt.verify(token, SECRET);
    return payload; // { uid }
  } catch (err) {
    throw new Error("Token inválido o expirado");
  }
}

// Helper: obtener referencia de usuario
function userDoc(uid) {
  return db.collection(USERS_COLLECTION).doc(uid);
}

/**
 * ✅ Helper REAL para borrar documentos de una subcolección en batches
 * (Firestore no borra subcolecciones automáticamente)
 */
async function deleteCollection(collectionRef, batchSize = 50) {
  const snap = await collectionRef.limit(batchSize).get();
  if (snap.empty) return;

  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  // Repite hasta vaciar
  await deleteCollection(collectionRef, batchSize);
}

module.exports = {
  StudentService: {
    StudentPort: {
      // -------------------------------------------------------------------
      // 1. REGISTRAR ESTUDIANTE
      // -------------------------------------------------------------------
      RegisterStudent(args, callback) {
        (async () => {
          try {
            const {
              nombres,
              apellidos,
              cedula,
              correo,
              carrera,
              contraseña,
              semestre,
            } = args;

            if (!correo || !contraseña) {
              return callback({ error: "Correo y contraseña son obligatorios" });
            }

            const existing = await db
              .collection(USERS_COLLECTION)
              .where("correo", "==", correo)
              .get();

            if (!existing.empty) {
              return callback({ error: "Ya existe un usuario con ese correo" });
            }

            const hash = await bcrypt.hash(contraseña, 10);
            const docRef = await db.collection(USERS_COLLECTION).add({
              nombres: nombres || "",
              apellidos: apellidos || "",
              cedula: cedula || "",
              correo,
              carrera: carrera || "",
              contraseña_hash: hash,
              semestre: semestre || "",
            });

            return callback({
              message: "Usuario registrado correctamente",
              uid: docRef.id,
            });
          } catch (err) {
            console.error("RegisterStudent error:", err);
            callback({ error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 2. LOGIN
      // -------------------------------------------------------------------
      Login(args, callback) {
        (async () => {
          try {
            const { correo, contraseña } = args;

            const snapshot = await db
              .collection(USERS_COLLECTION)
              .where("correo", "==", correo)
              .limit(1)
              .get();

            if (snapshot.empty) {
              return callback({ token: "", error: "Usuario no encontrado" });
            }

            const doc = snapshot.docs[0];
            const data = doc.data();

            const valid = await bcrypt.compare(contraseña, data.contraseña_hash);

            if (!valid) {
              return callback({ token: "", error: "Contraseña incorrecta" });
            }

            const token = jwt.sign({ uid: doc.id }, SECRET, { expiresIn: "4h" });
            callback({ token, error: "" });
          } catch (err) {
            console.error("Login error:", err);
            callback({ token: "", error: err.message });
          }
        })();
      },

      GoogleLogin(args, callback) {
        (async () => {
          try {
            const { idToken } = args;

            if (!idToken) {
              return callback({ token: "", error: "ID Token de Google es requerido" });
            }

            const decoded = await admin.auth().verifyIdToken(idToken);

            const googleUid = decoded.uid;
            const email = decoded.email || "";
            const displayName = decoded.name || "";
            const [firstName = "", lastName = ""] = displayName.split(" ");

            let snapshot = await db
              .collection(USERS_COLLECTION)
              .where("firebaseUid", "==", googleUid)
              .limit(1)
              .get();

            if (snapshot.empty && email) {
              snapshot = await db
                .collection(USERS_COLLECTION)
                .where("correo", "==", email)
                .limit(1)
                .get();
            }

            let docRef;
            if (snapshot.empty) {
              docRef = await db.collection(USERS_COLLECTION).add({
                nombres: firstName,
                apellidos: lastName,
                cedula: "",
                correo: email,
                carrera: "",
                semestre: "",
                firebaseUid: googleUid,
                contraseña_hash: "",
              });
            } else {
              docRef = snapshot.docs[0].ref;
            }

            const uid = docRef.id;
            const token = jwt.sign({ uid }, SECRET, { expiresIn: "4h" });

            callback({ token, error: "" });
          } catch (err) {
            console.error("GoogleLogin error:", err);
            callback({ token: "", error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 3. OBTENER PERFIL
      // -------------------------------------------------------------------
      GetProfile(args, callback) {
        (async () => {
          try {
            const { token } = args;
            const { uid } = await verifyToken(token);

            const doc = await userDoc(uid).get();
            if (!doc.exists) return callback({ error: "Usuario no encontrado" });

            const data = doc.data();
            callback({
              uid,
              nombres: data.nombres,
              apellidos: data.apellidos,
              cedula: data.cedula,
              correo: data.correo,
              carrera: data.carrera,
              semestre: data.semestre,
              error: "",
            });
          } catch (err) {
            console.error("GetProfile error:", err);
            callback({ error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 4. UPDATE PROFILE
      // -------------------------------------------------------------------
      UpdateProfile(args, callback) {
        (async () => {
          try {
            const { token } = args;
            const { uid } = await verifyToken(token);

            const fieldsToUpdate = {};
            ["nombres", "apellidos", "cedula", "correo", "carrera", "semestre"].forEach(
              (field) => {
                if (args[field] !== undefined) fieldsToUpdate[field] = args[field];
              }
            );

            if (args.nuevaContraseña) {
              const hash = await bcrypt.hash(args.nuevaContraseña, 10);
              fieldsToUpdate.contraseña_hash = hash;
            }

            await userDoc(uid).update(fieldsToUpdate);

            callback({ message: "Perfil actualizado correctamente", error: "" });
          } catch (err) {
            console.error("UpdateProfile error:", err);
            callback({ message: "", error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 5. CREAR SEMESTRE
      // -------------------------------------------------------------------
      CreateSemestre(args, callback) {
        (async () => {
          try {
            const { token, nombreSemestre } = args;
            const { uid } = await verifyToken(token);

            const ref = await userDoc(uid).collection("semestres").add({
              nombreSemestre: nombreSemestre || "",
            });

            callback({
              message: "Semestre creado correctamente",
              semestreId: ref.id,
              error: "",
            });
          } catch (err) {
            console.error("CreateSemestre error:", err);
            callback({ message: "", semestreId: "", error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 6. LISTAR SEMESTRES
      // -------------------------------------------------------------------
      ListSemestres(args, callback) {
        (async () => {
          try {
            const { token } = args;
            const { uid } = await verifyToken(token);

            const snapshot = await userDoc(uid).collection("semestres").get();

            const semestres = [];
            snapshot.forEach((doc) => {
              const data = doc.data();
              semestres.push({
                id: doc.id,
                nombreSemestre: data.nombreSemestre || "",
              });
            });

            callback({ semestres: JSON.stringify(semestres), error: "" });
          } catch (err) {
            console.error("ListSemestres error:", err);
            callback({ semestres: "[]", error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // ✅ 7. UPDATE SEMESTRE (ARREGLADO)
      // -------------------------------------------------------------------
      UpdateSemestre(args, callback) {
        (async () => {
          try {
            const token = args?.token;
            const semestreId = String(args?.semestreId ?? "").trim();
            const nombreRaw = String(args?.nombreSemestre ?? "").trim();

            if (!token) return callback({ message: "", error: "No hay token" });
            if (!semestreId) return callback({ message: "", error: "semestreId es obligatorio" });

            // Permite letras, números, espacios, tildes, ñ, (), guion -
            const permitido = /^[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s\-\(\)]+$/;

            if (!nombreRaw) return callback({ message: "", error: "El nombre del semestre es obligatorio" });
            if (nombreRaw.length > 30) return callback({ message: "", error: "Máximo 30 caracteres" });
            if (!permitido.test(nombreRaw)) {
              return callback({
                message: "",
                error: "Nombre inválido. Solo letras, números, espacios, (), y guion -",
              });
            }

            const { uid } = await verifyToken(token);

            await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .update({ nombreSemestre: nombreRaw });

            callback({ message: "Semestre actualizado", error: "" });
          } catch (err) {
            console.error("UpdateSemestre error:", err);
            callback({ message: "", error: err.message || "Error actualizando semestre" });
          }
        })();
      },

      // -------------------------------------------------------------------
      // ✅ 8. DELETE SEMESTRE (ARREGLADO SIN recursiveDelete)
      // -------------------------------------------------------------------
      DeleteSemestre(args, callback) {
        (async () => {
          try {
            const { token, semestreId } = args;
            if (!token) return callback({ message: "", error: "No hay token" });
            if (!semestreId) return callback({ message: "", error: "semestreId es obligatorio" });

            const { uid } = await verifyToken(token);

            const semestreRef = userDoc(uid).collection("semestres").doc(semestreId);

            // 1) borrar subcolección materias
            await deleteCollection(semestreRef.collection("materias"), 50);

            // 2) borrar el doc semestre
            await semestreRef.delete();

            callback({ message: "Semestre eliminado correctamente", error: "" });
          } catch (err) {
            console.error("DeleteSemestre error:", err);
            callback({ message: "", error: err.message || "Error eliminando semestre" });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 7. CREAR MATERIA
      // -------------------------------------------------------------------
      CreateMateria(args, callback) {
        (async () => {
          try {
            const { token, semestreId, nombreMateria, creditos, nombreProfesor } = args;
            const { uid } = await verifyToken(token);

            const nombre = String(nombreMateria ?? "").trim();
            const creditosNum = Number(creditos);
            const profesor = String(nombreProfesor ?? "").trim();

            if (!semestreId) return callback({ message: "", error: "semestreId es obligatorio" });

            if (!nombre) return callback({ message: "", error: "El nombre de la materia es obligatorio" });
            if (nombre.length > 30) return callback({ message: "", error: "El nombre debe tener máximo 30 caracteres" });

            if (!Number.isInteger(creditosNum) || creditosNum < 1 || creditosNum > 10) {
              return callback({ message: "", error: "Los créditos deben estar entre 1 y 10" });
            }

            if (!profesor) return callback({ message: "", error: "El nombre del profesor es obligatorio" });
            if (profesor.length > 40) return callback({ message: "", error: "El nombre del profesor debe tener máximo 40 caracteres" });
            if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(profesor)) {
              return callback({ message: "", error: "Nombre de profesor inválido: solo letras y espacios" });
            }

            const matRef = await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .collection("materias")
              .add({
                nombreMateria: nombre,
                creditos: creditosNum,
                nombreProfesor: profesor, // ✅ NUEVO
                nota1: 0,
                nota2: 0,
                nota3: 0,
              });

            callback({ message: "Materia creada", materiaId: matRef.id, error: "" });
          } catch (err) {
            console.error("CreateMateria error:", err);
            callback({ message: "", error: err.message || "Error creando materia" });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 8. LISTAR MATERIAS
      // -------------------------------------------------------------------
      ListMaterias(args, callback) {
        (async () => {
          try {
            const { token, semestreId } = args;
            const { uid } = await verifyToken(token);

            const snapshot = await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .collection("materias")
              .get();

            const materias = [];
            snapshot.forEach((doc) => {
              const d = doc.data() || {};
              materias.push({
                id: doc.id,
                nombreMateria: d.nombreMateria,
                creditos: d.creditos,
                nombreProfesor: d.nombreProfesor || "", // ✅ NUEVO
                nota1: d.nota1,
                nota2: d.nota2,
                nota3: d.nota3,
              });
            });

            callback({ materias: JSON.stringify(materias), error: "" });
          } catch (err) {
            console.error("ListMaterias error:", err);
            callback({ materias: "[]", error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 9. OBTENER MATERIA
      // -------------------------------------------------------------------
      GetMateria(args, callback) {
        (async () => {
          try {
            const { token, semestreId, materiaId } = args;
            const { uid } = await verifyToken(token);

            const doc = await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .collection("materias")
              .doc(materiaId)
              .get();

            if (!doc.exists) return callback({ error: "Materia no encontrada" });

            const d = doc.data() || {};
            callback({
              id: doc.id,
              nombreMateria: d.nombreMateria,
              creditos: String(d.creditos ?? ""),
              nombreProfesor: d.nombreProfesor || "", // ✅ NUEVO
              nota1: String(d.nota1 ?? 0),
              nota2: String(d.nota2 ?? 0),
              nota3: String(d.nota3 ?? 0),
              error: "",
            });
          } catch (err) {
            console.error("GetMateria error:", err);
            callback({ error: err.message });
          }
        })();
      },


      // -------------------------------------------------------------------
      // 10. ACTUALIZAR MATERIA
      // -------------------------------------------------------------------
      UpdateMateria(args, callback) {
        (async () => {
          try {
            const { token, semestreId, materiaId, nombreMateria, creditos, nombreProfesor } = args;
            const { uid } = await verifyToken(token);

            if (!semestreId) return callback({ message: "", error: "semestreId es obligatorio" });
            if (!materiaId) return callback({ message: "", error: "materiaId es obligatorio" });

            const fields = {};

            if (nombreMateria !== undefined) {
              const nombre = String(nombreMateria ?? "").trim();
              if (!nombre) return callback({ message: "", error: "El nombre de la materia es obligatorio" });
              if (nombre.length > 30) return callback({ message: "", error: "El nombre debe tener máximo 30 caracteres" });
              fields.nombreMateria = nombre;
            }

            if (creditos !== undefined) {
              const creditosNum = Number(creditos);
              if (!Number.isInteger(creditosNum) || creditosNum < 1 || creditosNum > 10) {
                return callback({ message: "", error: "Los créditos deben estar entre 1 y 10" });
              }
              fields.creditos = creditosNum;
            }

            // ✅ NUEVO: profesor (permite actualizarlo y también agregarlo a materias viejas)
            if (nombreProfesor !== undefined) {
              const profesor = String(nombreProfesor ?? "").trim();
              if (!profesor) return callback({ message: "", error: "El nombre del profesor es obligatorio" });
              if (profesor.length > 40) return callback({ message: "", error: "El nombre del profesor debe tener máximo 40 caracteres" });
              if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(profesor)) {
                return callback({ message: "", error: "Nombre de profesor inválido: solo letras y espacios" });
              }
              fields.nombreProfesor = profesor;
            }

            if (Object.keys(fields).length === 0) {
              return callback({ message: "", error: "No hay campos para actualizar" });
            }

            await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .collection("materias")
              .doc(materiaId)
              .update(fields);

            callback({ message: "Materia actualizada", error: "" });
          } catch (err) {
            console.error("UpdateMateria error:", err);
            callback({ message: "", error: err.message || "Error actualizando materia" });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 11. BORRAR MATERIA
      // -------------------------------------------------------------------
      DeleteMateria(args, callback) {
        (async () => {
          try {
            const { token, semestreId, materiaId } = args;
            const { uid } = await verifyToken(token);

            await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .collection("materias")
              .doc(materiaId)
              .delete();

            callback({ message: "Materia eliminada", error: "" });
          } catch (err) {
            console.error("DeleteMateria error:", err);
            callback({ message: "", error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 12. REGISTRAR / MODIFICAR NOTA
      // -------------------------------------------------------------------
      RegistrarNota(args, callback) {
        (async () => {
          try {
            const { token, semestreId, materiaId, corte, nota } = args;
            const { uid } = await verifyToken(token);

            const campo = "nota" + corte;

            await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .collection("materias")
              .doc(materiaId)
              .update({ [campo]: Number(nota) });

            callback({ message: "Nota registrada", error: "" });
          } catch (err) {
            console.error("RegistrarNota error:", err);
            callback({ message: "", error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 13. ELIMINAR NOTA
      // -------------------------------------------------------------------
      EliminarNota(args, callback) {
        (async () => {
          try {
            const { token, semestreId, materiaId, corte } = args;
            const { uid } = await verifyToken(token);

            const campo = "nota" + corte;

            await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .collection("materias")
              .doc(materiaId)
              .update({ [campo]: 0 });

            callback({ message: "Nota eliminada (puesta en 0)", error: "" });
          } catch (err) {
            console.error("EliminarNota error:", err);
            callback({ message: "", error: err.message });
          }
        })();
      },

      // ------------------------------------------------
      // A. RequestPasswordReset
      // ------------------------------------------------
      RequestPasswordReset(args, callback) {
        (async () => {
          let done = false;
          const callbackOnce = (payload) => {
            if (done) return;
            done = true;
            callback(payload);
          };

          const GENERIC_MSG =
            "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.";

          try {
            const correoRaw = args?.correo ?? "";
            const correo = String(correoRaw).trim().toLowerCase();

            // ✅ máximo 40
            if (!correo) return callbackOnce({ message: "", error: "El correo es obligatorio" });
            if (correo.length > 40) return callbackOnce({ message: "", error: "Máximo 40 caracteres" });

            const snapshot = await db
              .collection(USERS_COLLECTION)
              .where("correo", "==", correo)
              .limit(1)
              .get();

            // 🔐 Siempre misma respuesta
            if (snapshot.empty) return callbackOnce({ message: GENERIC_MSG, error: "" });

            const uid = snapshot.docs[0].id;

            const token = uuidv4();
            const expiresAt = Date.now() + 1000 * 60 * 30;

            await db.collection("passwordResets").doc(token).set({
              uid,
              correo,
              expiresAt,
              used: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            const resetBaseUrl =
              process.env.RESET_BASE_URL || "http://localhost:5173/reset-password";

            const resetLink = `${resetBaseUrl}?token=${encodeURIComponent(token)}`;

            const html = `
        <p>Hola,</p>
        <p>Has solicitado restablecer tu contraseña en <b>Notas Universitarias</b>.</p>
        <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Este enlace es válido por 30 minutos.</p>
      `;

            // ✅ Intentar enviar, pero JAMÁS romper la respuesta SOAP
            try {
              const r = await sendMail(correo, "Restablecer contraseña - Notas Universitarias", html);
              if (r?.ok) console.log("✅ Email enviado:", correo);
              else console.warn("⚠️ Email NO enviado (skipped):", correo);
            } catch (mailErr) {
              console.error("❌ SMTP falló:", mailErr?.message || mailErr);
            }

            return callbackOnce({ message: GENERIC_MSG, error: "" });

          } catch (err) {
            console.error("RequestPasswordReset error:", err);
            return callbackOnce({ message: "", error: "Error procesando la solicitud" });
          }
        })();
      },

      // ------------------------------------------------
      // B. ConfirmPasswordReset
      // ------------------------------------------------
      ConfirmPasswordReset(args, callback) {
        (async () => {
          let done = false;
          const callbackOnce = (payload) => {
            if (done) return;
            done = true;
            callback(payload);
          };

          try {
            const token = String(args?.token ?? "").trim();
            const nuevaContraseña = String(args?.nuevaContraseña ?? "");

            if (!token || !nuevaContraseña) {
              return callbackOnce({ message: "", error: "Token y nueva contraseña son obligatorios" });
            }
            if (nuevaContraseña.length < 6) {
              return callbackOnce({ message: "", error: "La contraseña debe tener al menos 6 caracteres" });
            }

            const resetRef = db.collection("passwordResets").doc(token);
            const resetDoc = await resetRef.get();

            if (!resetDoc.exists) {
              return callbackOnce({ message: "", error: "Token inválido o ya utilizado" });
            }

            const data = resetDoc.data() || {};
            if (data.used) return callbackOnce({ message: "", error: "Token ya utilizado" });

            if (Date.now() > Number(data.expiresAt || 0)) {
              try {
                await resetRef.update({
                  used: true,
                  usedAt: admin.firestore.FieldValue.serverTimestamp(),
                  reason: "expired",
                });
              } catch { }
              return callbackOnce({ message: "", error: "Token expirado, solicita uno nuevo" });
            }

            const uid = data.uid;
            if (!uid) return callbackOnce({ message: "", error: "Token inválido (sin usuario asociado)" });

            const hash = await bcrypt.hash(nuevaContraseña, 10);

            await db.collection(USERS_COLLECTION).doc(uid).update({
              contraseña_hash: hash,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            await resetRef.update({
              used: true,
              usedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return callbackOnce({ message: "Contraseña actualizada correctamente", error: "" });
          } catch (err) {
            console.error("ConfirmPasswordReset error:", err);
            return callbackOnce({ message: "", error: "Error actualizando la contraseña" });
          }
        })();
      },
    },
  },
};
