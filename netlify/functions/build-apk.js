const crypto = require("crypto");

const GITHUB_API = "https://api.github.com";

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(data)
  };
}

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN is not configured in Netlify.");
  }

  const response = await fetch(GITHUB_API + path, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      data.message || `GitHub API error ${response.status}`
    );
  }

  return data;
}

function decodeBase64(base64) {
  if (!base64 || typeof base64 !== "string") {
    throw new Error("sourceBase64 is required.");
  }

  try {
    return Buffer.from(base64, "base64");
  } catch {
    throw new Error("Invalid sourceBase64 data.");
  }
}

function safeFileName(name) {
  return String(name || "index.html")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 150);
}

function validPackageName(packageName) {
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(
    packageName
  );
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, {
      success: false,
      error: "Only POST is allowed."
    });
  }

  try {
    if (!event.body) {
      return json(400, {
        success: false,
        error: "No build data received."
      });
    }

    let body;

    try {
      body = JSON.parse(event.body);
    } catch {
      return json(400, {
        success: false,
        error: "Invalid JSON request."
      });
    }

    const sourceName = safeFileName(body.sourceName);
    const sourceBase64 = body.sourceBase64;
    const settings = body.settings || {};

    if (!sourceBase64) {
      return json(400, {
        success: false,
        error: "sourceBase64 is required."
      });
    }

    const appName = String(
      settings.appName || "Cricket App"
    ).trim();

    const packageName = String(
      settings.packageName || "com.cricketlovers.app"
    ).trim();

    const versionName = String(
      settings.versionName || "1.0"
    ).trim();

    const versionCode = Number(
      settings.versionCode || 1
    );

    const minSdk = Number(
      settings.minSdk || 23
    );

    if (!appName) {
      return json(400, {
        success: false,
        error: "App name is required."
      });
    }

    if (appName.length > 60) {
      return json(400, {
        success: false,
        error: "App name must be 60 characters or less."
      });
    }

    if (!validPackageName(packageName)) {
      return json(400, {
        success: false,
        error:
          "Invalid Android package name. Example: com.example.myapp"
      });
    }

    if (
      !Number.isFinite(versionCode) ||
      versionCode < 1
    ) {
      return json(400, {
        success: false,
        error: "Invalid versionCode."
      });
    }

    if (
      !Number.isFinite(minSdk) ||
      minSdk < 21 ||
      minSdk > 35
    ) {
      return json(400, {
        success: false,
        error: "Invalid minSdk."
      });
    }

    const sourceBuffer = decodeBase64(sourceBase64);

    if (sourceBuffer.length === 0) {
      return json(400, {
        success: false,
        error: "Uploaded file is empty."
      });
    }

    const maxBytes = 25 * 1024 * 1024;

    if (sourceBuffer.length > maxBytes) {
      return json(413, {
        success: false,
        error: "File is too large. Maximum size is 25 MB."
      });
    }

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    const workflow =
      process.env.GITHUB_WORKFLOW || "build-apk.yml";

    if (!owner || !repo) {
      return json(500, {
        success: false,
        error:
          "GITHUB_OWNER or GITHUB_REPO is not configured in Netlify."
      });
    }

    const buildId = crypto.randomUUID();

    const branchName = `build/${buildId}`;

    const uploadPath =
      `uploads/${buildId}/${sourceName}`;

    /*
     * IMPORTANT:
     * The workflow currently searches for:
     *
     * build-meta.json
     *
     * and then uses appName/packageName from it.
     */

    const metadata = {
      buildId,
      appName,
      packageName,
      versionName,
      versionCode,
      minSdk,
      settings
    };

    const repository = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );

    const defaultBranch =
      repository.default_branch || "main";

    const ref = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(defaultBranch)}`
    );

    const baseSha = ref.object.sha;

    /*
     * Create temporary build branch
     */

    await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSha
        })
      }
    );

    /*
     * Upload the source file
     */

    await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${uploadPath}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Upload APK project ${buildId}`,
          content: sourceBuffer.toString("base64"),
          branch: branchName
        })
      }
    );

    /*
     * Upload build-meta.json
     */

    await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/build-meta.json`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Save APK build metadata ${buildId}`,
          content: Buffer.from(
            JSON.stringify(metadata, null, 2)
          ).toString("base64"),
          branch: branchName
        })
      }
    );

    /*
     * Start GitHub Actions workflow
     */

    await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ref: branchName,
          inputs: {
            buildId: buildId
          }
        })
      }
    );

    return json(200, {
      success: true,
      buildId,
      status: "queued",
      message:
        "Build request accepted. GitHub Actions is starting the APK build.",
      appName,
      packageName
    });

  } catch (error) {
    console.error(
      "BUILD APK ERROR:",
      error
    );

    return json(500, {
      success: false,
      error:
        error.message ||
        "Unable to start APK build."
    });
  }
};
