import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { create } from 'xmlbuilder2';

// -------- CONFIG --------
const SOURCE_URL = process.env.SOURCE_URL; // on la met en secret GitHub
const OUTPUT = 'docs/rss.xml';             // GitHub Pages servira /docs
const FEED_TITLE = 'Tissual Balancing® – Formations';
const FEED_LINK = process.env.SITE_URL || 'https://www.tissual-balancing.com';
const FEED_DESC = 'Flux des 3 prochaines formations (ordre d’apparition).';
const LIMIT = 3;

if (!SOURCE_URL) {
  console.error('❌ SOURCE_URL manquant (secret Actions).');
  process.exit(1);
}

function buildRSS(items) {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rss', { version: '2.0' })
    .ele('channel')
      .ele('title').txt(FEED_TITLE).up()
      .ele('link').txt(FEED_LINK).up()
      .ele('description').txt(FEED_DESC).up()
      .ele('language').txt('fr-FR').up();

  items.slice(0, LIMIT).forEach(i => {
    const it = root.ele('item');
    it.ele('title').txt(i.title || 'Sans titre').up();
    it.ele('link').txt(i.url || FEED_LINK).up();
    it.ele('guid').txt(i.url || FEED_LINK).up();
    if (i.excerpt) it.ele('description').txt(i.excerpt).up();
    if (i.image) it.ele('enclosure', { url: i.image, type: 'image/jpeg' }).up();
  });

  return root.end({ prettyPrint: true });
}

function extractItemsFromHTML(html, baseUrl) {
  const $ = cheerio.load(html);

  // 1) Essaie un sélecteur “galerie/slide” courant sur Wix
  let cards = $('.gallery-slide, .course-card, .training-card, article');

  // Si rien trouvé, prends simplement les 3 premiers liens significatifs
  if (cards.length === 0) {
    cards = $('a:has(img), a:has(h1), a:has(h2), a:has(h3)');
  }

  const items = [];
  cards.each((_, el) => {
    const node = $(el);
    const title = node.find('h1,h2,h3,.title,.card-title').first().text().trim()
      || node.attr('aria-label') || node.text().trim().slice(0, 120);
    let href = node.find('a').first().attr('href') || '';
    if (href && !href.startsWith('http')) {
      href = FEED_LINK.replace(/\/$/, '') + '/' + href.replace(/^\//, '');
    }
    const img = node.find('img').first().attr('src') || null;
    const excerpt = node.find('p,.excerpt,.summary').first().text().trim();

    if (title) items.push({ title, url: href || baseUrl, image: img, excerpt });
  });

  return items;
}

const fs = await import('fs');
const path = await import('path');

(async () => {
  const res = await fetch(SOURCE_URL, { headers: { 'accept': 'text/html' } });
  const html = await res.text();

  const items = extractItemsFromHTML(html, SOURCE_URL).slice(0, LIMIT);
  const xml = buildRSS(items);

  const outPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, xml, 'utf8');
  console.log('✅ RSS écrit →', outPath);
})();
