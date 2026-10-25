import test from 'node:test';
import assert from 'node:assert/strict';
import { cdnBase, imagePath, validDate, normalizeBusinessCategory, validateAssets, validateChanges } from '../shared/model.js';

const path = 'banners/example.png';
const banner = () => ({ order: 1, title: '교회 소식', image: cdnBase + path, bgColor: '#EEEEEE', link: '', startDate: '20260101', endDate: '20261231' });
const assets = () => ({ banners: [banner()] });
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64');

test('former categories migrate while explicit new assignments are retained', () => {
  assert.equal(normalizeBusinessCategory('카페', '560'), '생활');
  assert.equal(normalizeBusinessCategory('기타', '585'), '교육');
  assert.equal(normalizeBusinessCategory(undefined, '711'), '건강');
  assert.equal(normalizeBusinessCategory('카페', 'new'), '음식');
  assert.equal(normalizeBusinessCategory('수리', 'new'), '생활');
  assert.equal(normalizeBusinessCategory(undefined, 'new'), '쇼핑');
  assert.equal(normalizeBusinessCategory('음식', '585'), '음식');
  assert.throws(() => normalizeBusinessCategory('전체', '585'));
});

test('real dates and leap years are checked', () => {
  assert.equal(validDate('20260230'), false);
  assert.equal(validDate('20240229'), true);
  assert.equal(validDate('20260229'), false);
  assert.equal(validDate('20261301'), false);
});

test('assets preserve extra application fields while rejecting invalid values', () => {
  const value = { ...assets(), metadata: { retained: true } };
  assert.equal(validateAssets(value), value);
  assert.throws(() => validateAssets({ banners: [{ ...banner(), link: 'javascript:alert(1)' }] }));
  assert.throws(() => validateAssets({ banners: [{ ...banner(), startDate: '20270101' }] }));
  assert.doesNotThrow(() => validateAssets({ banners: [banner(), banner()] }));
  assert.throws(() => validateAssets({ banners: [{ ...banner(), order: -1 }] }));
});

test('only repository banner paths can be changed', () => {
  assert.equal(imagePath(cdnBase + '../assets.json'), null);
  assert.equal(imagePath(cdnBase + 'banners/example.svg'), null);
  assert.equal(imagePath('https://example.com/banners/example.png'), null);
  assert.equal(imagePath(cdnBase + path), path);
});

test('images are added with their asset entry', () => {
  assert.doesNotThrow(() => validateChanges(assets(), [{ path, content: png }], [], { banners: [] }, new Set()));
  assert.throws(() => validateChanges(assets(), [{ path, content: btoa('<script>bad</script>') }], [], { banners: [] }, new Set()));
  assert.throws(() => validateChanges(assets(), [{ path, content: png }], [], assets(), new Set([path])));
  assert.throws(() => validateChanges(assets(), [], [], { banners: [] }, new Set()));
});

test('shared images cannot be deleted until every reference is removed', () => {
  assert.throws(() => validateChanges(assets(), [], [path], assets(), new Set([path])));
  assert.doesNotThrow(() => validateChanges({ banners: [] }, [], [path], assets(), new Set([path])));
  assert.throws(() => validateChanges({ banners: [] }, [], ['assets.json'], assets(), new Set(['assets.json'])));
});

const business = () => ({ id: 'example', order: 1, category: '쇼핑', title: '성도의 기업', description: '', images: [cdnBase + 'businesses/example.png'], phones: ['0507-1316-7321'], websites: [], address: '' });
test('business fields accept missing optional information and reject unsafe links, malformed contacts and duplicate IDs', () => {
  const value = { banners: [], businesses: [business()] };
  assert.doesNotThrow(() => validateAssets(value));
  for (const reservationUrl of ['', 'https://booking.example.com']) assert.doesNotThrow(() => validateAssets({ banners: [], businesses: [{ ...business(), reservationUrl }] }));
  assert.doesNotThrow(() => validateAssets({ banners: [], businesses: [{ ...business(), images: [], phones: [] }] }));
  for (const change of [{ category: '알 수 없는 업종' }, { category: null }, { reservationUrl: 'javascript:alert(1)' }, { reservationUrl: 'https://user:password@example.com' }, { reservationUrl: 123 }, { websites: ['javascript:alert(1)'] }, { images: ['file:///private/photo.jpg'] }, { phones: ['123;456'] }, { description: null }, { order: 0 }]) {
    assert.throws(() => validateAssets({ banners: [], businesses: [{ ...business(), ...change }] }));
  }
  assert.throws(() => validateAssets({ banners: [], businesses: [business(), business()] }));
});
test('business image uploads and shared banner references are protected in one transaction', () => {
  const path = 'businesses/example.png';
  const value = { banners: [], businesses: [business()] };
  assert.doesNotThrow(() => validateChanges(value, [{ path, content: png }], [], { banners: [], businesses: [] }, new Set()));
  assert.throws(() => validateChanges(value, [], [path], value, new Set([path])));
  const bannerReference = { banners: [{ ...banner(), image: cdnBase + path }], businesses: [] };
  assert.throws(() => validateChanges(bannerReference, [], [path], value, new Set([path])));
  assert.doesNotThrow(() => validateChanges({ banners: [], businesses: [] }, [], [path], value, new Set([path])));
});

test('imported business data validates and every repository image exists with the declared file type', async () => {
  const { readFile } = await import('node:fs/promises');
  const { imageExtension } = await import('../shared/model.js');
  const data = JSON.parse(await readFile(new URL('../businesses.json', import.meta.url), 'utf8'));
  validateAssets({ banners: [], ...data });
  assert(data.businesses.every(row => ['음식', '생활', '교육', '건강', '쇼핑'].includes(row.category)), 'every imported entry has an explicit category');
  for (const row of data.businesses) {
    for (const url of row.images) {
      const path = imagePath(url);
      assert(path);
      const bytes = await readFile(new URL(`../${path}`, import.meta.url));
      assert(path.endsWith(`.${imageExtension(bytes)}`));
    }
  }
});


test('optional member metadata accepts empty/absent values and validates text lengths', () => {
  const validate = metadata => validateAssets({ banners: [], businesses: [{ ...business(), ...metadata }] });
  for (const metadata of [{}, { memberName: '', memberRole: '' }, { memberName: '홍길동', memberRole: '집사' }, { memberName: '가'.repeat(100), memberRole: '가'.repeat(50) }]) assert.doesNotThrow(() => validate(metadata));
  for (const metadata of [{ memberName: null }, { memberRole: 1 }, { memberName: '가'.repeat(101) }, { memberRole: '가'.repeat(51) }]) assert.throws(() => validate(metadata));
});


test('phone arrays support none, one and multiple entries up to the shared limit', () => {
  for (const phones of [[], ['010-1234-5678'], ['010-1234-5678', '032-555-1234'], Array(30).fill('010-1234-5678')]) {
    const value = { banners: [], businesses: [{ ...business(), phones }] };
    assert.deepEqual(validateAssets(value).businesses[0].phones, phones);
  }
  assert.throws(() => validateAssets({ banners: [], businesses: [{ ...business(), phones: '010-1234-5678' }] }));
  assert.throws(() => validateAssets({ banners: [], businesses: [{ ...business(), phones: Array(31).fill('010-1234-5678') }] }));
});
