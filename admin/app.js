import { authServer } from './config.js';
import { cdnBase, imagePath, imageExtension, maxImageBytes, validateAssets, managedImages, normalizeBusinessCategory } from '../shared/model.js';

const element = id => document.getElementById(id);
const state = { assets: null, head: '', files: [], uploads: new Map(), deletions: new Set(), dirty: false, busy: false, editing: null, preview: null };
const labels = { active: '노출 중', scheduled: '노출 예정', expired: '노출 종료' };
let session = sessionStorage.getItem('ads-session') || '';
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has('session')) {
  session = fragment.get('session');
  sessionStorage.setItem('ads-session', session);
  history.replaceState(null, '', location.pathname + location.search);
}

function notice(message, error = false) {
  element('notice').textContent = message;
  element('notice').classList.toggle('error', error);
  element('notice').hidden = false;
}

function dirty() {
  state.dirty = true;
  element('save').disabled = false;
  element('save').textContent = '변경 사항 저장 ·';
}

async function api(path, body) {
  const response = await fetch(`${authServer.replace(/\/$/, '')}${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'omit' });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) { sessionStorage.removeItem('ads-session'); session = ''; element('login').hidden = false; element('workspace').hidden = true; }
    throw new Error(result.error || '요청에 실패했습니다.');
  }
  return result;
}

function today() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()).replaceAll('-', ''); }
function status(banner) { const date = today(); return banner.startDate > date ? 'scheduled' : banner.endDate < date ? 'expired' : 'active'; }
function dateInput(value) { return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`; }
function node(tag, className, text) { const result = document.createElement(tag); if (className) result.className = className; if (text !== undefined) result.textContent = text; return result; }
function button(text, action, options = {}) { const result = node('button', options.className, text); result.type = 'button'; result.disabled = Boolean(options.disabled); if (options.label) result.setAttribute('aria-label', options.label); result.addEventListener('click', action); return result; }
function preview(url) { const path = imagePath(url); if (path && state.uploads.has(path)) return state.uploads.get(path).preview; if (path && state.head) return `https://raw.githubusercontent.com/ssmind96/isungsan-ads/${state.head}/${path}`; return url; }
function image(url, title) { const result = node('img', 'card-preview'); result.src = preview(url); result.alt = title; result.loading = 'lazy'; result.referrerPolicy = 'no-referrer'; return result; }

function render() {
  const banners = state.assets.banners;
  element('total').textContent = banners.length;
  for (const name of Object.keys(labels)) element(name).textContent = banners.filter(banner => status(banner) === name).length;
  element('banners').replaceChildren();
  banners.forEach((banner, index) => {
    const currentStatus = status(banner);
    if (!banner.title.toLowerCase().includes(element('search').value.toLowerCase()) || (element('filter').value !== 'all' && element('filter').value !== currentStatus)) return;
    const card = node('article', 'card');
    const thumbnail = image(banner.image, banner.title); thumbnail.style.backgroundColor = banner.bgColor; card.append(thumbnail);
    const content = node('div', 'card-content');
    content.append(node('span', 'order', `BANNER ${String(banner.order).padStart(2, '0')}`));
    const top = node('div', 'card-top'); top.append(node('h3', '', banner.title), node('span', `badge ${currentStatus}`, labels[currentStatus])); content.append(top);
    content.append(node('p', '', `${dateInput(banner.startDate)} — ${dateInput(banner.endDate)}`));
    const actions = node('div', 'card-actions');
    actions.append(button('↑', () => move(index, -1), { disabled: index === 0, label: `${banner.title} 순서 올리기` }), button('↓', () => move(index, 1), { disabled: index === banners.length - 1, label: `${banner.title} 순서 내리기` }), node('span', 'spacer'), button('수정', () => edit(index)), button('삭제', () => {
      if (!confirm(`‘${banner.title}’ 배너를 목록에서 삭제할까요? 이미지는 보관함에 남습니다.`)) return;
      banners.splice(index, 1); renumber(); dirty(); render();
    }, { className: 'danger' }));
    content.append(actions); card.append(content); element('banners').append(card);
  });
  if (!element('banners').childElementCount) element('banners').append(node('div', 'empty', '표시할 배너가 없습니다. 새 소식을 추가해 보세요.'));
  renderBusinesses();
  renderImages();
  const { businesses, ...bannerAssets } = state.assets;
  element('json').textContent = JSON.stringify({ 'assets.json': bannerAssets, 'businesses.json': { businesses } }, null, 2);
}

function renderImages() {
  element('images').replaceChildren();
  const files = [...state.files, ...Array.from(state.uploads, ([path]) => ({ path }))];
  const used = new Set(managedImages(state.assets).map(imagePath));
  for (const file of files) {
    if (!imagePath(cdnBase + file.path) || state.deletions.has(file.path)) continue;
    const card = node('article', 'card'); card.append(image(cdnBase + file.path, file.path));
    const content = node('div', 'card-content'); content.append(node('h3', '', file.path.split('/').pop()), node('p', '', used.has(file.path) ? '광고에서 사용 중' : '사용하지 않는 이미지'));
    content.append(button('이미지 삭제', () => {
      if (!confirm(`${file.path} 이미지를 삭제할까요? 저장 후에는 Git 이력에서 복구할 수 있습니다.`)) return;
      const upload = state.uploads.get(file.path);
      if (upload) { URL.revokeObjectURL(upload.preview); state.uploads.delete(file.path); } else state.deletions.add(file.path);
      dirty(); renderImages();
    }, { disabled: used.has(file.path), className: 'danger' }));
    card.append(content); element('images').append(card);
  }
  if (!element('images').childElementCount) element('images').append(node('div', 'empty', '보관 중인 이미지가 없습니다.'));
}

function renumber() { state.assets.banners.forEach((banner, index) => { banner.order = index + 1; }); }
function move(index, direction) { const banners = state.assets.banners; [banners[index], banners[index + direction]] = [banners[index + direction], banners[index]]; renumber(); dirty(); render(); }

function edit(index = null) {
  if (state.busy) return;
  state.editing = index;
  const form = element('banner-form'); form.reset();
  const banner = index === null ? { title: '', image: '', startDate: today(), endDate: today(), link: '', bgColor: '#eeeeee' } : state.assets.banners[index];
  for (const field of ['title', 'image', 'link', 'bgColor']) form.elements.namedItem(field).value = banner[field];
  for (const field of ['startDate', 'endDate']) form.elements.namedItem(field).value = dateInput(banner[field]);
  element('editor-title').textContent = index === null ? '배너 추가' : '배너 수정';
  updatePreview(); element('editor').showModal();
}

function updatePreview() {
  if (state.preview) URL.revokeObjectURL(state.preview);
  const form = element('banner-form');
  const file = form.elements.namedItem('file').files[0];
  state.preview = file ? URL.createObjectURL(file) : null;
  const url = state.preview || preview(form.elements.namedItem('image').value);
  element('editor-preview').hidden = !url;
  if (url) element('editor-preview').src = url;
}

element('banner-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
  try {
    const banner = state.editing === null ? {} : { ...state.assets.banners[state.editing] };
    for (const field of ['title', 'image', 'link', 'bgColor']) banner[field] = form.elements.namedItem(field).value.trim();
    for (const field of ['startDate', 'endDate']) banner[field] = form.elements.namedItem(field).value.replaceAll('-', '');
    banner.order = state.editing === null ? state.assets.banners.length + 1 : banner.order;
    const file = form.elements.namedItem('file').files[0];
    let upload;
    if (file) {
      if (file.size > maxImageBytes) throw new Error('이미지는 최대 5MB까지 올릴 수 있습니다.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extension = imageExtension(bytes);
      const path = `banners/${crypto.randomUUID()}.${extension}`;
      const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.')); reader.readAsDataURL(file); });
      upload = { path, content: encoded, preview: URL.createObjectURL(file), size: file.size };
      banner.image = cdnBase + path;
    }
    const next = structuredClone(state.assets);
    if (state.editing === null) next.banners.push(banner); else next.banners[state.editing] = banner;
    try { validateAssets(next); } catch (error) { if (upload) URL.revokeObjectURL(upload.preview); throw error; }
    if (upload) state.uploads.set(upload.path, upload);
    state.assets = next; dirty(); render(); element('editor').close();
  } catch (error) { notice(error.message, true); } finally { submit.disabled = false; }
});

async function load() {
  const result = await api('/api/assets');
  for (const upload of state.uploads.values()) URL.revokeObjectURL(upload.preview);
  state.assets = result.assets; state.assets.businesses ||= []; state.assets.businesses.forEach(row => { row.category = normalizeBusinessCategory(row.category, row.id); }); state.assets.businesses.sort((a, b) => a.order - b.order); state.assets.banners.sort((first, second) => first.order - second.order);
  state.head = result.head; state.files = result.files; state.uploads.clear(); state.deletions.clear(); state.dirty = false;
  element('save').disabled = true; element('save').textContent = '변경 사항 저장'; render();
}

async function start() {
  if (!authServer) { element('setup').hidden = false; element('login-button').disabled = true; return; }
  if (!session) return;
  try {
    const user = await api('/api/session');
    await load();
    const avatar = node('img'); avatar.src = user.avatar; avatar.alt = '';
    element('account').replaceChildren(avatar, node('span', '', user.login), button('로그아웃', () => {
      if (state.dirty && !confirm('저장하지 않은 변경 사항이 사라집니다. 로그아웃할까요?')) return;
      sessionStorage.removeItem('ads-session'); location.reload();
    }));
    element('login').hidden = true; element('workspace').hidden = false;
  } catch (error) { notice(error.message, true); }
}

element('save').addEventListener('click', async () => {
  if (!state.dirty || state.busy) return;
  try {
    validateAssets(state.assets);
    const used = new Set(managedImages(state.assets).map(imagePath));
    const uploads = Array.from(state.uploads.values()).filter(upload => used.has(upload.path));
    if (uploads.reduce((sum, upload) => sum + upload.size, 0) > 20 * 1024 * 1024) throw new Error('한 번에 저장할 이미지는 총 20MB 이하여야 합니다.');
    state.busy = true;
    element('workspace').inert = true;
    element('save').textContent = '저장 중…';
    const result = await api('/api/save', { head: state.head, assets: state.assets, uploads: uploads.map(({ path, content }) => ({ path, content })), deletions: [...state.deletions] });
    state.head = result.head; state.dirty = false;
    notice('저장했습니다. 앱 반영까지 CDN 갱신 시간이 걸릴 수 있습니다.');
    try { await load(); } catch { element('save').disabled = true; element('save').textContent = '저장 완료'; notice('저장은 완료되었습니다. 최신 목록을 가져오지 못했습니다. 새로고침해 주세요.', true); }
  } catch (error) { notice(error.message, true); element('save').textContent = '변경 사항 저장 ·'; }
  finally { state.busy = false; element('workspace').inert = false; }
});

element('login-button').addEventListener('click', () => { location.href = `${authServer.replace(/\/$/, '')}/auth/login`; });
element('reload').addEventListener('click', async () => { if (state.dirty && !confirm('저장하지 않은 변경 사항을 버리고 다시 불러올까요?')) return; try { await load(); notice('최신 목록을 불러왔습니다.'); } catch (error) { notice(error.message, true); } });
element('add').addEventListener('click', () => edit());
for (const id of ['close', 'cancel']) element(id).addEventListener('click', () => element('editor').close());
element('editor').addEventListener('close', () => { if (state.preview) { URL.revokeObjectURL(state.preview); state.preview = null; } });
for (const field of ['file', 'image']) element('banner-form').elements.namedItem(field).addEventListener('change', updatePreview);
for (const id of ['search', 'filter']) element(id).addEventListener('input', render);
for (const tab of ['banner', 'business', 'image']) element(`${tab}-tab`).addEventListener('click', () => {
  document.querySelector('.stats').hidden = tab !== 'banner';
  for (const name of ['banner', 'business', 'image']) { const active = name === tab; element(`${name}-panel`).hidden = !active; element(`${name}-tab`).classList.toggle('selected', active); element(`${name}-tab`).setAttribute('aria-pressed', String(active)); }
});
window.addEventListener('beforeunload', event => { if (state.dirty || state.busy) { event.preventDefault(); event.returnValue = ''; } });


let editingBusiness = null;
function lines(value) { return value.split('\n').map(line => line.trim()).filter(Boolean); }
function renderBusinesses() {
  const container = element('businesses'); container.replaceChildren();
  const query = element('business-search').value.toLowerCase();
  state.assets.businesses.forEach((row, index, rows) => {
    if (element('business-category-filter').value !== 'all' && row.category !== element('business-category-filter').value) return;
    if (![row.title, row.description, row.address].join(' ').toLowerCase().includes(query)) return;
    const card = node('article', 'card');
    if (row.images[0]) card.append(image(row.images[0], row.title));
    const content = node('div', 'card-content');
    content.append(node('span', 'order', `기업 ${row.order} · ${row.category} · 이미지 ${row.images.length}장`), node('h3', '', row.title), node('p', '', row.description), node('p', '', [...row.phones, row.address, ...row.websites].filter(Boolean).join(' · ')));
    const actions = node('div', 'card-actions');
    const reorder = direction => { [rows[index], rows[index + direction]] = [rows[index + direction], rows[index]]; rows.forEach((item, i) => item.order = i + 1); dirty(); render(); };
    actions.append(button('↑', () => reorder(-1), { disabled: index === 0, label: `${row.title} 순서 올리기` }), button('↓', () => reorder(1), { disabled: index === rows.length - 1, label: `${row.title} 순서 내리기` }), node('span', 'spacer'), button('수정', () => editBusiness(index)), button('삭제', () => {
      if (!confirm(`‘${row.title}’ 기업을 삭제할까요? 이미지는 보관함에 남습니다.`)) return;
      rows.splice(index, 1); rows.forEach((item, i) => item.order = i + 1); dirty(); render();
    }, { className: 'danger' }));
    content.append(actions); card.append(content); container.append(card);
  });
  if (!container.childElementCount) container.append(node('div', 'empty', '표시할 기업이 없습니다.'));
}
function businessPreviews() {
  const form = element('business-form');
  element('business-previews').replaceChildren(...lines(form.elements.namedItem('images').value).map(url => image(url, '기업 이미지')));
}
function editBusiness(index = null) {
  if (state.busy) return;
  editingBusiness = index;
  const form = element('business-form'); form.reset();
  const row = index === null ? { title: '', category: '쇼핑', description: '', images: [], phones: [], websites: [], address: '', sourceUrl: '' } : state.assets.businesses[index];
  for (const field of ['title', 'category', 'description', 'address', 'sourceUrl']) form.elements.namedItem(field).value = row[field] || '';
  for (const field of ['images', 'phones', 'websites']) form.elements.namedItem(field).value = row[field].join('\n');
  element('business-editor-title').textContent = index === null ? '기업 추가' : '기업 수정';
  businessPreviews(); element('business-editor').showModal();
}
element('business-add').addEventListener('click', () => editBusiness());
element('business-search').addEventListener('input', renderBusinesses);
element('business-category-filter').addEventListener('change', renderBusinesses);
for (const id of ['business-close', 'business-cancel']) element(id).addEventListener('click', () => element('business-editor').close());
element('business-form').elements.namedItem('images').addEventListener('input', businessPreviews);
element('business-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, submit = form.querySelector('[type="submit"]'); submit.disabled = true;
  const uploads = [];
  try {
    const rows = state.assets.businesses;
    const row = editingBusiness === null ? { id: crypto.randomUUID(), order: rows.length + 1 } : { ...rows[editingBusiness] };
    for (const field of ['title', 'category', 'description', 'address', 'sourceUrl']) row[field] = form.elements.namedItem(field).value.trim();
    for (const field of ['images', 'phones', 'websites']) row[field] = lines(form.elements.namedItem(field).value);
    const files = [...form.elements.namedItem('files').files];
    if (files.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) throw new Error('한 번에 추가할 이미지는 총 20MB 이하여야 합니다.');
    for (const file of files) {
      if (file.size > maxImageBytes) throw new Error('이미지는 최대 5MB까지 올릴 수 있습니다.');
      const extension = imageExtension(new Uint8Array(await file.arrayBuffer()));
      const path = `businesses/${crypto.randomUUID()}.${extension}`;
      const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.')); reader.readAsDataURL(file); });
      uploads.push({ path, content, preview: URL.createObjectURL(file), size: file.size }); row.images.push(cdnBase + path);
    }
    const next = structuredClone(state.assets);
    if (editingBusiness === null) next.businesses.push(row); else next.businesses[editingBusiness] = row;
    validateAssets(next);
    uploads.forEach(upload => state.uploads.set(upload.path, upload));
    state.assets = next; dirty(); render(); element('business-editor').close();
  } catch (error) { uploads.forEach(upload => URL.revokeObjectURL(upload.preview)); alert(error.message); }
  finally { submit.disabled = false; }
});
start();
