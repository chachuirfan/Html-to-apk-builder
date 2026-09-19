// netlify/functions/build-status.js

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

async function githubRequest(path) {

  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is not configured in Netlify."
    );
  }

  const response = await fetch(
    GITHUB_API + path,
    {
      headers: {
        "Accept":
          "application/vnd.github+json",
        "Authorization":
          "Bearer " + token,
        "X-GitHub-Api-Version":
          "2022-11-28"
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
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
          "GET, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "GET") {
    return json(405, {
      error: "Only GET is allowed."
    });
  }

  try {

    const owner =
      process.env.GITHUB_OWNER;

    const repo =
      process.env.GITHUB_REPO;

    if (!owner || !repo) {
      return json(500, {
        error:
          "GITHUB_OWNER or GITHUB_REPO is not configured."
      });
    }

    const buildId =
      event.queryStringParameters &&
      event.queryStringParameters.buildId;

    if (!buildId) {
      return json(400, {
        error: "buildId is required."
      });
    }

    const workflow =
      process.env.GITHUB_WORKFLOW ||
      "build-apk.yml";

    /*
      Look for recent GitHub Actions runs.
    */

    const runs =
      await githubRequest(
        `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=20`
      );

    const matchingRun =
      (runs.workflow_runs || []).find(run => {

        const text =
          JSON.stringify(run);

        return text.includes(buildId);

      });

    if (!matchingRun) {

      return json(200, {
        buildId,
        status: "queued"
      });

    }

    const runStatus =
      matchingRun.status;

    const conclusion =
      matchingRun.conclusion;

    if (
      runStatus !== "completed"
    ) {

      return json(200, {
        buildId,
        status: "building",
        githubStatus: runStatus,
        runId: matchingRun.id
      });

    }

    if (
      conclusion === "success"
    ) {

      /*
        The workflow will save the final APK URL
        as an artifact.

        We return the GitHub Actions run URL here
        until the final artifact download system
        is connected.
      */

      return json(200, {
        buildId,
        status: "success",
        runId: matchingRun.id,
        downloadUrl:
          matchingRun.html_url,
        message:
          "APK build completed. Open the build to download the APK."
      });

    }

    return json(200, {
      buildId,
      status: "failed",
      runId: matchingRun.id,
      message:
        conclusion ||
        "APK build failed."
    });

  } catch (error) {

    console.error(
      "BUILD STATUS ERROR:",
      error
    );

    return json(500, {
      success: false,
      error:
        error.message ||
        "Unable to check build status."
    });

  }

};
