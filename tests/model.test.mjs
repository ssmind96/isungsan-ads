import test from 'node:test';
import assert from 'node:assert/strict';
import { cdnBase, imagePath, validDate, validateAssets, validateChanges } from '../shared/model.js';

const path = 'banners/example.png';
const banner = () => ({ order: 1, title: '교회 소식', image: cdnBase + path, bgColor: '#EEEEEE', link: '', startDate: '20260101', endDate: '20261231' });
const assets = () => ({ banners: [banner()] });
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64');

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
