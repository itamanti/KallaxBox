import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectBestGeekdoVersionDimensions,
  scoreWikidataCandidates,
  extractBggAndWikidataFromWikipediaPages,
  extractAmazonAsinsFromSearchHtml,
  extractAmazonProductDimensions,
  parseGeminiJsonDimensions,
} from './dimensionSearch';
import { lookupBoardGameInfo, parseDimensionsFromText } from '../data/boardGameDatabase';

test('parseDimensionsFromText handles European comma decimals and rejects unrealistic numbers', () => {
  const eu = parseDimensionsFromText('Dimensioni prodotto: 29,7 x 29,7 x 7,5 cm');
  assert.deepEqual(eu, { width: 29.7, height: 29.7, depth: 7.5 });

  const inches = parseDimensionsFromText('Size: 4.72 x 3.54 x 1.18 inches');
  assert.deepEqual(inches, { width: 12.0, height: 9.0, depth: 3.0 });

  const bogus = parseDimensionsFromText('Resolution 1920 x 1080 x 32 cm');
  assert.equal(bogus, null);
});

test('lookupBoardGameInfo does not falsely match expansions or spin-offs to base games', () => {
  const wingspanAsia = lookupBoardGameInfo({ name: 'Wingspan: Asia' });
  assert.equal(wingspanAsia.found, false);

  const architects = lookupBoardGameInfo({ name: '7 Wonders: Architects' });
  assert.equal(architects.found, false);

  const catanCities = lookupBoardGameInfo({ name: 'Catan: Cities & Knights' });
  assert.equal(catanCities.found, false);

  // Exact match and edition-suffix match still work
  const alpacaEdition = lookupBoardGameInfo({ name: 'Alpaca: Travel, English edition' });
  assert.equal(alpacaEdition.found, true);
  assert.equal(alpacaEdition.width, 12.0);
});

test('selectBestGeekdoVersionDimensions converts inches to cm and prefers standard English/Italian editions', () => {
  const items = [
    { name: 'Flip 7 (Travel mini edition)', width: '3.0', length: '4.0', depth: '0.8' },
    { name: 'Flip 7 (English first edition)', width: '3.74', length: '5.71', depth: '0.98' },
  ];
  const best = selectBestGeekdoVersionDimensions(items, 'Flip 7');
  assert.ok(best !== null);
  assert.equal(best.width, 9.5);
  assert.equal(best.height, 14.5);
  assert.equal(best.depth, 2.5);
  assert.match(best.editionName, /English/);
});

test('scoreWikidataCandidates ranks board game entries above albums or films', () => {
  const ranked = scoreWikidataCandidates(
    [
      { id: 'Q36153', label: 'Harmonies', description: 'album by artist' },
      { id: 'Q131940371', label: 'Harmonies', description: '2024 board game' },
    ],
    'Harmonies'
  );
  assert.equal(ranked[0].id, 'Q131940371');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('extractBggAndWikidataFromWikipediaPages extracts BGG URLs and wikibase_item Q-IDs', () => {
  const pages = {
    '1': {
      title: 'Cascadia (board game)',
      pageprops: {
        wikibase_item: 'Q111340775',
        'wikibase-shortdesc': '2021 tile-laying board game',
      },
      extlinks: [{ '*': 'https://www.boardgamegeek.com/boardgame/295947/cascadia' }],
    },
    '2': {
      title: 'Cascadia (bioregion)',
      pageprops: {
        wikibase_item: 'Q971601',
        'wikibase-shortdesc': 'Bioregion in North America',
      },
      extlinks: [],
    },
  };

  const extracted = extractBggAndWikidataFromWikipediaPages(pages, 'Cascadia');
  assert.deepEqual(extracted.bggIds, [295947]);
  assert.deepEqual(extracted.wikibaseItems, ['Q111340775']);
});

test('extractAmazonAsinsFromSearchHtml and extractAmazonProductDimensions find matching game dimensions', () => {
  const searchHtml = `
    <div data-asin="B000000001"><span>Bustine protettive per Flip 7 sleeves</span></div>
    <div data-asin="B09ZPMKS65"><span>7 Wonders Architects Gioco da Tavolo Edizione Italiana</span></div>
  `;
  const asins = extractAmazonAsinsFromSearchHtml(searchHtml, '7 Wonders Architects');
  assert.deepEqual(asins, ['B09ZPMKS65']);

  const productHtml = `
    <html><body>
      <table><tr><th>Dimensioni prodotto</th><td>25 x 25 x 7,5 cm; 1,2 kg</td></tr></table>
    </body></html>
  `;
  const dims = extractAmazonProductDimensions(productHtml);
  assert.deepEqual(dims, { width: 25, height: 25, depth: 7.5 });
});

test('parseGeminiJsonDimensions extracts dimensions from fenced JSON or grounded prose', () => {
  const fenced = '```json\n{"found": true, "width": 29.7, "height": 29.7, "depth": 7.1}\n```';
  assert.deepEqual(parseGeminiJsonDimensions(fenced), { width: 29.7, height: 29.7, depth: 7.1 });

  const notFound = '{"found": false}';
  assert.equal(parseGeminiJsonDimensions(notFound), null);

  const prose = 'The retail box of Bomb Busters measures 29.7 x 29.7 x 7.1 cm according to BGG.';
  assert.deepEqual(parseGeminiJsonDimensions(prose), { width: 29.7, height: 29.7, depth: 7.1 });
});
