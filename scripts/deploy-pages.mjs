import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { envPath, settings } from './env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = 'ssmind96/isungsan-ads';
const base = `https://api.github.com/repos/${repository}`;
const workflowPath = 'actions/workflows/pages.yml';

async function github(endpoint, { method = 'GET', body, allowMissing = false } = {}) {
  let response;
  try {
    response = await fetch(`${base}/${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${settings.GITHUB_PAT}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'isungsan-ads-deploy', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    throw new Error(`GitHub에 연결할 수 없습니다 (${error.cause?.code || error.name}).`);
  }
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) {
    const hint = endpoint === 'pages'
      ? 'GitHub PAT의 Pages 및 Administration 쓰기 권한을 확인하거나 Settings → Pages에서 Source를 GitHub Actions로 설정해 주세요.'
      : endpoint.includes('actions/')
        ? 'GitHub PAT의 Actions 쓰기 권한을 확인해 주세요.'
        : 'GitHub PAT의 Contents 및 Workflows 쓰기 권한을 확인해 주세요. classic 토큰은 repo와 workflow 권한이 필요합니다. 브랜치 보호 규칙도 확인해 주세요.';
    throw new Error(`GitHub 요청 실패: ${method} ${endpoint} (HTTP ${response.status}). ${hint}`);
  }
  return response.status === 204 ? null : response.json();
}

async function collect(directory) {
  const entries = await fs.readdir(path.join(root, directory), { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || ['node_modules'].includes(entry.name) || entry.isSymbolicLink()) continue;
    const filename = `${directory}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await collect(filename));
    else if (entry.isFile() && /\.(?:html|css|js|mjs|toml)$/.test(entry.name)) paths.push(filename);
  }
  return paths;
}

async function main() {
  if (!settings.GITHUB_PAT) throw new Error(`${envPath}에 GITHUB_PAT가 필요합니다.`);
  if (!settings.GITHUB_CLIENT_ID || !settings.GITHUB_CLIENT_SECRET) throw new Error(`${envPath}에 GITHUB_CLIENT_ID와 GITHUB_CLIENT_SECRET을 먼저 설정해 주세요.`);
  const ref = await github('git/ref/heads/main');
  const parent = await github(`git/commits/${ref.object.sha}`);
  const current = await github(`git/trees/${parent.tree.sha}?recursive=1`);
  if (current.truncated) throw new Error('저장소 파일 목록을 완전히 가져올 수 없습니다.');
  const existing = new Map(current.tree.map(entry => [entry.path, entry.sha]));
  const files = ['package.json', '.github/workflows/pages.yml'];
  for (const directory of ['admin', 'shared', 'worker', 'scripts', 'tests']) files.push(...await collect(directory));
  const changes = [];
  for (const filename of files) {
    const content = await fs.readFile(path.join(root, filename), 'utf8');
    const bytes = Buffer.from(content);
    const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (existing.get(filename) !== sha) changes.push({ path: filename, mode: '100644', type: 'blob', content });
  }
  const pages = await github('pages', { allowMissing: true });
  if (!pages) await github('pages', { method: 'POST', body: { build_type: 'workflow' } });
  else if (pages.build_type !== 'workflow') await github('pages', { method: 'PUT', body: { build_type: 'workflow' } });

  let head = ref.object.sha;
  if (changes.length) {
    const tree = await github('git/trees', { method: 'POST', body: { base_tree: parent.tree.sha, tree: changes } });
    const commit = await github('git/commits', { method: 'POST', body: { message: 'feat: GitHub 로그인 기반 배너 관리 및 Pages 배포', tree: tree.sha, parents: [head] } });
    await github('git/refs/heads/main', { method: 'PATCH', body: { sha: commit.sha, force: false } });
    head = commit.sha;
    console.log(`관리 도구 소스 ${changes.length}개 파일을 main에 반영했습니다. 기존 assets.json과 배너 이미지는 유지했습니다.`);
  } else console.log('관리 도구 소스가 이미 최신 상태입니다.');

  let workflow;
  for (let attempt = 0; attempt < 6; attempt++) {
    workflow = await github(workflowPath, { allowMissing: true });
    if (workflow) break;
    await delay(2000);
  }
  if (!workflow) throw new Error(`소스 반영은 완료됐습니다. https://github.com/${repository}/actions 에서 Deploy banner admin to Pages를 실행해 주세요.`);
  await github(`${workflowPath}/dispatches`, { method: 'POST', body: { ref: 'main' } });
  console.log(`Pages 배포를 요청했습니다: https://github.com/${repository}/actions/workflows/pages.yml`);
  for (let attempt = 0; attempt < 36; attempt++) {
    await delay(5000);
    const result = await github(`${workflowPath}/runs?head_sha=${head}&event=workflow_dispatch&per_page=5`);
    const run = result.workflow_runs?.[0];
    if (!run || run.status !== 'completed') continue;
    if (run.conclusion !== 'success') throw new Error(`Pages 배포 결과: ${run.conclusion}. 로그를 확인해 주세요: ${run.html_url}`);
    console.log('Pages 배포 완료: https://ssmind96.github.io/isungsan-ads/admin/');
    console.log('관리 화면에서 GitHub로 로그인해 배너 목록이 보이는지 확인해 주세요.');
    return;
  }
  console.log('Pages 배포가 아직 진행 중입니다. 위 Actions 주소에서 완료 여부를 확인해 주세요.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
