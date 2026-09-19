// netlify/functions/auth.js

const admin = require("firebase-admin");

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization",
      "Access-Control-Allow-Methods":
        "GET, POST, OPTIONS"
    },
    body: JSON.stringify(data)
  };
}

function getFirebaseConfig() {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccount) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not configured in Netlify."
    );
  }

  let credentials;

  try {
    credentials = JSON.parse(serviceAccount);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT contains invalid JSON."
    );
  }

  return credentials;
}

function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const credentials = getFirebaseConfig();

  return admin.initializeApp({
    credential:
      admin.credential.cert(credentials)
  });
}

async function verifyToken(event) {
  const authHeader =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error(
      "Authorization token is required."
    );
  }

  const token =
    authHeader.substring(7).trim();

  if (!token) {
    throw new Error(
      "Authorization token is missing."
    );
  }

  const app = initializeFirebase();

  return admin
    .auth(app)
    .verifyIdToken(token);
}

exports.handler = async function (event) {

  if (event.httpMethod === "OPTIONS") {
    return json(204, {});
  }

  if (
    event.httpMethod !== "GET" &&
    event.httpMethod !== "POST"
  ) {
    return json(405, {
      success: false,
      error:
        "Only GET, POST and OPTIONS are allowed."
    });
  }

  try {
    const user = await verifyToken(event);

    const app = initializeFirebase();
    const db =
      admin.firestore(app);

    const userRef =
      db.collection("users").doc(user.uid);

    const userDoc =
      await userRef.get();

    /*
      Automatically create the customer's
      Firestore profile the first time
      our backend sees the authenticated user.
    */

    if (!userDoc.exists) {

      const newUser = {
        uid: user.uid,
        email: user.email || "",
        name:
          user.name ||
          user.email?.split("@")[0] ||
          "User",

        plan: "free",

        buildLimit: 3,

        buildsUsed: 0,

        blocked: false,

        role: "customer",

        createdAt:
          admin.firestore.FieldValue.serverTimestamp(),

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp()
      };

      await userRef.set(newUser);

      return json(200, {
        success: true,
        authenticated: true,
        user: {
          uid: newUser.uid,
          email: newUser.email,
          name: newUser.name,
          plan: newUser.plan,
          buildLimit:
            newUser.buildLimit,
          buildsUsed:
            newUser.buildsUsed,
          blocked:
            newUser.blocked,
          role:
            newUser.role
        }
      });
    }

    const data =
      userDoc.data() || {};

    /*
      Blocked customers cannot use
      the builder.
    */

    if (data.blocked === true) {
      return json(403, {
        success: false,
        authenticated: true,
        blocked: true,
        error:
          "Your account has been blocked by the administrator."
      });
    }

    return json(200, {
      success: true,
      authenticated: true,
      user: {
        uid: user.uid,
        email:
          data.email ||
          user.email ||
          "",

        name:
          data.name ||
          user.name ||
          "User",

        plan:
          data.plan ||
          "free",

        buildLimit:
          Number(data.buildLimit ?? 3),

        buildsUsed:
          Number(data.buildsUsed ?? 0),

        blocked:
          data.blocked === true,

        role:
          data.role ||
          "customer"
      }
    });

  } catch (error) {

    console.error(
      "AUTH ERROR:",
      error
    );

    return json(401, {
      success: false,
      authenticated: false,
      error:
        error.message ||
        "Authentication failed."
    });
  }
};
