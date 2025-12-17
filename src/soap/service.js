const { db, admin } = require("../database/firebase");
const { config } = require("../config");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendMail } = require("../utils/mailer");
const { v4: uuidv4 } = require("uuid"); // instalaremos uuid

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
              semestre
            } = args;

            // Validación básica
            if (!correo || !contraseña) {
              return callback({
                error: "Correo y contraseña son obligatorios"
              });
            }

            // Verificar si el usuario ya existe
            const existing = await db
              .collection(USERS_COLLECTION)
              .where("correo", "==", correo)
              .get();

            if (!existing.empty) {
              return callback({
                error: "Ya existe un usuario con ese correo"
              });
            }

            const hash = await bcrypt.hash(contraseña, 10);
            const docRef = await db.collection(USERS_COLLECTION).add({
              nombres: nombres || "",
              apellidos: apellidos || "",
              cedula: cedula || "",
              correo,
              carrera: carrera || "",
              contraseña_hash: hash,
              semestre: semestre || ""
            });

            return callback({
              message: "Usuario registrado correctamente",
              uid: docRef.id
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

            const valid = await bcrypt.compare(
              contraseña,
              data.contraseña_hash
            );

            if (!valid) {
              return callback({ token: "", error: "Contraseña incorrecta" });
            }

            const token = jwt.sign({ uid: doc.id }, SECRET, {
              expiresIn: "4h"
            });

            callback({ token });
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
              return callback({
                token: "",
                error: "ID Token de Google es requerido",
              });
            }

            // 1. Verificar el ID Token con Firebase Auth
            const decoded = await admin.auth().verifyIdToken(idToken);

            const googleUid = decoded.uid;
            const email = decoded.email || "";
            const displayName = decoded.name || "";
            const [firstName = "", lastName = ""] = displayName.split(" ");

            // 2. Buscar usuario por firebaseUid
            let snapshot = await db
              .collection(USERS_COLLECTION)
              .where("firebaseUid", "==", googleUid)
              .limit(1)
              .get();

            // Si no hay por firebaseUid, buscamos por correo
            if (snapshot.empty && email) {
              snapshot = await db
                .collection(USERS_COLLECTION)
                .where("correo", "==", email)
                .limit(1)
                .get();
            }

            let docRef;

            // 3. Crear usuario nuevo si no existe
            if (snapshot.empty) {
              docRef = await db.collection(USERS_COLLECTION).add({
                nombres: firstName,
                apellidos: lastName,
                cedula: "",
                correo: email,
                carrera: "",
                semestre: "",
                firebaseUid: googleUid,
                contraseña_hash: "", // no se usa para Google
              });
            } else {
              docRef = snapshot.docs[0].ref;
            }

            const uid = docRef.id;

            // 4. Generar JWT propio
            const token = jwt.sign({ uid }, SECRET, { expiresIn: "4h" });

            callback({ token, error: "" });
          } catch (err) {
            console.error("GoogleLogin error:", err);
            callback({ token: "", error: err.message });
          }
        })();
      },


      // -------------------------------------------------------------------
      // 3. OBTENER PERFIL DEL USUARIO
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
              semestre: data.semestre
            });
          } catch (err) {
            console.error("GetProfile error:", err);
            callback({ error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 4. ACTUALIZAR PERFIL DEL USUARIO
      // -------------------------------------------------------------------
      UpdateProfile(args, callback) {
        (async () => {
          try {
            const { token } = args;
            const { uid } = await verifyToken(token);

            const fieldsToUpdate = {};

            // Actualizamos solo lo que venga definido
            [
              "nombres",
              "apellidos",
              "cedula",
              "correo",
              "carrera",
              "semestre"
            ].forEach((field) => {
              if (args[field] !== undefined) {
                fieldsToUpdate[field] = args[field];
              }
            });

            if (args.nuevaContraseña) {
              const hash = await bcrypt.hash(args.nuevaContraseña, 10);
              fieldsToUpdate.contraseña_hash = hash;
            }

            await userDoc(uid).update(fieldsToUpdate);

            callback({ message: "Perfil actualizado correctamente" });
          } catch (err) {
            console.error("UpdateProfile error:", err);
            callback({ error: err.message });
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

            // Crear documento en subcolección "semestres" del usuario
            const ref = await userDoc(uid)
              .collection("semestres")
              .add({
                nombreSemestre: nombreSemestre || "",
              });

            callback({
              message: "Semestre creado correctamente",
              semestreId: ref.id,
              error: "",
            });
          } catch (err) {
            console.error("CreateSemestre error:", err);
            callback({
              message: "",
              semestreId: "",
              error: err.message,
            });
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

            const snapshot = await userDoc(uid)
              .collection("semestres")
              .get();

            const semestres = [];
            snapshot.forEach((doc) => {
              const data = doc.data();
              semestres.push({
                id: doc.id,
                nombreSemestre: data.nombreSemestre || "",
              });
            });

            console.log("ListSemestres - encontrados:", semestres.length); // 👈 debug

            callback({
              semestres: JSON.stringify(semestres), // devolvemos JSON válido
              error: "",
            });
          } catch (err) {
            console.error("ListSemestres error:", err);
            callback({
              semestres: "[]",
              error: err.message,
            });
          }
        })();
      },
      // -------------------------------------------------------------------
      // 7. CREAR MATERIA
      // -------------------------------------------------------------------
      CreateMateria(args, callback) {
        (async () => {
          try {
            const { token, semestreId, nombreMateria, creditos } = args;
            const { uid } = await verifyToken(token);

            const matRef = await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .collection("materias")
              .add({
                nombreMateria,
                creditos: Number(creditos),
                nota1: 0,
                nota2: 0,
                nota3: 0
              });

            callback({
              message: "Materia creada",
              materiaId: matRef.id
            });
          } catch (err) {
            console.error("CreateMateria error:", err);
            callback({ error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 8. LISTAR MATERIAS DE UN SEMESTRE
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
              const d = doc.data();
              materias.push({
                id: doc.id,
                nombreMateria: d.nombreMateria,
                creditos: d.creditos,
                nota1: d.nota1,
                nota2: d.nota2,
                nota3: d.nota3
              });
            });

            callback({ materias: JSON.stringify(materias) });
          } catch (err) {
            console.error("ListMaterias error:", err);
            callback({ error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 9. OBTENER UNA MATERIA
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

            if (!doc.exists) {
              return callback({ error: "Materia no encontrada" });
            }

            const d = doc.data();
            callback({
              id: doc.id,
              nombreMateria: d.nombreMateria,
              creditos: d.creditos,
              nota1: d.nota1,
              nota2: d.nota2,
              nota3: d.nota3
            });
          } catch (err) {
            console.error("GetMateria error:", err);
            callback({ error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 10. EDITAR MATERIA
      // -------------------------------------------------------------------
      UpdateMateria(args, callback) {
        (async () => {
          try {
            const { token, semestreId, materiaId, nombreMateria, creditos } =
              args;
            const { uid } = await verifyToken(token);

            const fields = {};
            if (nombreMateria !== undefined) fields.nombreMateria = nombreMateria;
            if (creditos !== undefined) fields.creditos = Number(creditos);

            await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .collection("materias")
              .doc(materiaId)
              .update(fields);

            callback({ message: "Materia actualizada" });
          } catch (err) {
            console.error("UpdateMateria error:", err);
            callback({ error: err.message });
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

            callback({ message: "Materia eliminada" });
          } catch (err) {
            console.error("DeleteMateria error:", err);
            callback({ error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 12. REGISTRAR / MODIFICAR NOTA
      // (la misma operación sirve para registrar o modificar)
      // -------------------------------------------------------------------
      RegistrarNota(args, callback) {
        (async () => {
          try {
            const { token, semestreId, materiaId, corte, nota } = args;
            const { uid } = await verifyToken(token);

            const campo = "nota" + corte; // 1, 2 o 3

            await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .collection("materias")
              .doc(materiaId)
              .update({
                [campo]: Number(nota)
              });

            callback({ message: "Nota registrada" });
          } catch (err) {
            console.error("RegistrarNota error:", err);
            callback({ error: err.message });
          }
        })();
      },

      // -------------------------------------------------------------------
      // 13. ELIMINAR NOTA (la ponemos en 0)
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
              .update({
                [campo]: 0
              });

            callback({ message: "Nota eliminada (puesta en 0)" });
          } catch (err) {
            console.error("EliminarNota error:", err);
            callback({ error: err.message });
          }
        })();
      },
      // ------------------------------------------------
      //  A. Solicitar reset de contraseña (envía correo)
      // ------------------------------------------------
      RequestPasswordReset(args, callback) {
        (async () => {
          try {
            const { correo } = args;

            if (!correo) {
              return callback({
                message: "",
                error: "El correo es obligatorio",
              });
            }

            const snapshot = await db
              .collection(USERS_COLLECTION)
              .where("correo", "==", correo)
              .limit(1)
              .get();

            if (snapshot.empty) {
              // Por seguridad, no decimos si existe o no.
              return callback({
                message:
                  "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
                error: "",
              });
            }

            const userDoc = snapshot.docs[0];
            const uid = userDoc.id;

            // Crear token único
            const token = uuidv4();

            // Guardar token en colección passwordResets
            const expiresAt = Date.now() + 1000 * 60 * 30; // 30 minutos

            await db.collection("passwordResets").doc(token).set({
              uid,
              correo,
              expiresAt,
              used: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Construir link
            const resetBaseUrl =
              process.env.RESET_BASE_URL || "http://localhost:5173/reset-password";
            const resetLink = `${resetBaseUrl}?token=${token}`;

            // Enviar correo
            const html = `
        <p>Hola,</p>
        <p>Has solicitado restablecer tu contraseña en <b>Notas Universitarias</b>.</p>
        <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Este enlace es válido por 30 minutos. Si tú no solicitaste este cambio, puedes ignorar este mensaje.</p>
      `;

            await sendMail(
              correo,
              "Restablecer contraseña - Notas Universitarias",
              html
            );

            callback({
              message:
                "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
              error: "",
            });
          } catch (err) {
            console.error("RequestPasswordReset error:", err);
            callback({
              message: "",
              error: err.message,
            });
          }
        })();
      },

      // ------------------------------------------------
      //  B. Confirmar reset (cambiar contraseña)
      // ------------------------------------------------
      ConfirmPasswordReset(args, callback) {
        (async () => {
          try {
            const { token, nuevaContraseña } = args;

            if (!token || !nuevaContraseña) {
              return callback({
                message: "",
                error: "Token y nueva contraseña son obligatorios",
              });
            }

            if (String(nuevaContraseña).length < 6) {
              return callback({
                message: "",
                error: "La contraseña debe tener al menos 6 caracteres",
              });
            }

            // Buscar el token
            const resetDoc = await db.collection("passwordResets").doc(token).get();
            if (!resetDoc.exists) {
              return callback({
                message: "",
                error: "Token inválido o ya utilizado",
              });
            }

            const data = resetDoc.data();

            if (data.used) {
              return callback({
                message: "",
                error: "Token ya utilizado",
              });
            }

            if (Date.now() > data.expiresAt) {
              return callback({
                message: "",
                error: "Token expirado, solicita uno nuevo",
              });
            }

            const uid = data.uid;

            // Actualizar contraseña del usuario
            const hash = await bcrypt.hash(nuevaContraseña, 10);
            await db.collection(USERS_COLLECTION).doc(uid).update({
              contraseña_hash: hash,
            });

            // Marcar token como usado
            await db.collection("passwordResets").doc(token).update({
              used: true,
            });

            callback({
              message: "Contraseña actualizada correctamente",
              error: "",
            });
          } catch (err) {
            console.error("ConfirmPasswordReset error:", err);
            callback({
              message: "",
              error: err.message,
            });
          }
        })();
      },
      UpdateSemestre(args, callback) {
        (async () => {
          try {
            const { token, semestreId, nombreSemestre } = args;
            const { uid } = await verifyToken(token);

            if (!semestreId) return callback({ message: "", error: "semestreId es obligatorio" });
            if (!nombreSemestre) return callback({ message: "", error: "nombreSemestre es obligatorio" });

            await userDoc(uid)
              .collection("semestres")
              .doc(semestreId)
              .update({ nombreSemestre });

            callback({ message: "Semestre actualizado correctamente", error: "" });
          } catch (err) {
            console.error("UpdateSemestre error:", err);
            callback({ message: "", error: err.message });
          }
        })();
      },
      DeleteSemestre(args, callback) {
        (async () => {
          try {
            const { token, semestreId } = args;
            const { uid } = await verifyToken(token);

            if (!semestreId) return callback({ message: "", error: "semestreId es obligatorio" });

            const semestreRef = userDoc(uid).collection("semestres").doc(semestreId);

            // Borra semestre y TODO lo de adentro (materias)
            await admin.firestore().recursiveDelete(semestreRef);

            callback({ message: "Semestre eliminado correctamente", error: "" });
          } catch (err) {
            console.error("DeleteSemestre error:", err);
            callback({ message: "", error: err.message });
          }
        })();
      },
    }
  }
};
