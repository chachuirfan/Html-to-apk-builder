// netlify/functions/start-build.js

const crypto = require("crypto");
const admin = require("firebase-admin");

const GITHUB_API = "https://api.github.com";

/* -------------------------------------------------------
   Firebase Admin initialization - Realtime Database
------------------------------------------------------- */

function getFirebaseAdmin() {

  if (admin.apps.length) {
    return admin.app();
  }

  const serviceAccountText =
    process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountText) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not configured in Netlify."
    );
  }

  let serviceAccount;

  try {
    serviceAccount =
      JSON.parse(serviceAccountText);
  } catch (error) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT contains invalid JSON."
    );
  }

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ||
    `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`;

  return admin.initializeApp({
    credential:
      admin.credential.cert(serviceAccount),

    databaseURL:
      databaseURL
  });
}

/* -------------------------------------------------------
   JSON response helper
------------------------------------------------------- */

function json(statusCode, data) {

  return {
    statusCode,

    headers: {
      "Content-Type":
        "application/json",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Headers":
        "Content-Type, Authorization",

      "Access-Control-Allow-Methods":
        "POST, OPTIONS"
    },

    body:
      JSON.stringify(data)
  };
}

/* -------------------------------------------------------
   Firebase authentication
------------------------------------------------------- */

async function authenticateUser(event) {

  getFirebaseAdmin();

  const authHeader =
    event.headers.authorization ||
    event.headers.Authorization ||
    "";

  if (!authHeader.startsWith("Bearer ")) {

    throw new Error(
      "Authentication required. Please login first."
    );
  }

  const idToken =
    authHeader
      .substring(7)
      .trim();

  if (!idToken) {

    throw new Error(
      "Authentication token is missing."
    );
  }

  try {

    const decoded =
      await admin
        .auth()
        .verifyIdToken(idToken);

    return decoded;

  } catch (error) {

    console.error(
      "Firebase token verification failed:",
      error
    );

    throw new Error(
      "Your login session is invalid or expired. Please login again."
    );
  }
}

/* -------------------------------------------------------
   Get customer profile from Realtime Database
------------------------------------------------------- */

async function getUserProfile(
  uid,
  decodedUser
) {

  getFirebaseAdmin();

  const db =
    admin.database();

  const userRef =
    db.ref(`users/${uid}`);

  const snapshot =
    await userRef.once("value");

  if (!snapshot.exists()) {

    const email =
      decodedUser.email || "";

    const profile = {

      uid,

      email,

      name:
        decodedUser.name ||
        (
          email
            ? email.split("@")[0]
            : "Customer"
        ),

      role:
        "customer",

      plan:
        "free",

      buildLimit:
        3,

      buildsUsed:
        0,

      blocked:
        false,

      createdAt:
        Date.now(),

      updatedAt:
        Date.now()
    };

    await userRef.set(
      profile
    );

    return profile;
  }

  const existingUser =
    snapshot.val() || {};

  return {

    uid,

    ...existingUser
  };
}

/* -------------------------------------------------------
   Multipart helpers
------------------------------------------------------- */

function getBoundary(contentType) {

  const match =
    contentType.match(
      /boundary=(?:"([^"]+)"|([^;]+))/i
    );

  return match
    ? match[1] || match[2]
    : null;
}

