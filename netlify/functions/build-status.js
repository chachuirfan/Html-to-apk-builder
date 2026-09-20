const GITHUB_API =
  "https://api.github.com";

function json(statusCode, data) {
  return {
    statusCode,

    headers: {
      "Content-Type":
        "application/json",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Headers":
        "Content-Type",

      "Access-Control-Allow-Methods":
        "GET, OPTIONS"
    },

    body:
      JSON.stringify(data)
  };
}

async function githubRequest(path) {

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
        method: "GET",

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

  const text =
    await response.text();

  let data = {};

  try {
    data =
      text
        ? JSON.parse(text)
        : {};
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

exports.handler =
  async function(event) {

  if (
    event.httpMethod ===
    "OPTIONS"
  ) {
    return {
      statusCode: 204,

      headers: {
        "Access-Control-Allow-Origin":
          "*",

        "Access-Control-Allow-Headers":
          "Content-Type",

        "Access-Control-Allow-Methods":
          "GET, OPTIONS"
      },

      body: ""
    };
  }

  if (
    event.httpMethod !==
    "GET"
  ) {
    return json(405, {
      success: false,
      error:
        "Only GET is allowed."
    });
  }

  try {

    const owner =
      process.env.GITHUB_OWNER;

    const repo =
      process.env.GITHUB_REPO;

    if (!owner || !repo) {
      return json(500, {
        success: false,
        error:
          "GITHUB_OWNER or GITHUB_REPO is not configured."
      });
    }

    const params =
      event.queryStringParameters ||
      {};

    const buildId =
      params.buildId;

    if (!buildId) {
      return json(400, {
        success: false,
        error:
          "buildId is required."
      });
    }

    if (
      !/^[a-zA-Z0-9_-]{3,100}$/
        .test(buildId)
    ) {
      return json(400, {
        success: false,
        error:
          "Invalid buildId."
      });
    }

    const workflow =
      process.env.GITHUB_WORKFLOW ||
      "build-apk.yml";

    const runs =
      await githubRequest(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=50`
      );

    const workflowRuns =
      runs.workflow_runs || [];

    const expectedBranch =
      `build/${buildId}`;

    let matchingRun =
      workflowRuns.find(
        run =>
          run.head_branch ===
          expectedBranch
      );

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

    if (!matchingRun) {

      return json(200, {
        success: true,

        buildId,

        status:
          "queued",

        message:
          "Build request received. Waiting for GitHub Actions."
      });
    }

    const runStatus =
      matchingRun.status;

    const conclusion =
      matchingRun.conclusion;

    if (
      runStatus !==
      "completed"
    ) {

      return json(200, {

        success: true,

        buildId,

        status:
          "building",

        githubStatus:
          runStatus,

        runId:
          matchingRun.id,

        runUrl:
          matchingRun.html_url,

        message:
          "APK is currently being built."
      });
    }

    if (
      conclusion ===
      "success"
    ) {

      /*
       * Get artifacts belonging
       * specifically to this run.
       */

      const artifacts =
        await githubRequest(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${matchingRun.id}/artifacts?per_page=100`
        );

      const artifactList =
        artifacts.artifacts || [];

      const expectedArtifact =
        `APK-${buildId}`;

      const artifact =
        artifactList.find(
          item =>
            item.name ===
            expectedArtifact
        ) ||
        artifactList.find(
          item =>
            !item.expired &&
            item.name &&
            item.name.startsWith("APK-")
        );

      if (!artifact) {

        return json(200, {

          success: true,

          buildId,

          status:
            "success",

          runId:
            matchingRun.id,

          runUrl:
            matchingRun.html_url,

          message:
            "APK build completed, but the artifact is still being prepared."
        });
      }

      if (artifact.expired) {

        return json(200, {

          success: false,

          buildId,

          status:
            "failed",

          runId:
            matchingRun.id,

          runUrl:
            matchingRun.html_url,

          message:
            "The APK artifact has expired."
        });
      }

      /*
       * GitHub provides the artifact
       * archive download endpoint.
       *
       * This downloads the artifact ZIP,
       * which contains the APK.
       */

      const downloadUrl =
        artifact.archive_download_url;

      return json(200, {

        success: true,

        buildId,

        status:
          "success",

        runId:
          matchingRun.id,

        runUrl:
          matchingRun.html_url,

        artifactId:
          artifact.id,

        artifactName:
          artifact.name,

        downloadUrl:
          downloadUrl,

        downloadType:
          "artifact-zip",

        message:
          "APK build completed successfully."
      });
    }

    return json(200, {

      success: false,

      buildId,

      status:
        "failed",

      runId:
        matchingRun.id,

      runUrl:
        matchingRun.html_url,

      conclusion:
        conclusion ||
        "unknown",

      message:
        conclusion ===
        "cancelled"

          ? "APK build was cancelled."

          : conclusion ===
            "timed_out"

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
