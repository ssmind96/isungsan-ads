import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import worker, { seal, unseal } from '../worker/index.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const env = { ADMIN_URL: 'https://ssmind96.github.io/isungsan-ads/admin/', SESSION_SECRET: 'a-long-random-secret-for-test-only-12345', GITHUB_CLIENT_ID: 'example', GITHUB_CLIENT_SECRET: 'example-secret' };
const origin = 'https://ssmind96.github.io';

test('encrypted sessions expire, reject tampering and reject OAuth state as a session', async () => {
  const value = { kind: 'session', token: 'private-token', exp: Date.now() + 60000 };
  const encrypted = await seal(value, env);
  assert.equal(encrypted.includes('private-token'), false);
  assert.deepEqual(await unseal(encrypted, env, 'session'), value);
  await assert.rejects(unseal(encrypted.slice(0, -5) + 'AAAAA', env, 'session'));
  await assert.rejects(unseal(await seal({ ...value, exp: 1 }, env), env, 'session'));
  await assert.rejects(unseal(await seal({ ...value, kind: 'oauth' }, env), env, 'session'));
});

test('CORS allows only the configured Pages origin', async () => {
  const allowed = await worker.fetch(new Request('https://auth.example/api/save', { method: 'OPTIONS', headers: { Origin: origin } }), env);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), origin);
  const denied = await worker.fetch(new Request('https://auth.example/api/save', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.has('Access-Control-Allow-Origin'), false);
});

test('API requires a valid session', async () => {
  const response = await worker.fetch(new Request('https://auth.example/api/assets', { headers: { Origin: origin } }), env);
  assert.equal(response.status, 401);
});

test('OAuth login uses state, PKCE, secure cookie and a fixed callback', async () => {
  const response = await worker.fetch(new Request('https://auth.example/auth/login'), env);
  assert.equal(response.status, 302);
  const destination = new URL(response.headers.get('Location'));
  assert.equal(destination.origin, 'https://github.com');
  assert.equal(destination.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(destination.searchParams.get('redirect_uri'), 'https://auth.example/auth/callback');
  assert.equal(destination.searchParams.get('state').length, 43);
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
});

test('callback rejects missing state before contacting GitHub', async () => {
  const response = await worker.fetch(new Request('https://auth.example/auth/callback?code=bad&state=bad'), env);
  assert.equal(response.status, 401);
});

test('read-only repository members cannot modify assets', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ permissions: { pull: true, push: false } });
  try {
    const session = await seal({ kind: 'session', token: 'test', exp: Date.now() + 60000 }, env);
    const response = await worker.fetch(new Request('https://auth.example/api/save', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: '{}' }), env);
    assert.equal(response.status, 403);
  } finally { globalThis.fetch = originalFetch; }
});

test('stale changes are rejected before creating any Git objects', async () => {
  const originalFetch = globalThis.fetch;
  const mutations = [];
  globalThis.fetch = async (url, options) => {
    if (options.method !== 'GET') mutations.push(url);
    if (url.includes('/git/ref/')) return Response.json({ object: { sha: 'new-head' } });
    if (url.includes('/git/commits/')) return Response.json({ tree: { sha: 'tree' } });
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    if (url.includes('/contents/')) return Response.json({ content: btoa('{"banners":[]}') });
    return Response.json({ permissions: { push: true } });
  };
  try {
    const session = await seal({ kind: 'session', token: 'test', exp: Date.now() + 60000 }, env);
    const response = await worker.fetch(new Request('https://auth.example/api/save', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ head: 'old-head', assets: { banners: [] }, uploads: [], deletions: [] }) }), env);
    assert.equal(response.status, 409);
    assert.deepEqual(mutations, []);
  } finally { globalThis.fetch = originalFetch; }
});

