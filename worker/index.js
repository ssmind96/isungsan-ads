import { repository, branch, validateChanges, normalizeBusinessCategory } from '../shared/model.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const repoPath = `/repos/${repository}`;
const sessionLifetime = 8 * 60 * 60;

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sessionKey(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('인증 서버의 SESSION_SECRET 설정이 필요합니다.');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(env.SESSION_SECRET));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sessionKey(env), encoder.encode(JSON.stringify(value)));
  return `${base64url(iv)}.${base64url(new Uint8Array(encrypted))}`;
}

export async function unseal(value, env, kind) {
  try {
    const parts = value.split('.').map(part => Uint8Array.from(atob(part.replaceAll('-', '+').replaceAll('_', '/')), character => character.charCodeAt(0)));
    if (parts.length !== 2) throw new Error();
    const data = JSON.parse(decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: parts[0] }, await sessionKey(env), parts[1])));
    if (data.kind !== kind || data.exp <= Date.now()) throw new Error();
    return data;
  } catch { throw Object.assign(new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.'), { status: 401 }); }
}

async function github(token, path, body, method) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'isungsan-ads-admin', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const status = [401, 403, 404, 409, 422].includes(response.status) ? response.status : 502;
    throw Object.assign(new Error(status === 401 ? 'GitHub 인증이 만료되었습니다.' : status === 403 ? 'GitHub 쓰기 권한 또는 API 사용 한도를 확인해 주세요.' : status === 409 || status === 422 ? '다른 변경 사항이 있습니다. 새로고침한 뒤 다시 저장해 주세요.' : 'GitHub 요청에 실패했습니다.'), { status });
  }
  return response.status === 204 ? null : response.json();
}

async function authorize(token) {
  const repo = await github(token, repoPath);
  if (!repo.permissions?.push) throw Object.assign(new Error('이 저장소의 쓰기 권한이 있는 GitHub 계정만 관리할 수 있습니다.'), { status: 403 });
}

