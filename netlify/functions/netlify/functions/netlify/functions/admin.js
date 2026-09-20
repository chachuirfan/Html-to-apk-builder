const admin = require("firebase-admin");

function getFirebaseApp() {

  if (admin.apps.length) {
    return admin.app();
  }

  const serviceAccount =
    JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT
    );

  return admin.initializeApp({
    credential:
      admin.credential.cert(serviceAccount),

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
        "GET, POST, OPTIONS"
    },
    body: JSON.stringify(data)
  };
}

async function verifyRequest(event) {

  const authHeader =
    event.headers.authorization ||
    event.headers.Authorization;

  if (!authHeader ||
      !authHeader.startsWith("Bearer ")) {
    throw new Error(
      "Authorization token is required."
    );
  }

  const token =
    authHeader.substring(7);

  return await admin
    .auth()
    .verifyIdToken(token);
}

async function getUser(uid) {

  const snapshot =
    await db.ref(`users/${uid}`)
      .once("value");

  return snapshot.exists()
    ? snapshot.val()
    : null;
}

exports.handler = async function(event) {

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

  try {

    const decoded =
      await verifyRequest(event);

    const ownerEmail =
      process.env.OWNER_EMAIL || "";

    const isOwner =
      decoded.email &&
      decoded.email.toLowerCase() ===
      ownerEmail.toLowerCase();

    const currentUser =
      await getUser(decoded.uid);

    const isAdmin =
      isOwner ||
      (
        currentUser &&
        currentUser.role === "admin"
      );

    if (!isAdmin) {
      return json(403, {
        success: false,
        error: "Admin access required."
      });
    }

    /*
     * GET USERS
     */

    if (event.httpMethod === "GET") {

      const snapshot =
        await db.ref("users")
          .once("value");

      const data =
        snapshot.val() || {};

      const users =
        Object.values(data)
          .sort(
            (a, b) =>
              (b.createdAt || 0) -
              (a.createdAt || 0)
          )
          .slice(0, 500);

      return json(200, {
        success: true,
        users: users
      });
    }

    /*
     * POST ACTION
     */

    if (event.httpMethod !== "POST") {
      return json(405, {
        success: false,
        error: "Method not allowed."
      });
    }

    let body = {};

    try {
      body =
        JSON.parse(event.body || "{}");
    } catch {
      return json(400, {
        success: false,
        error: "Invalid JSON."
      });
    }

    const action =
      body.action;

    const targetUid =
      body.uid ||
      body.userId;

    if (!action) {
      return json(400, {
        success: false,
        error: "Action is required."
      });
    }

    if (!targetUid) {
      return json(400, {
        success: false,
        error: "User ID is required."
      });
    }

    const targetRef =
      db.ref(`users/${targetUid}`);

    const targetSnapshot =
      await targetRef.once("value");

    if (!targetSnapshot.exists()) {
      return json(404, {
        success: false,
        error: "User not found."
      });
    }

    const target =
      targetSnapshot.val();

    /*
     * BLOCK
     */

    if (action === "blockUser") {

      await targetRef.update({
        blocked: true,
        updatedAt: Date.now()
      });

      return json(200, {
        success: true,
        message: "User blocked."
      });
    }

    /*
     * UNBLOCK
     */

    if (action === "unblockUser") {

      await targetRef.update({
        blocked: false,
        updatedAt: Date.now()
      });

      return json(200, {
        success: true,
        message: "User unblocked."
      });
    }

    /*
     * CHANGE PLAN
     */

    if (action === "changePlan") {

      const plan =
        body.plan;

      if (
        !["free", "pro", "premium"]
          .includes(plan)
      ) {
        return json(400, {
          success: false,
          error: "Invalid plan."
        });
      }

      const limits = {
        free: 3,
        pro: 30,
        premium: 100
      };

      await targetRef.update({
        plan: plan,
        buildLimit:
          limits[plan],
        updatedAt:
          Date.now()
      });

      return json(200, {
        success: true,
        message:
          "Plan changed successfully."
      });
    }

    /*
     * CHANGE BUILD LIMIT
     */

    if (action === "changeBuildLimit") {

      const limit =
        Number(body.buildLimit);

      if (
        !Number.isInteger(limit) ||
        limit < 0
      ) {
        return json(400, {
          success: false,
          error: "Invalid build limit."
        });
      }

      await targetRef.update({
        buildLimit: limit,
        updatedAt: Date.now()
      });

      return json(200, {
        success: true,
        message:
          "Build limit changed."
      });
    }

    /*
     * RESET BUILDS
     */

    if (action === "resetBuilds") {

      await targetRef.update({
        buildsUsed: 0,
        updatedAt: Date.now()
      });

      return json(200, {
        success: true,
        message:
          "Build count reset."
      });
    }

    /*
     * MAKE ADMIN
     */

    if (action === "makeAdmin") {

      if (!isOwner) {
        return json(403, {
          success: false,
          error:
            "Only the owner can make admins."
        });
      }

      await targetRef.update({
        role: "admin",
        updatedAt: Date.now()
      });

      return json(200, {
        success: true,
        message:
          "User is now an admin."
      });
    }

    /*
     * REMOVE ADMIN
     */

    if (action === "removeAdmin") {

      if (!isOwner) {
        return json(403, {
          success: false,
          error:
            "Only the owner can remove admins."
        });
      }

      await targetRef.update({
        role: "customer",
        updatedAt: Date.now()
      });

      return json(200, {
        success: true,
        message:
          "Admin removed."
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

    return json(500, {
      success: false,
      error:
        error.message ||
        "Admin operation failed."
    });
  }
};
