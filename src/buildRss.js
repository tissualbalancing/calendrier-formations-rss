import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { create } from 'xmlbuilder2';

// ===== CONFIG =====
const SOURCE_URL = process.env.SOURCE_URL;                 // secret Actions
const OUTPUT = process.env.RSS_OUTPUT || 'docs/rss.xml';   // rss.yml pousse vers /docs
const FEED_TITLE = process.env.RSS_TITLE || 'Tissual Balancing® – Formations';
const FEED_LINK  = process.env.SITE_URL  || 'https://www.tissual-balancing.com';
const FEED_DESC  = process.env.RSS_DESCRIPTION || 'Flux des 3 prochaines formations (ordre d’apparition).';
const LIMIT = parseInt(process.env.RSS_LIMIT || '3', 10);

if (!SOURCE_URL) {
  console.error('❌ SOURCE_URL manquant (Settings → Secrets → Actions).');
  process.exit(1);
}

// Construit un RSS 2.0 simple
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

// Détection robuste sur une page Wix : on garde l'ordre du DOM (= ordre d’apparition)
function extractItemsFromHTML(html) {
  const $ = cheerio.load(html);

  // On cible d'abord des “cartes” possibles
  let blocks = $('.gallery-slide, .course-card, .training-card, [role="listitem"], article');

  // Si rien de concluant, on tombera sur des <a> pertinents
  if (blocks.length === 0) {
    blocks = $('a[href]');
  }

  const makeAbsolute = (href) => {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    return FEED_LINK.replace(/\/$/, '') + '/' + href.replace(/^\//, '');
  };

  const items = [];
  const seen = new Set();

  // Itération dans l’ordre du DOM => garde l’ordre d’apparition
  blocks.each((_, el) => {
    const node = $(el);

    // 1) Trouver un lien pertinent (priorité aux liens “formations”)
    let a = node.is('a') ? node : node.find('a').first();
    let href = a.attr('href') || '';
    if (!href || href.startsWith('#')) return;
    const abs = makeAbsolute(href);

    // Filtrer un peu pour éviter les liens hors-sujet ; garde large mais utile
    const keep = /formations|massage|therap/i.test(abs);
    if (!keep) return;

    if (seen.has(abs)) return; // pas de doublon
    seen.add(abs);

    // 2) Récupérer un titre lisible (heading proche > aria-label > texte du lien)
    const title =
      node.find('h1,h2,h3,.title,.card-title').first().text().trim() ||
      a.attr('aria-label') ||
      a.text().trim();

    if (!title) return;

    // 3) Image et extrait optionnels
    const img = (node.find('img').first().attr('src') || a.find('img').first().attr('src')) || null;
    const excerpt = node.find('p,.excerpt,.summary').first().text().trim() || '';

    items.push({ title, url: abs, image: img, excerpt });
  });

  return items;
}

const fs = await import('fs');
const path = await import('path');

(async () => {
  console.log('➡️ Fetch:', SOURCE_URL);
  const res = await fetch(SOURCE_URL, { headers: { 'accept': 'text/html' } });
  if (!res.ok) {
    console.error('❌ Fetch error:', res.status, await res.text().catch(()=> ''));
    process.exit(1);
  }

  const html = await res.text();
  const items = extractItemsFromHTML(html);

  if (!items.length) {
    console.warn('⚠️ Aucun élément détecté. Vérifie les sélecteurs ou la page.');
  }

  const xml = buildRSS(items);

  const outPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, xml, 'utf8');
  console.log('✅ RSS écrit →', outPath);
})();
