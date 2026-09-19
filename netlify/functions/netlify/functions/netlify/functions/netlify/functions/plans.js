// netlify/functions/plans.js

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
        "GET, OPTIONS"
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

/*
  Plan configuration

  Payment is NOT processed here yet.
  These values define the service plans.
*/

const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    currency: "USD",

    buildLimit: 3,

    features: [
      "3 APK builds",
      "HTML upload",
      "ZIP upload",
      "Standard APK build",
      "Build status"
    ],

    paymentRequired: false
  },

  pro: {
    id: "pro",
    name: "Pro",
    price: 9.99,
    currency: "USD",

    buildLimit: 30,

    features: [
      "30 APK builds",
      "HTML upload",
      "ZIP upload",
      "Faster build queue",
      "Build history",
      "APK download",
      "Priority support"
    ],

    paymentRequired: true
  },

  premium: {
    id: "premium",
    name: "Premium",
    price: 19.99,
    currency: "USD",

    buildLimit: 100,

    features: [
      "100 APK builds",
      "HTML upload",
      "ZIP upload",
      "Priority APK builds",
      "Build history",
      "APK download",
      "Advanced app settings",
      "Priority support"
    ],

    paymentRequired: true
  }
};

exports.handler = async function (event) {

  /*
    CORS preflight
  */

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

  /*
    This endpoint currently uses GET.
  */

  if (event.httpMethod !== "GET") {
    return json(405, {
      success: false,
      error:
        "Only GET and OPTIONS are allowed."
    });
  }

  try {

    /*
      Public plan information can be requested
      without logging in.
    */

    const requestedPlan =
      event.queryStringParameters?.plan;

    /*
      If a specific plan was requested,
      return only that plan.
    */

    if (requestedPlan) {

      const planId =
        requestedPlan
          .toLowerCase()
          .trim();

      if (!PLANS[planId]) {
        return json(404, {
          success: false,
          error:
            "Plan not found."
        });
      }

      return json(200, {
        success: true,
        plan: PLANS[planId]
      });
    }

    /*
      Return all available plans.
    */

    return json(200, {
      success: true,
      plans: Object.values(PLANS)
    });

  } catch (error) {

    console.error(
      "PLANS ERROR:",
      error
    );

    return json(500, {
      success: false,
      error:
        error.message ||
        "Unable to load plans."
    });
  }
};
