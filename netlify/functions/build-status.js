// netlify/functions/build-status.js

const GITHUB_API = "https://api.github.com";

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
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
      method: "GET",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }
  );

  const text = await response.text();

  let data = {};

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

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
      },
      body: ""
    };
  }

  // Only GET
  if (event.httpMethod !== "GET") {
    return json(405, {
      success: false,
      error: "Only GET is allowed."
    });
  }

  try {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    if (!owner || !repo) {
      return json(500, {
        success: false,
        error:
          "GITHUB_OWNER or GITHUB_REPO is not configured."
      });
    }

    const params =
      event.queryStringParameters || {};

    const buildId = params.buildId;

    if (!buildId) {
      return json(400, {
        success: false,
        error: "buildId is required."
      });
    }

    /*
      Security / validation:
      build IDs created by our builder should only
      contain letters, numbers, hyphens and underscores.
    */

    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(buildId)) {
      return json(400, {
        success: false,
        error: "Invalid buildId."
      });
    }

    const workflow =
      process.env.GITHUB_WORKFLOW ||
      "build-apk.yml";

    /*
      Get recent workflow runs.
    */

    const runs = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=50`
    );

    const workflowRuns =
      runs.workflow_runs || [];

    /*
      start-build.js creates a branch using the buildId.

      Expected branch:
      build/<buildId>

      This is much more reliable than searching
      JSON.stringify(run) for the buildId.
    */

    const expectedBranch =
      `build/${buildId}`;

    let matchingRun =
      workflowRuns.find(run =>
        run.head_branch === expectedBranch
      );

    /*
      Also support a workflow run name containing
      the buildId. This gives us another reliable
      matching method after we update the workflow.
    */

    if (!matchingRun) {
      matchingRun =
        workflowRuns.find(run => {
          const name =
            run.name ||
            run.display_title ||
            "";

          return (
            name.includes(buildId) &&
            run.workflow_id
          );
        });
    }

    /*
      No workflow run yet.
    */

    if (!matchingRun) {
      return json(200, {
        success: true,
        buildId,
        status: "queued",
        message:
          "Build request received. Waiting for GitHub Actions."
      });
    }

    const runStatus =
      matchingRun.status;

    const conclusion =
      matchingRun.conclusion;

    /*
      GitHub Actions is still running.
    */

    if (runStatus !== "completed") {
      return json(200, {
        success: true,
        buildId,
        status: "building",
        githubStatus: runStatus,
        runId: matchingRun.id,
        runUrl: matchingRun.html_url,
        message:
          "APK is currently being built."
      });
    }

    /*
      Successful build.
    */

    if (conclusion === "success") {
      return json(200, {
        success: true,
        buildId,
        status: "success",
        runId: matchingRun.id,
        runUrl: matchingRun.html_url,
        downloadUrl: matchingRun.html_url,
        message:
          "APK build completed successfully."
      });
    }

    /*
      Failed / cancelled / timed out etc.
    */

    return json(200, {
      success: false,
      buildId,
      status: "failed",
      runId: matchingRun.id,
      runUrl: matchingRun.html_url,
      conclusion:
        conclusion || "unknown",
      message:
        conclusion === "cancelled"
          ? "APK build was cancelled."
          : conclusion === "timed_out"
          ? "APK build timed out."
          : "APK build failed."
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