async function snapshot(token) {
  const ref = await github(token, `${repoPath}/git/ref/heads/${branch}`);
  const commit = await github(token, `${repoPath}/git/commits/${ref.object.sha}`);
  const tree = await github(token, `${repoPath}/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw new Error('저장소 파일 목록이 너무 큽니다.');
  const file = await github(token, `${repoPath}/contents/assets.json?ref=${ref.object.sha}`);
  const assets = JSON.parse(decoder.decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), character => character.charCodeAt(0))));
  const businessFile = tree.tree.find(entry => entry.path === 'businesses.json');
  if (businessFile) {
    const file = await github(token, `${repoPath}/contents/businesses.json?ref=${ref.object.sha}`);
    assets.businesses = JSON.parse(decoder.decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), character => character.charCodeAt(0)))).businesses;
  } else assets.businesses = [];
  return { head: ref.object.sha, tree: commit.tree.sha, assets, files: tree.tree.filter(entry => entry.type === 'blob' && (entry.path.startsWith('banners/') || entry.path.startsWith('businesses/'))).map(entry => ({ path: entry.path, size: entry.size })) };
}

async function save(token, body) {
  const current = await snapshot(token);
  if (body.head !== current.head) throw Object.assign(new Error('다른 관리자가 수정했습니다. 변경 내용을 복사하고 새로고침해 주세요.'), { status: 409 });
  if (body.assets && body.assets.businesses === undefined) body.assets.businesses = current.assets.businesses;
  validateChanges(body.assets, body.uploads, body.deletions, current.assets, new Set(current.files.map(file => file.path)));
  const { businesses: businessRows, ...bannerAssets } = body.assets;
  const businesses = businessRows.map(row => ({ ...row, category: normalizeBusinessCategory(row.category ?? current.assets.businesses.find(previous => previous.id === row.id)?.category, row.id) }));
  const entries = [
    { path: 'assets.json', mode: '100644', type: 'blob', content: `${JSON.stringify(bannerAssets, null, 2)}\n` },
    { path: 'businesses.json', mode: '100644', type: 'blob', content: `${JSON.stringify({ businesses }, null, 2)}\n` },
  ];
  for (const upload of body.uploads) {
    const blob = await github(token, `${repoPath}/git/blobs`, { content: upload.content, encoding: 'base64' });
    entries.push({ path: upload.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  for (const path of body.deletions) entries.push({ path, mode: '100644', type: 'blob', sha: null });
  const tree = await github(token, `${repoPath}/git/trees`, { base_tree: current.tree, tree: entries });
  const commit = await github(token, `${repoPath}/git/commits`, { message: '광고 관리 화면에서 배너 및 성도의 기업 업데이트', tree: tree.sha, parents: [current.head] });
  await github(token, `${repoPath}/git/refs/heads/${branch}`, { sha: commit.sha, force: false }, 'PATCH');
  return { head: commit.sha };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const admin = new URL(env.ADMIN_URL);
    const origin = request.headers.get('Origin');
    const headers = new Headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
    if (origin === admin.origin) {
      headers.set('Access-Control-Allow-Origin', admin.origin);
      headers.set('Vary', 'Origin');
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    const json = (value, status = 200) => Response.json(value, { status, headers });
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: origin === admin.origin ? 204 : 403, headers });
      if (url.pathname === '/auth/login' && request.method === 'GET') {
        if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new Error('GitHub OAuth App 설정이 필요합니다.');
        const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
        const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
        const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
        const pending = await seal({ kind: 'oauth', state, verifier, exp: Date.now() + 600000 }, env);
        headers.set('Set-Cookie', `__Host-ads-oauth=${pending}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
        const destination = new URL('https://github.com/login/oauth/authorize');
        destination.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: `${url.origin}/auth/callback`, scope: 'public_repo', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
        headers.set('Location', destination.href);
        return new Response(null, { status: 302, headers });
      }
      if (url.pathname === '/auth/callback' && request.method === 'GET') {
        const cookie = request.headers.get('Cookie')?.split('; ').find(part => part.startsWith('__Host-ads-oauth='))?.slice('__Host-ads-oauth='.length);
        const pending = await unseal(cookie || '', env, 'oauth');
        if (!url.searchParams.get('code') || url.searchParams.get('state') !== pending.state) throw Object.assign(new Error('GitHub 로그인 요청을 확인할 수 없습니다. 다시 로그인해 주세요.'), { status: 400 });
        const response = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code'), redirect_uri: `${url.origin}/auth/callback`, code_verifier: pending.verifier }) });
        const result = await response.json();
        if (!response.ok || !result.access_token) throw Object.assign(new Error('GitHub 로그인을 완료하지 못했습니다. 다시 시도해 주세요.'), { status: 401 });
        await github(result.access_token, '/user');
        await authorize(result.access_token);
        const lifetime = Math.min(sessionLifetime, result.expires_in || sessionLifetime);
        const session = await seal({ kind: 'session', token: result.access_token, exp: Date.now() + lifetime * 1000 }, env);
        admin.hash = new URLSearchParams({ session }).toString();
        headers.set('Location', admin.href);
        headers.set('Set-Cookie', '__Host-ads-oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
        return new Response(null, { status: 302, headers });
      }
      if (origin !== admin.origin) return json({ error: '허용되지 않은 요청입니다.' }, 403);
      const bearer = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
      const session = await unseal(bearer || '', env, 'session');
      await authorize(session.token);
      if (url.pathname === '/api/session' && request.method === 'GET') {
        const user = await github(session.token, '/user');
        return json({ login: user.login, avatar: user.avatar_url });
      }
      if (url.pathname === '/api/assets' && request.method === 'GET') return json(await snapshot(session.token));
      if (url.pathname === '/api/save' && request.method === 'POST') {
        if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'JSON 요청이 필요합니다.' }, 415);
        if (Number(request.headers.get('Content-Length')) > 28 * 1024 * 1024) return json({ error: '한 번에 20MB 이하의 이미지를 저장해 주세요.' }, 413);
        const raw = await request.text();
        if (encoder.encode(raw).length > 28 * 1024 * 1024) return json({ error: '한 번에 20MB 이하의 이미지를 저장해 주세요.' }, 413);
        let body;
        try { body = JSON.parse(raw); } catch { return json({ error: '올바른 JSON 요청이 필요합니다.' }, 400); }
        try { return json(await save(session.token, body)); } catch (error) { if (!error.status) error.status = 400; throw error; }
      }
      return json({ error: '페이지를 찾을 수 없습니다.' }, 404);
    } catch (error) { return json({ error: error.message || '요청 처리 중 오류가 발생했습니다.' }, error.status || 500); }
  },
};
