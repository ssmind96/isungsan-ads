import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { envPath, settings } from './env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (!settings[key]) throw new Error(`${envPath}에 ${key}를 설정해 주세요.`);
  }
  if (!/^[a-f0-9]{32}$/i.test(settings.CLOUDFLARE_ACCOUNT_ID)) {
    throw new Error(`CLOUDFLARE_ACCOUNT_ID는 이메일이나 계정 이름이 아닌 32자리 영문·숫자 ID입니다. Cloudflare 대시보드에서 Account ID를 복사해 ${envPath}의 값을 바꿔 주세요. 터미널에 같은 환경 변수가 설정되어 있으면 그 값이 우선 적용됩니다.`);
  }
  const name = 'isungsan-ads-auth';
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(settings.CLOUDFLARE_ACCOUNT_ID)}`;
  async function cloudflare(endpoint, options = {}) {
    let response;
    try {
      response = await fetch(base + endpoint, { ...options, headers: { Authorization: `Bearer ${settings.CLOUDFLARE_API_TOKEN}`, ...options.headers }, signal: AbortSignal.timeout(60000) });
    } catch (error) {
      throw new Error(`Cloudflare API에 연결할 수 없습니다 (${error.cause?.code || error.name}). 인터넷 연결과 터미널의 네트워크 접근을 확인해 주세요.`);
    }
    const result = await response.json();
    if (!response.ok || !result.success) {
      const codes = result.errors?.map(item => item.code) || [];
      const hint = codes.includes(7003)
        ? 'Account ID가 정확한지, API 토큰에 이 계정이 포함되어 있는지 확인해 주세요.'
        : endpoint === '/workers/subdomain' && response.status === 404
          ? '계정의 서브도메인을 API로 조회하지 못했습니다. 대시보드에 Subdomain이 표시되면 CLOUDFLARE_WORKERS_SUBDOMAIN에 .workers.dev를 제외한 값을 지정해 다시 실행해 주세요. 표시되지 않으면 Workers 초기 설정을 확인해 주세요.'
          : 'API 토큰의 Workers 편집 권한과 계정 범위를 확인해 주세요.';
      throw new Error(`Cloudflare 요청 실패: ${options.method || 'GET'} ${endpoint} (HTTP ${response.status}, 코드 ${codes.join(', ') || 'unknown'}). ${hint}`);
    }
    return result.result;
  }

  const configuredSubdomain = settings.CLOUDFLARE_WORKERS_SUBDOMAIN?.trim();
  if (configuredSubdomain && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(configuredSubdomain)) {
    throw new Error('CLOUDFLARE_WORKERS_SUBDOMAIN에는 .workers.dev를 제외한 서브도메인 이름만 입력해 주세요.');
  }
  const account = configuredSubdomain ? { subdomain: configuredSubdomain } : await cloudflare('/workers/subdomain');
  if (!account?.subdomain) throw new Error('Cloudflare 대시보드의 Workers & Pages에서 workers.dev 주소를 먼저 설정해 주세요.');
  const workerUrl = `https://${name}.${account.subdomain}.workers.dev`;
  let existingSecrets = [];
  const scripts = await cloudflare('/workers/scripts');
  const existing = scripts.some(script => script.id === name);
  if (existing) existingSecrets = await cloudflare(`/workers/scripts/${name}/secrets`);
  const bindings = [{ name: 'ADMIN_URL', type: 'plain_text', text: 'https://ssmind96.github.io/isungsan-ads/admin/' }];
  if (settings.GITHUB_CLIENT_ID) bindings.push({ name: 'GITHUB_CLIENT_ID', type: 'plain_text', text: settings.GITHUB_CLIENT_ID });
  if (settings.GITHUB_CLIENT_SECRET) bindings.push({ name: 'GITHUB_CLIENT_SECRET', type: 'secret_text', text: settings.GITHUB_CLIENT_SECRET });
  if (!existingSecrets.some(secret => secret.name === 'SESSION_SECRET')) bindings.push({ name: 'SESSION_SECRET', type: 'secret_text', text: randomBytes(32).toString('hex') });

  const form = new FormData();
  form.set('metadata', JSON.stringify({ main_module: 'worker/index.js', compatibility_date: '2026-01-01', bindings, keep_bindings: ['secret_text', 'plain_text'] }));
  for (const filename of ['worker/index.js', 'shared/model.js']) {
    form.set(filename, new Blob([await fs.readFile(path.join(root, filename))], { type: 'application/javascript+module' }), filename);
  }
  await cloudflare(`/workers/scripts/${name}`, { method: 'PUT', body: form });
  await cloudflare(`/workers/scripts/${name}/subdomain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
  console.log(`Worker 배포 완료: ${workerUrl}`);
  console.log(`GitHub OAuth callback URL: ${workerUrl}/auth/callback`);
  console.log(`GitHub Actions 변수 ADS_AUTH_SERVER: ${workerUrl}`);
  if (!settings.GITHUB_CLIENT_ID || !settings.GITHUB_CLIENT_SECRET) {
    const registration = new URL('https://github.com/settings/applications/new');
    registration.search = new URLSearchParams({ oauth_application: '', 'oauth_application[name]': '인천성산교회 배너 관리', 'oauth_application[url]': 'https://ssmind96.github.io/isungsan-ads/admin/', 'oauth_application[callback_url]': `${workerUrl}/auth/callback` }).toString();
    console.log(`다음 단계: GitHub OAuth App 등록\n${registration.href}`);
    console.log(`${envPath}에 GITHUB_CLIENT_ID와 GITHUB_CLIENT_SECRET을 추가한 뒤 이 명령을 다시 실행해 주세요.`);
  } else {
    console.log('GitHub OAuth 설정도 등록했습니다. Pages 배포 후 실제 로그인을 확인해 주세요.');
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
