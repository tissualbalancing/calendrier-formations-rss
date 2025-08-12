import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { create } from 'xmlbuilder2';
import dayjs from 'dayjs';

const LIMIT = parseInt(process.env.RSS_LIMIT || '3', 10);
const FEED_TITLE = process.env.RSS_TITLE || 'Tissual Balancing® – Formations';
const FEED_LINK = process.env.SITE_URL || 'https://www.tissual-balancing.com';
const FEED_DESC = process.env.RSS_DESCRIPTION || 'Flux des prochaines formations';
const FEED_LANG = process.env.RSS_LANG || 'fr-FR';
const OUTPUT = process.env.RSS_OUTPUT || 'public/rss.xml';
const ONLY_VISIBLE = true;
const ONLY_UPCOMING = true;
const PREFER_ORDRE_SORT = true;
const SOURCE_URL = process.env.SOURCE_URL;
if (!SOURCE_URL) { console.error('SOURCE_URL manquant'); process.exit(1); }

function normalizeItem(x = {}) {
  const item = {
    title: x.title || x.Titre || x.name || 'Sans titre',
    url: x.url || x.link || x.href || FEED_LINK,
    image: x.image || x.cover || x.img || null,
    excerpt: x.excerpt || x.description || x.desc || '',
    ordre: typeof x.ordre === 'number' ? x.ordre : (x.ordre ? Number(x.ordre) : null),
    visible: typeof x.visible === 'boolean' ? x.visible : (x.visible ? x.visible === true || x.visible === 'true' : true),
    dateStart: x.dateStart || x.startDate || x.date || null,
  };
  if (item.dateStart) {
    const d = dayjs(item.dateStart);
    item.dateStart = d.isValid() ? d.toISOString() : null;
  }
  return item;
}

function filterAndSort(items) {
  const today = dayjs().startOf('day');
  let out = items.filter(i => {
    if (ONLY_VISIBLE && i.visible === false) return false;
    if (ONLY_UPCOMING && i.dateStart) {
      const d = dayjs(i.dateStart);
      if (d.isValid() && d.isBefore(today)) return false;
    }
    return true;
  });
  if (PREFER_ORDRE_SORT && out.some(i => i.ordre !== null && !Number.isNaN(i.ordre))) {
    out = out.sort((a,b) => ( (a.ordre ?? 1e9) - (b.ordre ?? 1e9) ));
  } else {
    out = out.sort((a,b) => {
      const ad = a.dateStart ? dayjs(a.dateStart).valueOf() : 1e15;
      const bd = b.dateStart ? dayjs(b.dateStart).valueOf() : 1e15;
      return ad - bd;
    });
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { 'accept': 'application/json, text/html;q=0.9' }});
  const ct = r.headers.get('content-type') || '';
  const body = await r.text();
  if (ct.includes('application/json') || body.trim().startsWith('{') || body.trim().startsWith('[')) {
    return { type: 'json', data: JSON.parse(body) };
  }
  return { type: 'html', data: body };
}

function extractFromHTML(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('.training-card, .course-card, .gallery-slide, article').each((_, el) => {
    const node = $(el);
    const title = node.find('h3, h2, .title, .card-title').first().text().trim();
    const href = node.find('a').first().attr('href') || '';
    const img = node.find('img').first().attr('src') || null;
    const excerpt = node.find('p, .excerpt, .summary').first().text().trim();
    items.push(normalizeItem({
      title,
      url: href.startsWith('http') ? href : (href ? FEED_LINK.replace(/\/$/, '') + '/' + href.replace(/^\//, '') : FEED_LINK),
      image: img,
      excerpt,
    }));
  });
  return items;
}

function buildRSS(items) {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rss', { version: '2.0' })
    .ele('channel')
      .ele('title').txt(FEED_TITLE).up()
      .ele('link').txt(FEED_LINK).up()
      .ele('description').txt(FEED_DESC).up()
      .ele('language').txt(FEED_LANG).up();
  items.forEach(i => {
    const it = root.ele('item');
    it.ele('title').txt(i.title).up();
    it.ele('link').txt(i.url).up();
    it.ele('guid').txt(i.url).up();
    if (i.excerpt) it.ele('description').txt(i.excerpt).up();
    if (i.dateStart) it.ele('pubDate').txt(dayjs(i.dateStart).toDate().toUTCString()).up();
    if (i.image) it.ele('enclosure', { url: i.image, type: 'image/jpeg' }).up();
  });
  return root.end({ prettyPrint: true });
}

(async function main() {
  console.log('Fetch:', SOURCE_URL);
  const res = await fetchJSON(SOURCE_URL);
  let items = [];
  if (res.type === 'json') {
    const raw = Array.isArray(res.data) ? res.data : (res.data.data || res.data.items || []);
    items = raw.map(normalizeItem);
  } else {
    items = extractFromHTML(res.data);
  }
  const filtered = filterAndSort(items);
  const xml = buildRSS(filtered);
  const fs = await import('fs'); const path = await import('path');
  const outPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, xml, 'utf8');
  console.log('RSS écrit →', outPath);
})().catch(e => { console.error(e); process.exit(1); });
