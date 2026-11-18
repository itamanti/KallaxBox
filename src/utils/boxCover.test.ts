import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidBoxImageUrl,
  sanitizeBoxImageUrl,
  resolveBoxCoverUrl,
  shouldShowBoxCoverImage,
  isAllowedProxyImageHost,
  buildProxyImageUrl,
  mergeBoxCoverFields,
  pickDisplayCoverUrl,
  pickDisplayCoverWithProxy,
  coverHydrationKey,
  selectNextMissingCoverBatch,
} from './boxCover';

test('isValidBoxImageUrl allows real Geekdo original and previewthumb URLs', () => {
  assert.equal(
    isValidBoxImageUrl(
      'https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__original/img/cI782Zis9cT66j2MjSHKJGnFPNw=/0x0/filters:format(jpeg)/pic4458123.jpg'
    ),
    true
  );
  assert.equal(
    isValidBoxImageUrl(
      'https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__previewthumb/img/Wb5DRcUTi7d-Mykb1rTwD9wLO1U=/fit-in/300x320/filters:strip_icc()/pic4458123.jpg'
    ),
    true
  );
});

test('isValidBoxImageUrl rejects broken placeholders, empty strings, and javascript URLs', () => {
  assert.equal(isValidBoxImageUrl(''), false);
  assert.equal(isValidBoxImageUrl(undefined), false);
  assert.equal(isValidBoxImageUrl('https://example.com/scout.jpg'), false);
  assert.equal(isValidBoxImageUrl('https://cf.geekdo-images.com/pic5666597.jpg'), false);
  assert.equal(isValidBoxImageUrl('javascript:alert(1)'), false);
});

test('resolveBoxCoverUrl selects thumbnail or high-res image appropriately', () => {
  const game = {
    thumbnail: 'https://cf.geekdo-images.com/abc__previewthumb/img/123.jpg',
    image: 'https://cf.geekdo-images.com/abc__original/img/123.jpg',
  };
  assert.equal(resolveBoxCoverUrl(game, false), game.thumbnail);
  assert.equal(resolveBoxCoverUrl(game, true), game.image);
  assert.equal(resolveBoxCoverUrl({ thumbnail: 'https://x.com/scout.jpg', image: game.image }), game.image);
  assert.equal(sanitizeBoxImageUrl('  https://cf.geekdo-images.com/a.jpg  '), 'https://cf.geekdo-images.com/a.jpg');
});

test('shouldShowBoxCoverImage hides covers when box colors mode is enabled', () => {
  const validUrl = 'https://cf.geekdo-images.com/abc.jpg';
  assert.equal(shouldShowBoxCoverImage(false, validUrl), true);
  assert.equal(shouldShowBoxCoverImage(true, validUrl), false);
  assert.equal(shouldShowBoxCoverImage(false, undefined), false);
  assert.equal(shouldShowBoxCoverImage(false, 'https://example.com/scout.jpg'), false);
});

test('isAllowedProxyImageHost validates safe image CDN domains only', () => {
  assert.equal(isAllowedProxyImageHost('cf.geekdo-images.com'), true);
  assert.equal(isAllowedProxyImageHost('upload.wikimedia.org'), true);
  assert.equal(isAllowedProxyImageHost('m.media-amazon.com'), true);
  assert.equal(isAllowedProxyImageHost('localhost'), false);
  assert.equal(isAllowedProxyImageHost('127.0.0.1'), false);
  assert.equal(isAllowedProxyImageHost('evil.example.com'), false);
});

test('buildProxyImageUrl encodes target URL', () => {
  assert.equal(
    buildProxyImageUrl('https://cf.geekdo-images.com/a.jpg?x=1'),
    '/api/image-proxy?url=https%3A%2F%2Fcf.geekdo-images.com%2Fa.jpg%3Fx%3D1'
  );
});