function parseMultipart(
  buffer,
  contentType
) {

  const boundary =
    getBoundary(contentType);

  if (!boundary) {

    throw new Error(
      "Multipart boundary not found."
    );
  }

  const delimiter =
    Buffer.from(
      "--" + boundary
    );

  const parts = [];

  let start = 0;

  while (true) {

    const index =
      buffer.indexOf(
        delimiter,
        start
      );

    if (index === -1) {
      break;
    }

    const nextStart =
      index +
      delimiter.length;

    if (
      buffer[nextStart] === 45 &&
      buffer[nextStart + 1] === 45
    ) {
      break;
    }

    let partStart =
      nextStart;

    if (
      buffer[partStart] === 13 &&
      buffer[partStart + 1] === 10
    ) {

      partStart += 2;
    }

    const nextBoundary =
      buffer.indexOf(
        delimiter,
        partStart
      );

    if (nextBoundary === -1) {
      break;
    }

    let part =
      buffer.slice(
        partStart,
        nextBoundary
      );

    if (
      part.length >= 2 &&
      part[part.length - 2] === 13 &&
      part[part.length - 1] === 10
    ) {

      part =
        part.slice(
          0,
          -2
        );
    }

    const headerEnd =
      part.indexOf(
        Buffer.from(
          "\r\n\r\n"
        )
      );

    if (headerEnd === -1) {

      start =
        nextBoundary;

      continue;
    }

    const headerText =
      part
        .slice(
          0,
          headerEnd
        )
        .toString("utf8");

    const body =
      part.slice(
        headerEnd + 4
      );

    const nameMatch =
      headerText.match(
        /name="([^"]+)"/i
      );

    const filenameMatch =
      headerText.match(
        /filename="([^"]*)"/i
      );

    if (nameMatch) {

      parts.push({

        name:
          nameMatch[1],

        filename:
          filenameMatch
            ? filenameMatch[1]
            : null,

        data:
          body
      });
    }

    start =
      nextBoundary;
  }

  return parts;
}

/* -------------------------------------------------------
   GitHub API
------------------------------------------------------- */

async function githubRequest(
  path,
  options = {}
) {

  const token =
    process.env.GITHUB_TOKEN;

  if (!token) {

    throw new Error(
      "GITHUB_TOKEN is not configured in Netlify."
    );
  }

  const response =
    await fetch(
      GITHUB_API + path,
      {

        ...options,

        headers: {

          "Accept":
            "application/vnd.github+json",

          "Authorization":
            "Bearer " + token,

          "X-GitHub-Api-Version":
            "2022-11-28",

          ...(options.headers || {})
        }
      }
    );

  const text =
    await response.text();

  let data;

  try {

    data =
      text
        ? JSON.parse(text)
        : {};

  } catch {

    data = {
      raw: text
    };
  }

  if (!response.ok) {

    throw new Error(
      data.message ||
      `GitHub API error ${response.status}`
    );
  }

  return data;
}

/* -------------------------------------------------------
   Main handler
------------------------------------------------------- */

