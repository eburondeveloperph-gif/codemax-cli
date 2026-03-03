/**
 * GitHub Deploy Helper — Push files to a GitHub repo via REST API
 * Uses the Git Data API: create blobs → create tree → create commit → update ref
 */

const GITHUB_API = "https://api.github.com";

interface DeployFile {
  path: string;
  content: string;
}

interface GitHubPushResult {
  commitSha: string;
  commitUrl: string;
  treeUrl: string;
}

function getConfig() {
  const token = process.env.GITHUB_PAT;
  const repo = process.env.DEPLOY_REPO || "eburondeveloperph-gif/studious-potato";
  if (!token) throw new Error("GITHUB_PAT environment variable not set");
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error(`Invalid DEPLOY_REPO: ${repo}`);
  return { token, owner, name };
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: { ...headers(token), ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Push files to a GitHub repo at a given directory path.
 * Creates blobs for each file, builds a tree, creates a commit, and updates the branch ref.
 */
export async function pushFilesToRepo(
  files: DeployFile[],
  dirPath: string,
  commitMessage: string,
  branch = "main"
): Promise<GitHubPushResult> {
  const { token, owner, name } = getConfig();
  const repoPath = `${owner}/${name}`;

  // 1. Get the latest commit SHA on the branch
  const refData = await ghFetch(`/repos/${repoPath}/git/ref/heads/${branch}`, token);
  const latestCommitSha: string = refData.object.sha;

  // 2. Get the tree SHA of the latest commit
  const commitData = await ghFetch(`/repos/${repoPath}/git/commits/${latestCommitSha}`, token);
  const baseTreeSha: string = commitData.tree.sha;

  // 3. Create blobs for each file and build tree entries
  const treeEntries = await Promise.all(
    files.map(async (file) => {
      const blob = await ghFetch(`/repos/${repoPath}/git/blobs`, token, {
        method: "POST",
        body: JSON.stringify({
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        }),
      });
      // Prefix file path with directory
      const fullPath = dirPath.replace(/^\/+|\/+$/g, "") + "/" + file.path.replace(/^\/+/, "");
      return {
        path: fullPath,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha as string,
      };
    })
  );

  // 4. Create a new tree (with base_tree to preserve existing files)
  const newTree = await ghFetch(`/repos/${repoPath}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });

  // 5. Create a new commit
  const newCommit = await ghFetch(`/repos/${repoPath}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({
      message: commitMessage,
      tree: newTree.sha,
      parents: [latestCommitSha],
    }),
  });

  // 6. Update the branch ref to point to the new commit
  await ghFetch(`/repos/${repoPath}/git/refs/heads/${branch}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return {
    commitSha: newCommit.sha,
    commitUrl: `https://github.com/${repoPath}/commit/${newCommit.sha}`,
    treeUrl: `https://github.com/${repoPath}/tree/${branch}/${dirPath.replace(/^\/+|\/+$/g, "")}`,
  };
}
