// netlify/functions/start-build.js

const crypto = require("crypto");

const GITHUB_API = "https://api.github.com";

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(data)
  };
}

function getBoundary(contentType) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match ? (match[1] || match[2]) : null;
}

function parseMultipart(buffer, contentType) {
  const boundary = getBoundary(contentType);

  if (!boundary) {
    throw new Error("Multipart boundary not found.");
  }

  const delimiter = Buffer.from("--" + boundary);
  const parts = [];

  let start = 0;

  while (true) {
    const index = buffer.indexOf(delimiter, start);

    if (index === -1) break;

    const nextStart = index + delimiter.length;

    if (buffer[nextStart] === 45 && buffer[nextStart + 1] === 45) {
      break;
    }

    let partStart = nextStart;

    if (
      buffer[partStart] === 13 &&
      buffer[partStart + 1] === 10
    ) {
      partStart += 2;
    }

    const nextBoundary = buffer.indexOf(delimiter, partStart);

    if (nextBoundary === -1) break;

    let part = buffer.slice(partStart, nextBoundary);

    if (
      part.length >= 2 &&
      part[part.length - 2] === 13 &&
      part[part.length - 1] === 10
    ) {
      part = part.slice(0, -2);
    }

    const headerEnd = part.indexOf(
      Buffer.from("\r\n\r\n")
    );

    if (headerEnd === -1) {
      start = nextBoundary;
      continue;
    }

    const headerText = part
      .slice(0, headerEnd)
      .toString("utf8");

    const body = part.slice(headerEnd + 4);

    const nameMatch = headerText.match(
      /name="([^"]+)"/i
    );

    const filenameMatch = headerText.match(
      /filename="([^"]*)"/i
    );

    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch
          ? filenameMatch[1]
          : null,
        data: body
      });
    }

    start = nextBoundary;
  }

  return parts;
}

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is not configured in Netlify."
    );
  }

  const response = await fetch(
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

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      `GitHub API error ${response.status}`
    );
  }

  return data;
}

exports.handler = async function (event) {

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type",
        "Access-Control-Allow-Methods":
          "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, {
      error: "Only POST is allowed."
    });
  }

  try {

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const workflow =
      process.env.GITHUB_WORKFLOW ||
      "build-apk.yml";

    if (!owner || !repo) {
      return json(500, {
        error:
          "GITHUB_OWNER or GITHUB_REPO is not configured."
      });
    }

    if (!event.body) {
      return json(400, {
        error: "No upload data received."
      });
    }

    let bodyBuffer;

    if (event.isBase64Encoded) {
      bodyBuffer = Buffer.from(
        event.body,
        "base64"
      );
    } else {
      bodyBuffer = Buffer.from(
        event.body,
        "utf8"
      );
    }

    const contentType =
      event.headers["content-type"] ||
      event.headers["Content-Type"] ||
      "";

    if (
      !contentType.toLowerCase().includes(
        "multipart/form-data"
      )
    ) {
      return json(400, {
        error:
          "Please upload an HTML or ZIP file."
      });
    }

    const parts = parseMultipart(
      bodyBuffer,
      contentType
    );

    const filePart = parts.find(
      p => p.name === "file" && p.filename
    );

    const appNamePart = parts.find(
      p => p.name === "appName"
    );

    const packageNamePart = parts.find(
      p => p.name === "packageName"
    );

    if (!filePart) {
      return json(400, {
        error: "No HTML or ZIP file was uploaded."
      });
    }

    const appName =
      appNamePart
        ? appNamePart.data.toString("utf8").trim()
        : "";

    const packageName =
      packageNamePart
        ? packageNamePart.data
            .toString("utf8")
            .trim()
        : "";

    if (!appName) {
      return json(400, {
        error: "App name is required."
      });
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName)) {
      return json(400, {
        error: "Invalid Android package name."
      });
    }

    const originalName =
      filePart.filename
        .replace(/[^a-zA-Z0-9._-]/g, "_");

    const extension =
      originalName
        .split(".")
        .pop()
        .toLowerCase();

    if (
      !["html", "htm", "zip"].includes(extension)
    ) {
      return json(400, {
        error:
          "Only HTML, HTM and ZIP files are supported."
      });
    }

    // Unique ID for this APK build
    const buildId =
      crypto.randomUUID();

    // Temporary branch for this build
    const branchName =
      "apk-build-" + buildId;

    // Folder where the user's upload is stored
    const uploadPath =
      `uploads/${buildId}/${originalName}`;

    const metadataPath =
      `uploads/${buildId}/build.json`;

    // Check repository
    await githubRequest(
      `/repos/${owner}/${repo}`
    );

    // Get default branch
    const repository =
      await githubRequest(
        `/repos/${owner}/${repo}`
      );

    const defaultBranch =
      repository.default_branch || "main";

    // Get default branch SHA
    const ref =
      await githubRequest(
        `/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`
      );

    const baseSha =
      ref.object.sha;

    // Create temporary branch
    await githubRequest(
      `/repos/${owner}/${repo}/git/refs`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSha
        })
      }
    );

    // Upload user's HTML/ZIP
    await githubRequest(
      `/repos/${owner}/${repo}/contents/${uploadPath}`,
      {
        method: "PUT",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          message:
            `Upload project ${buildId}`,
          content:
            filePart.data.toString("base64"),
          branch: branchName
        })
      }
    );

    // Save build information
    const metadata = {
      buildId,
      appName,
      packageName,
      originalFileName: originalName,
      extension,
      createdAt:
        new Date().toISOString()
    };

    await githubRequest(
      `/repos/${owner}/${repo}/contents/${metadataPath}`,
      {
        method: "PUT",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          message:
            `Save build metadata ${buildId}`,
          content:
            Buffer.from(
              JSON.stringify(
                metadata,
                null,
                2
              )
            ).toString("base64"),
          branch: branchName
        })
      }
    );

    // Start GitHub Actions workflow
    await githubRequest(
      `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
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
      status: "queued"
    });

  } catch (error) {

    console.error(
      "START BUILD ERROR:",
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