test('mergeBoxCoverFields fills missing thumbnail/image and preserves valid existing covers', () => {
  const thumb = 'https://cf.geekdo-images.com/thumb.jpg';
  const img = 'https://cf.geekdo-images.com/orig.jpg';

  const filled = mergeBoxCoverFields({ name: 'Test', thumbnail: '', image: undefined }, { thumbnail: thumb, image: img });
  assert.equal(filled.thumbnail, thumb);
  assert.equal(filled.image, img);

  const preserved = mergeBoxCoverFields({ name: 'Test', thumbnail: thumb, image: img }, { thumbnail: '', image: '' }, true);
  assert.equal(preserved.thumbnail, thumb);
  assert.equal(preserved.image, img);

  const upgraded = mergeBoxCoverFields(
    { name: 'Test', thumbnail: 'https://upload.wikimedia.org/old.jpg', image: undefined },
    { thumbnail: thumb, image: img },
    true
  );
  assert.equal(upgraded.thumbnail, thumb);
  assert.equal(upgraded.image, img);
});

test('pickDisplayCoverUrl falls back from failed primary thumbnail to image and then undefined', () => {
  const thumb = 'https://cf.geekdo-images.com/thumb.jpg';
  const img = 'https://cf.geekdo-images.com/orig.jpg';
  const failed = new Set<string>([thumb]);

  assert.equal(pickDisplayCoverUrl({ thumbnail: thumb, image: img }, null), thumb);
  assert.equal(pickDisplayCoverUrl({ thumbnail: thumb, image: img }, failed), img);
  assert.equal(pickDisplayCoverUrl({ thumbnail: thumb, image: img }, new Set([thumb, img])), undefined);
});

test('pickDisplayCoverWithProxy falls back to /api/image-proxy for allowed CDN URLs after direct failure', () => {
  const thumb = 'https://cf.geekdo-images.com/thumb.jpg';
  const img = 'https://cf.geekdo-images.com/orig.jpg';
  const proxyThumb = buildProxyImageUrl(thumb);

  assert.equal(pickDisplayCoverWithProxy({ thumbnail: thumb, image: img }, new Set()), thumb);
  assert.equal(pickDisplayCoverWithProxy({ thumbnail: thumb, image: img }, new Set([thumb, img])), proxyThumb);
  assert.equal(
    pickDisplayCoverWithProxy({ thumbnail: thumb, image: img }, new Set([thumb, img, proxyThumb, buildProxyImageUrl(img)])),
    undefined
  );
  assert.equal(
    pickDisplayCoverWithProxy({ thumbnail: 'https://evil.example.com/x.jpg' }, new Set(['https://evil.example.com/x.jpg'])),
    undefined
  );
});

test('selectNextMissingCoverBatch incrementally selects unattempted games prioritizing placed boxes', () => {
  const games = Array.from({ length: 15 }, (_, idx) => ({
    id: `g-${idx}`,
    name: `Game ${idx}`,
    bggId: idx + 100,
    thumbnail: idx === 0 ? 'https://cf.geekdo-images.com/existing.jpg' : undefined,
    image: undefined,
  }));
  const placedIds = new Set(['g-12', 'g-14']);
  const attempted = new Set<string>();

  const batch1 = selectNextMissingCoverBatch(games, placedIds, attempted, 6);
  assert.equal(batch1.length, 6);
  assert.equal(batch1[0].id, 'g-12');
  assert.equal(batch1[1].id, 'g-14');
  assert.ok(!batch1.some((g) => g.id === 'g-0'));

  batch1.forEach((g) => attempted.add(coverHydrationKey(g)));
  const batch2 = selectNextMissingCoverBatch(games, placedIds, attempted, 6);
  assert.equal(batch2.length, 6);
  assert.ok(batch2.every((g) => !batch1.some((b) => b.id === g.id)));

  batch2.forEach((g) => attempted.add(coverHydrationKey(g)));
  const batch3 = selectNextMissingCoverBatch(games, placedIds, attempted, 6);
  assert.equal(batch3.length, 2);
});


