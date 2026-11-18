import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidBoxImageUrl,
  sanitizeBoxImageUrl,
  resolveBoxCoverUrl,
  shouldShowBoxCoverImage,
  isAllowedProxyImageHost,
  buildProxyImageUrl,
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