test('save creates one commit and updates the branch without forcing', async () => {
  const originalFetch = globalThis.fetch;
  const mutations = [];
  globalThis.fetch = async (url, options) => {
    if (options.method !== 'GET') {
      const body = JSON.parse(options.body);
      mutations.push({ url, method: options.method, body });
      if (url.endsWith('/git/trees')) return Response.json({ sha: 'updated-tree' });
      if (url.endsWith('/git/commits')) return Response.json({ sha: 'updated-commit' });
      return Response.json({});
    }
    if (url.includes('/git/ref/')) return Response.json({ object: { sha: 'head' } });
    if (url.includes('/git/commits/')) return Response.json({ tree: { sha: 'tree' } });
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    if (url.includes('/contents/')) return Response.json({ content: btoa('{"banners":[]}') });
    return Response.json({ permissions: { push: true } });
  };
  try {
    const session = await seal({ kind: 'session', token: 'test', exp: Date.now() + 60000 }, env);
    const response = await worker.fetch(new Request('https://auth.example/api/save', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ head: 'head', assets: { banners: [], retained: true }, uploads: [], deletions: [] }) }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { head: 'updated-commit' });
    assert.equal(mutations.length, 3);
    assert.equal(mutations[0].body.base_tree, 'tree');
    assert.equal(JSON.parse(mutations[0].body.tree[0].content).retained, true);
    assert.deepEqual(mutations[1].body.parents, ['head']);
    assert.equal(mutations[2].method, 'PATCH');
    assert.deepEqual(mutations[2].body, { sha: 'updated-commit', force: false });
  } finally { globalThis.fetch = originalFetch; }
});

test('banner-only clients preserve the separately stored businesses and both JSON documents commit atomically', async () => {
  const originalFetch = globalThis.fetch;
  const business = { id: 'sample', order: 1, category: '음식', reservationUrl: 'https://booking.example.com', memberName: '홍길동', memberRole: '집사', title: '기업', description: '', images: [], phones: ['010-1234-5678', '032-555-1234'], websites: [], address: '' };
  const mutations = [];
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
  globalThis.fetch = async (url, options) => {
    if (options.method !== 'GET') {
      const body = JSON.parse(options.body); mutations.push({ url, body });
      return Response.json({ sha: url.endsWith('/git/trees') ? 'new-tree' : 'new-commit' });
    }
    if (url.includes('/git/ref/')) return Response.json({ object: { sha: 'head' } });
    if (url.includes('/git/commits/')) return Response.json({ tree: { sha: 'tree' } });
    if (url.includes('/git/trees/')) return Response.json({ tree: [{ type: 'blob', path: 'businesses.json' }] });
    if (url.includes('/contents/businesses.json')) return Response.json({ content: encode({ businesses: [business] }) });
    if (url.includes('/contents/assets.json')) return Response.json({ content: encode({ banners: [], retained: true }) });
    return Response.json({ permissions: { push: true } });
  };
  try {
    const session = await seal({ kind: 'session', token: 'test', exp: Date.now() + 60000 }, env);
    const request = new Request('https://auth.example/api/save', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ head: 'head', assets: { banners: [], retained: true }, uploads: [], deletions: [] }) });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 200);
    const entries = mutations[0].body.tree;
    assert.deepEqual(JSON.parse(entries.find(entry => entry.path === 'assets.json').content), { banners: [], retained: true });
    assert.deepEqual(JSON.parse(entries.find(entry => entry.path === 'businesses.json').content), { businesses: [{ ...business, actionType: 'reservation', actionUrl: business.reservationUrl }] });
    assert.equal(mutations.length, 3);
    assert.equal(mutations[2].body.force, false);
    mutations.length = 0;
    const purchaseRequest = new Request('https://auth.example/api/save', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ head: 'head', assets: { banners: [], businesses: [{ ...business, actionType: 'purchase', actionUrl: 'https://shop.example.com' }] }, uploads: [], deletions: [] }) });
    const purchaseResponse = await worker.fetch(purchaseRequest, env);
    assert.equal(purchaseResponse.status, 200);
    const savedPurchase = JSON.parse(mutations[0].body.tree.find(entry => entry.path === 'businesses.json').content).businesses[0];
    assert.equal(savedPurchase.actionType, 'purchase');
    assert.equal(savedPurchase.actionUrl, 'https://shop.example.com');
    assert.equal(savedPurchase.reservationUrl, '', 'purchase links are not exposed as reservation links to older apps');

  } finally { globalThis.fetch = originalFetch; }
});