exports.handler =
  async function(event) {

  /* -----------------------------------------------------
     OPTIONS
  ----------------------------------------------------- */

  if (
    event.httpMethod ===
    "OPTIONS"
  ) {

    return {

      statusCode:
        204,

      headers: {

        "Access-Control-Allow-Origin":
          "*",

        "Access-Control-Allow-Headers":
          "Content-Type, Authorization",

        "Access-Control-Allow-Methods":
          "POST, OPTIONS"
      },

      body:
        ""
    };
  }

  /* -----------------------------------------------------
     Only POST
  ----------------------------------------------------- */

  if (
    event.httpMethod !==
    "POST"
  ) {

    return json(
      405,
      {
        success:
          false,

        error:
          "Only POST is allowed."
      }
    );
  }

  try {

    /* ---------------------------------------------------
       1. Authenticate customer
    --------------------------------------------------- */

    const decodedUser =
      await authenticateUser(
        event
      );

    const uid =
      decodedUser.uid;

    /* ---------------------------------------------------
       2. Get user profile
    --------------------------------------------------- */

    const user =
      await getUserProfile(
        uid,
        decodedUser
      );

    /* ---------------------------------------------------
       3. Check blocked account
    --------------------------------------------------- */

    if (
      user.blocked === true
    ) {

      return json(
        403,
        {

          success:
            false,

          error:
            "Your account has been blocked. Please contact the administrator."
        }
      );
    }

    /* ---------------------------------------------------
       4. Check plan
    --------------------------------------------------- */

    const plan =
      String(
        user.plan ||
        "free"
      ).toLowerCase();

    let buildLimit =
      Number(
        user.buildLimit
      );

    let buildsUsed =
      Number(
        user.buildsUsed ||
        0
      );

    if (
      !Number.isFinite(
        buildLimit
      ) ||
      buildLimit < 0
    ) {

      buildLimit =
        3;
    }

    if (
      !Number.isFinite(
        buildsUsed
      ) ||
      buildsUsed < 0
    ) {

      buildsUsed =
        0;
    }

    /* ---------------------------------------------------
       5. Check build limit
    --------------------------------------------------- */

    if (
      buildsUsed >=
      buildLimit
    ) {

      return json(
        403,
        {

          success:
            false,

          code:
            "BUILD_LIMIT_REACHED",

          error:
            `Your ${plan} plan build limit has been reached.`,

          plan,

          buildLimit,

          buildsUsed
        }
      );
    }

    /* ---------------------------------------------------
       6. GitHub settings
    --------------------------------------------------- */

    const owner =
      process.env.GITHUB_OWNER;

    const repo =
      process.env.GITHUB_REPO;

    const workflow =
      process.env.GITHUB_WORKFLOW ||
      "build-apk.yml";

    if (
      !owner ||
      !repo
    ) {

      return json(
        500,
        {

          success:
            false,

          error:
            "GITHUB_OWNER or GITHUB_REPO is not configured."
        }
      );
    }

    /* ---------------------------------------------------
       7. Check upload
    --------------------------------------------------- */

    if (!event.body) {

      return json(
        400,
        {

          success:
            false,

          error:
            "No upload data received."
        }
      );
    }

    let bodyBuffer;

    if (
      event.isBase64Encoded
    ) {

      bodyBuffer =
        Buffer.from(
          event.body,
          "base64"
        );

    } else {

      bodyBuffer =
        Buffer.from(
          event.body,
          "utf8"
        );
    }

    const contentType =
      event.headers[
        "content-type"
      ] ||
      event.headers[
        "Content-Type"
      ] ||
      "";

    if (
      !contentType
        .toLowerCase()
        .includes(
          "multipart/form-data"
        )
    ) {

      return json(
        400,
        {

          success:
            false,

          error:
            "Please upload an HTML or ZIP file."
        }
      );
    }

    /* ---------------------------------------------------
       8. Parse multipart
    --------------------------------------------------- */

    const parts =
      parseMultipart(
        bodyBuffer,
        contentType
      );

    const filePart =
      parts.find(
        p =>
          p.name ===
          "file" &&
          p.filename
      );

    const appNamePart =
      parts.find(
        p =>
          p.name ===
          "appName"
      );

    const packageNamePart =
      parts.find(
        p =>
          p.name ===
          "packageName"
      );

    if (!filePart) {

      return json(
        400,
        {

          success:
            false,

          error:
            "No HTML or ZIP file was uploaded."
        }
      );
    }

    const appName =
      appNamePart
        ? appNamePart.data
            .toString("utf8")
            .trim()
        : "";

    const packageName =
      packageNamePart
        ? packageNamePart.data
            .toString("utf8")
            .trim()
        : "";

    /* ---------------------------------------------------
       9. Validate app name
    --------------------------------------------------- */

    if (!appName) {

      return json(
        400,
        {

          success:
            false,

          error:
            "App name is required."
        }
      );
    }

    if (
      appName.length >
      60
    ) {

      return json(
        400,
        {

          success:
            false,

          error:
            "App name must be 60 characters or less."
        }
      );
    }

    /* ---------------------------------------------------
       10. Validate package name
    --------------------------------------------------- */

    if (
      !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/
        .test(packageName)
    ) {

      return json(
        400,
        {

          success:
            false,

          error:
            "Invalid Android package name. Example: com.example.myapp"
        }
      );
    }

    /* ---------------------------------------------------
       11. File name + extension
    --------------------------------------------------- */

    const originalName =
      filePart.filename
        .replace(
          /[^a-zA-Z0-9._-]/g,
          "_"
        );

    const extension =
      originalName
        .split(".")
        .pop()
        .toLowerCase();

    if (
      ![
        "html",
        "htm",
        "zip"
      ].includes(extension)
    ) {

      return json(
        400,
        {

          success:
            false,

          error:
            "Only HTML, HTM and ZIP files are supported."
        }
      );
    }

    /* ---------------------------------------------------
       12. Build ID
    --------------------------------------------------- */

    const buildId =
      crypto.randomUUID();

    /* ---------------------------------------------------
       13. Temporary branch
       
       IMPORTANT:
       build-status.js searches for:
       build/{buildId}
    --------------------------------------------------- */

    const branchName =
      "build/" +
      buildId;

    /* ---------------------------------------------------
       14. Upload paths
    --------------------------------------------------- */

    const uploadPath =
      `uploads/${buildId}/${originalName}`;

    const metadataPath =
      `uploads/${buildId}/build.json`;

    /* ---------------------------------------------------
       15. Check repository
    --------------------------------------------------- */

    const repository =
      await githubRequest(
        `/repos/${owner}/${repo}`
      );

    const defaultBranch =
      repository.default_branch ||
      "main";

    /* ---------------------------------------------------
       16. Get default branch SHA
    --------------------------------------------------- */

    const ref =
      await githubRequest(
        `/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`
      );

    const baseSha =
      ref.object.sha;

    /* ---------------------------------------------------
       17. Create temporary branch
    --------------------------------------------------- */

    await githubRequest(
      `/repos/${owner}/${repo}/git/refs`,
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            ref:
              `refs/heads/${branchName}`,

            sha:
              baseSha
          })
      }
    );

    /* ---------------------------------------------------
       18. Upload HTML / ZIP
    --------------------------------------------------- */

    await githubRequest(
      `/repos/${owner}/${repo}/contents/${uploadPath}`,
      {

        method:
          "PUT",

        headers: {

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            message:
              `Upload project ${buildId}`,

            content:
              filePart.data
                .toString(
                  "base64"
                ),

            branch:
              branchName
          })
      }
    );

    /* ---------------------------------------------------
       19. Save build metadata
    --------------------------------------------------- */

    const metadata = {

      buildId,

      uid,

      email:
        decodedUser.email ||
        user.email ||
        "",

      appName,

      packageName,

      originalFileName:
        originalName,

      extension,

      plan,

      createdAt:
        new Date()
          .toISOString()
    };

    await githubRequest(
      `/repos/${owner}/${repo}/contents/${metadataPath}`,
      {

        method:
          "PUT",

        headers: {

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            message:
              `Save build metadata ${buildId}`,

            content:
              Buffer.from(
                JSON.stringify(
                  metadata,
                  null,
                  2
                )
              ).toString(
                "base64"
              ),

            branch:
              branchName
          })
      }
    );

    /* ---------------------------------------------------
       20. Start GitHub Actions
    --------------------------------------------------- */

    await githubRequest(
      `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            ref:
              branchName,

            inputs: {

              buildId:
                buildId
            }
          })
      }
    );

    /* ---------------------------------------------------
       21. Increase buildsUsed
       
       Realtime Database transaction
    --------------------------------------------------- */

    getFirebaseAdmin();

    const db =
      admin.database();

    const buildsUsedRef =
      db.ref(
        `users/${uid}/buildsUsed`
      );

    const transactionResult =
      await buildsUsedRef.transaction(
        currentValue => {

          const current =
            Number(
              currentValue || 0
            );

          return current + 1;
        }
      );

    await db
      .ref(
        `users/${uid}/updatedAt`
      )
      .set(
        Date.now()
      );

    let newBuildsUsed =
      buildsUsed + 1;

    if (
      transactionResult &&
      transactionResult.snapshot
    ) {

      newBuildsUsed =
        Number(
          transactionResult
            .snapshot
            .val()
        ) || newBuildsUsed;
    }

    /* ---------------------------------------------------
       22. Success
    --------------------------------------------------- */

    return json(
      200,
      {

        success:
          true,

        buildId,

        status:
          "queued",

        plan,

        buildLimit,

        buildsUsed:
          newBuildsUsed
      }
    );

  } catch (error) {

    console.error(
      "START BUILD ERROR:",
      error
    );

    return json(
      500,
      {

        success:
          false,

        error:
          error.message ||
          "Unable to start APK build."
      }
    );
  }
};
