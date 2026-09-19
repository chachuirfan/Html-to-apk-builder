// netlify/functions/admin.js

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

function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount =
    process.env.FIREBASE_SERVICE_ACCOUNT;

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

  return admin.initializeApp({
    credential:
      admin.credential.cert(credentials)
  });
}

async function verifyUser(event) {
  const authorization =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  if (!authorization.startsWith("Bearer ")) {
    throw new Error(
      "Authorization token is required."
    );
  }

  const token =
    authorization.substring(7).trim();

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

async function verifyAdmin(event) {
  const user =
    await verifyUser(event);

  const app = initializeFirebase();

  /*
    The owner email is kept in Netlify
    environment variables.

    This prevents a normal customer from
    making themselves an administrator.
  */

  const ownerEmail =
    process.env.OWNER_EMAIL;

  if (!ownerEmail) {
    throw new Error(
      "OWNER_EMAIL is not configured in Netlify."
    );
  }

  const userEmail =
    (user.email || "").toLowerCase();

  const configuredOwner =
    ownerEmail.toLowerCase().trim();

  /*
    Owner is always allowed.
  */

  if (userEmail === configuredOwner) {
    return {
      user,
      role: "owner"
    };
  }

  /*
    Other administrators can be granted
    admin role through Firestore.
  */

  const db =
    admin.firestore(app);

  const userDoc =
    await db
      .collection("users")
      .doc(user.uid)
      .get();

  if (!userDoc.exists) {
    throw new Error(
      "Administrator account was not found."
    );
  }

  const data =
    userDoc.data() || {};

  if (
    data.blocked === true
  ) {
    throw new Error(
      "This account is blocked."
    );
  }

  if (
    data.role !== "admin" &&
    data.role !== "owner"
  ) {
    throw new Error(
      "Administrator permission required."
    );
  }

  return {
    user,
    role:
      data.role || "admin"
  };
}

function sanitizeUser(uid, data) {
  return {
    uid,

    email:
      data.email || "",

    name:
      data.name || "User",

    plan:
      data.plan || "free",

    buildLimit:
      Number(data.buildLimit ?? 3),

    buildsUsed:
      Number(data.buildsUsed ?? 0),

    blocked:
      data.blocked === true,

    role:
      data.role || "customer",

    createdAt:
      data.createdAt || null,

    updatedAt:
      data.updatedAt || null
  };
}

exports.handler = async function (event) {

  /*
    CORS
  */

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization",
        "Access-Control-Allow-Methods":
          "GET, POST, OPTIONS"
      },
      body: ""
    };
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

    /*
      Verify Owner/Admin
    */

    const adminUser =
      await verifyAdmin(event);

    const app =
      initializeFirebase();

    const db =
      admin.firestore(app);

    /*
      GET
      Returns customer/user list.
    */

    if (event.httpMethod === "GET") {

      const snapshot =
        await db
          .collection("users")
          .orderBy(
            "createdAt",
            "desc"
          )
          .limit(500)
          .get();

      const users =
        snapshot.docs.map(doc =>
          sanitizeUser(
            doc.id,
            doc.data()
          )
        );

      return json(200, {
        success: true,

        admin: {
          uid:
            adminUser.user.uid,

          email:
            adminUser.user.email || "",

          role:
            adminUser.role
        },

        totalUsers:
          users.length,

        users
      });
    }

    /*
      POST
      Admin actions.
    */

    let body = {};

    try {
      body =
        event.body
          ? JSON.parse(event.body)
          : {};
    } catch {
      return json(400, {
        success: false,
        error:
          "Invalid JSON request body."
      });
    }

    const action =
      body.action;

    /*
      Required user ID for
      user-management actions.
    */

    const uid =
      typeof body.uid === "string"
        ? body.uid.trim()
        : "";

    if (!action) {
      return json(400, {
        success: false,
        error:
          "Admin action is required."
      });
    }

    /*
      BLOCK USER
    */

    if (action === "blockUser") {

      if (!uid) {
        return json(400, {
          success: false,
          error:
            "User UID is required."
        });
      }

      await db
        .collection("users")
        .doc(uid)
        .update({
          blocked: true,
          updatedAt:
            admin.firestore.FieldValue
              .serverTimestamp()
        });

      return json(200, {
        success: true,
        action,
        uid,
        message:
          "User has been blocked."
      });
    }

    /*
      UNBLOCK USER
    */

    if (action === "unblockUser") {

      if (!uid) {
        return json(400, {
          success: false,
          error:
            "User UID is required."
        });
      }

      await db
        .collection("users")
        .doc(uid)
        .update({
          blocked: false,
          updatedAt:
            admin.firestore.FieldValue
              .serverTimestamp()
        });

      return json(200, {
        success: true,
        action,
        uid,
        message:
          "User has been unblocked."
      });
    }

    /*
      CHANGE PLAN
    */

    if (action === "changePlan") {

      if (!uid) {
        return json(400, {
          success: false,
          error:
            "User UID is required."
        });
      }

      const allowedPlans = [
        "free",
        "pro",
        "premium"
      ];

      const plan =
        typeof body.plan === "string"
          ? body.plan.toLowerCase().trim()
          : "";

      if (!allowedPlans.includes(plan)) {
        return json(400, {
          success: false,
          error:
            "Invalid plan. Use free, pro or premium."
        });
      }

      await db
        .collection("users")
        .doc(uid)
        .update({
          plan,
          updatedAt:
            admin.firestore.FieldValue
              .serverTimestamp()
        });

      return json(200, {
        success: true,
        action,
        uid,
        plan,
        message:
          "User plan has been updated."
      });
    }

    /*
      CHANGE BUILD LIMIT
    */

    if (action === "changeBuildLimit") {

      if (!uid) {
        return json(400, {
          success: false,
          error:
            "User UID is required."
        });
      }

      const buildLimit =
        Number(body.buildLimit);

      if (
        !Number.isInteger(buildLimit) ||
        buildLimit < 0 ||
        buildLimit > 100000
      ) {
        return json(400, {
          success: false,
          error:
            "Build limit must be a whole number between 0 and 100000."
        });
      }

      await db
        .collection("users")
        .doc(uid)
        .update({
          buildLimit,
          updatedAt:
            admin.firestore.FieldValue
              .serverTimestamp()
        });

      return json(200, {
        success: true,
        action,
        uid,
        buildLimit,
        message:
          "Build limit has been updated."
      });
    }

    /*
      RESET BUILD COUNTER
    */

    if (action === "resetBuilds") {

      if (!uid) {
        return json(400, {
          success: false,
          error:
            "User UID is required."
        });
      }

      await db
        .collection("users")
        .doc(uid)
        .update({
          buildsUsed: 0,
          updatedAt:
            admin.firestore.FieldValue
              .serverTimestamp()
        });

      return json(200, {
        success: true,
        action,
        uid,
        message:
          "Build counter has been reset."
      });
    }

    /*
      MAKE ADMIN
    */

    if (action === "makeAdmin") {

      if (!uid) {
        return json(400, {
          success: false,
          error:
            "User UID is required."
        });
      }

      /*
        Only the Owner can create another
        administrator.
      */

      if (
        adminUser.role !== "owner"
      ) {
        return json(403, {
          success: false,
          error:
            "Only the Owner can create administrators."
        });
      }

      await db
        .collection("users")
        .doc(uid)
        .update({
          role: "admin",
          updatedAt:
            admin.firestore.FieldValue
              .serverTimestamp()
        });

      return json(200, {
        success: true,
        action,
        uid,
        message:
          "User has been promoted to administrator."
      });
    }

    /*
      REMOVE ADMIN
    */

    if (action === "removeAdmin") {

      if (!uid) {
        return json(400, {
          success: false,
          error:
            "User UID is required."
        });
      }

      if (
        adminUser.role !== "owner"
      ) {
        return json(403, {
          success: false,
          error:
            "Only the Owner can remove administrators."
        });
      }

      if (
        uid === adminUser.user.uid
      ) {
        return json(400, {
          success: false,
          error:
            "The Owner cannot remove their own owner access."
        });
      }

      await db
        .collection("users")
        .doc(uid)
        .update({
          role: "customer",
          updatedAt:
            admin.firestore.FieldValue
              .serverTimestamp()
        });

      return json(200, {
        success: true,
        action,
        uid,
        message:
          "Administrator access has been removed."
      });
    }

    return json(400, {
      success: false,
      error:
        "Unknown admin action."
    });

  } catch (error) {

    console.error(
      "ADMIN ERROR:",
      error
    );

    const message =
      error.message ||
      "Administrator request failed.";

    const status =
      message.includes(
        "Administrator permission"
      ) ||
      message.includes(
        "blocked"
      )
        ? 403
        : message.includes(
            "Authorization"
          )
        ? 401
        : 500;

    return json(status, {
      success: false,
      error: message
    });
  }
};
