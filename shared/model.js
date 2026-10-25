export const repository = 'ssmind96/isungsan-ads';
export const branch = 'main';
export const cdnBase = `https://cdn.jsdelivr.net/gh/${repository}@${branch}/`;
export const businessCategories = ['음식', '생활', '교육', '건강', '쇼핑'];
const legacyBusinessCategories = {
  "553": "쇼핑",
  "554": "음식",
  "555": "쇼핑",
  "556": "생활",
  "557": "쇼핑",
  "558": "음식",
  "559": "쇼핑",
  "560": "생활",
  "561": "음식",
  "562": "교육",
  "563": "쇼핑",
  "584": "건강",
  "585": "교육",
  "702": "생활",
  "711": "건강",
  "839": "생활",
  "892": "생활",
  "903": "쇼핑",
  "904": "음식",
  "929": "생활",
  "956": "쇼핑",
  "983": "음식"
};

export function normalizeBusinessCategory(category, id) {
  if (businessCategories.includes(category)) return category;
  if (category === undefined || ['식당', '카페', '수리', '기타'].includes(category)) {
    const knownCategory = legacyBusinessCategories[id];
    return (typeof knownCategory === 'string' ? knownCategory : undefined) || ({ 식당: '음식', 카페: '음식', 수리: '생활', 기타: '쇼핑' }[category]) || '쇼핑';
  }
  throw new Error('업종은 음식, 생활, 교육, 건강, 쇼핑 중에서 선택해 주세요.');
}
export const maxImageBytes = 5 * 1024 * 1024;

export function imagePath(url) {
  if (typeof url !== 'string' || !url.startsWith(cdnBase)) return null;
  const path = url.slice(cdnBase.length);
  return /^(?:banners|businesses)\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/i.test(path) ? path : null;
}

export function validDate(value) {
  if (!/^\d{8}$/.test(value)) return false;
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10).replaceAll('-', '') === value;
}

export function validateAssets(assets) {
  if (!assets || !Array.isArray(assets.banners) || assets.banners.length > 100) throw new Error('배너는 최대 100개까지 등록할 수 있습니다.');
  for (const banner of assets.banners) {
    if (!banner || typeof banner.title !== 'string' || !banner.title.trim() || banner.title.length > 200) throw new Error('배너 제목을 200자 이내로 입력해 주세요.');
    if (!Number.isInteger(banner.order) || banner.order < 1) throw new Error('표시 순서는 양의 정수여야 합니다.');
    if (!/^#[\da-f]{6}$/i.test(banner.bgColor)) throw new Error('배경색을 #RRGGBB 형식으로 입력해 주세요.');
    for (const field of ['image', 'link']) {
      if (field === 'link' && banner[field] === '') continue;
      let url;
      try { url = new URL(banner[field]); } catch { throw new Error('올바른 이미지 및 연결 주소를 입력해 주세요.'); }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('주소는 http 또는 https로 시작해야 합니다.');
    }
    if (!validDate(banner.startDate) || !validDate(banner.endDate) || banner.startDate > banner.endDate) throw new Error('노출 기간을 확인해 주세요. 종료일은 시작일 이후여야 합니다.');
  }
  if (assets.businesses !== undefined) validateBusinesses(assets.businesses);
  return assets;
}

export function imageExtension(bytes) {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  throw new Error('PNG, JPG, GIF, WebP 이미지만 업로드할 수 있습니다.');
}

export function validateChanges(assets, uploads, deletions, oldAssets, existingPaths) {
  validateAssets(assets);
  if (!Array.isArray(uploads) || !Array.isArray(deletions) || uploads.length > 100 || deletions.length > 100) throw new Error('파일 변경 목록이 올바르지 않습니다.');
  const used = new Set(managedImages(assets).map(imagePath).filter(Boolean));
  const oldUsed = new Set(managedImages(oldAssets).map(imagePath).filter(Boolean));
  const changed = new Set();
  let totalBytes = 0;
  for (const upload of uploads) {
    if (!upload || !imagePath(cdnBase + upload.path) || !used.has(upload.path) || existingPaths.has(upload.path) || changed.has(upload.path)) throw new Error('새 이미지 경로가 올바르지 않거나 이미 존재합니다.');
    if (typeof upload.content !== 'string' || upload.content.length > Math.ceil(maxImageBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(upload.content)) throw new Error('이미지는 5MB 이하여야 합니다.');
    const bytes = Uint8Array.from(atob(upload.content), character => character.charCodeAt(0));
    totalBytes += bytes.length;
    if (totalBytes > 20 * 1024 * 1024) throw new Error('한 번에 저장할 이미지는 총 20MB 이하여야 합니다.');
    if (!bytes.length || bytes.length > maxImageBytes || !upload.path.endsWith(`.${imageExtension(bytes)}`)) throw new Error('이미지 파일 형식이 올바르지 않습니다.');
    changed.add(upload.path);
  }
  for (const path of deletions) {
    if (!imagePath(cdnBase + path) || !existingPaths.has(path) || used.has(path) || changed.has(path)) throw new Error('사용 중이거나 존재하지 않는 이미지는 삭제할 수 없습니다.');
    changed.add(path);
  }
  for (const path of used) {
    if (!existingPaths.has(path) && !changed.has(path) && !oldUsed.has(path)) throw new Error('등록되지 않은 이미지 경로입니다.');
  }
}

export function managedImages(assets) {
  return [...assets.banners.map(row => row.image), ...(assets.businesses || []).flatMap(row => row.images)];
}

export function validateBusinesses(rows) {
  if (!Array.isArray(rows) || rows.length > 200) throw new Error('성도의 기업은 최대 200개까지 등록할 수 있습니다.');
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(row.id) || ids.has(row.id)) throw new Error('기업 ID가 올바르지 않거나 중복되었습니다.');
    ids.add(row.id);
    normalizeBusinessCategory(row.category, row.id);
    if (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 200) throw new Error('기업명을 200자 이내로 입력해 주세요.');
    if (!Number.isInteger(row.order) || row.order < 1) throw new Error('표시 순서는 양의 정수여야 합니다.');
    for (const [field, limit] of [['description', 20000], ['address', 1000]]) {
      if (typeof row[field] !== 'string' || row[field].length > limit) throw new Error('본문 또는 주소 길이를 확인해 주세요.');
    }
    for (const field of ['images', 'phones', 'websites']) {
      if (!Array.isArray(row[field]) || row[field].length > 30 || row[field].some(value => typeof value !== 'string' || !value.trim())) throw new Error('이미지, 전화번호, 웹사이트 목록을 확인해 주세요.');
    }
    if (row.reservationUrl !== undefined && (typeof row.reservationUrl !== 'string' || row.reservationUrl.length > 2048)) throw new Error('예약 페이지 주소를 확인해 주세요.');
    if (row.phones.some(value => !/^\+?[0-9() .-]{3,40}$/.test(value))) throw new Error('전화번호 형식을 확인해 주세요.');
    for (const value of [...row.images, ...row.websites, ...(row.reservationUrl ? [row.reservationUrl] : []), ...(row.sourceUrl ? [row.sourceUrl] : [])]) {
      let url;
      try { url = new URL(value); } catch { throw new Error('올바른 이미지 및 웹사이트 주소를 입력해 주세요.'); }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('주소는 http 또는 https로 시작해야 합니다.');
    }
  }
  return rows;
}
