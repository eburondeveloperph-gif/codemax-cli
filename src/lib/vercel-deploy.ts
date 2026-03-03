/**
 * Vercel Deploy Helper — Deploy files directly via Vercel Deployments API v13
 * Uploads files as base64, returns a live deployment URL instantly.
 */

const VERCEL_API = "https://api.vercel.com";

interface DeployFile {
  path: string;
  content: string;
}

interface VercelDeployResult {
  url: string;
  deploymentId: string;
  readyState: string;
}

function getConfig() {
  const token = process.env.VERCEL_DEPLOY_TOKEN;
  const project = process.env.VERCEL_DEPLOY_PROJECT;
  if (!token) throw new Error("VERCEL_DEPLOY_TOKEN environment variable not set");
  return { token, project };
}

/**
 * Deploy files to Vercel using the v13 Deployments API.
 * Files are uploaded as base64 with no build step (static deployment).
 */
export async function deployToVercel(
  files: DeployFile[],
  name: string
): Promise<VercelDeployResult> {
  const { token, project } = getConfig();

  const vercelFiles = files.map((f) => ({
    file: f.path.replace(/^\/+/, ""),
    data: Buffer.from(f.content).toString("base64"),
    encoding: "base64" as const,
  }));

  const body: Record<string, unknown> = {
    name: name.slice(0, 52).replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
    files: vercelFiles,
    projectSettings: {
      framework: null,
      buildCommand: "",
      outputDirectory: ".",
      installCommand: "",
    },
    target: "production",
  };

  if (project) body.project = project;

  const res = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vercel API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();

  return {
    url: `https://${data.url}`,
    deploymentId: data.id,
    readyState: data.readyState ?? "QUEUED",
  };
}
