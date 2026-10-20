export const repository = 'ssmind96/isungsan-ads';
export const branch = 'main';
export const cdnBase = `https://cdn.jsdelivr.net/gh/${repository}@${branch}/`;
export const maxImageBytes = 5 * 1024 * 1024;

export function imagePath(url) {
  if (typeof url !== 'string' || !url.startsWith(cdnBase)) return null;
  const path = url.slice(cdnBase.length);
  return /^banners\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/i.test(path) ? path : null;
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
  const used = new Set(assets.banners.map(banner => imagePath(banner.image)).filter(Boolean));
  const oldUsed = new Set(oldAssets.banners.map(banner => imagePath(banner.image)).filter(Boolean));
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
