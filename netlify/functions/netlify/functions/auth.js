const admin = require("firebase-admin");

function getFirebaseApp() {
  if (admin.apps.length) {
    return admin.app();
  }

  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT
  );

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL:
      process.env.FIREBASE_DATABASE_URL ||
      `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
  });
}

getFirebaseApp();

const db = admin.database();

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization",
      "Access-Control-Allow-Methods":
        "GET, OPTIONS"
    },
    body: JSON.stringify(data)
  };
}

exports.handler = async function (event) {

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization",
        "Access-Control-Allow-Methods":
          "GET, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "GET") {
    return json(405, {
      success: false,
      error: "Only GET is allowed."
    });
  }

  try {

    const authHeader =
      event.headers.authorization ||
      event.headers.Authorization;

    if (!authHeader ||
        !authHeader.startsWith("Bearer ")) {
      return json(401, {
        success: false,
        error: "Authorization token is required."
      });
    }

    const idToken =
      authHeader.substring(7);

    const decoded =
      await admin.auth().verifyIdToken(idToken);

    const uid = decoded.uid;

    const userRef =
      db.ref(`users/${uid}`);

    const snapshot =
      await userRef.once("value");

    let user = snapshot.val();

    if (!user) {

      user = {
        uid: uid,
        email: decoded.email || "",
        name:
          decoded.name ||
          (decoded.email
            ? decoded.email.split("@")[0]
            : "User"),

        plan: "free",
        buildLimit: 3,
        buildsUsed: 0,
        blocked: false,
        role: "customer",

        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await userRef.set(user);

    } else {

      user = {
        ...user,
        uid: uid,
        email:
          user.email ||
          decoded.email ||
          ""
      };

      await userRef.update({
        email: user.email,
        updatedAt: Date.now()
      });
    }

    if (user.blocked === true) {
      return json(403, {
        success: false,
        blocked: true,
        error:
          "Your account has been blocked."
      });
    }

    return json(200, {
      success: true,
      user: user
    });

  } catch (error) {

    console.error(
      "AUTH ERROR:",
      error
    );

    return json(500, {
      success: false,
      error:
        error.message ||
        "Unable to load user profile."
    });
  }
};
