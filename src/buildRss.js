import fetch from 'node-fetch';
import { create } from 'xmlbuilder2';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';

const SOURCE_URL = process.env.SOURCE_URL;
const SITE_URL   = process.env.SITE_URL || 'https://www.tissual-balancing.com';
const FEED_TITLE = process.env.RSS_TITLE || 'Tissual Balancing® – Formations';
const FEED_DESC  = process.env.RSS_DESCRIPTION || 'Flux des formations (CMS).';
const LIMIT      = parseInt(process.env.RSS_LIMIT || '3', 10);
const OUTPUT     = process.env.RSS_OUTPUT || 'docs/rss.xml';

if (!SOURCE_URL) {
  console.error('❌ SOURCE_URL manquant');
  process.exit(1);
}

const esc = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const toRssDate = v => (v ? new Date(v) : new Date()).toUTCString();

function buildRSS(items) {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rss', { version: '2.0' })
      .ele('channel')
        .ele('title').txt(FEED_TITLE).up()
        .ele('link').txt(SITE_URL).up()
        .ele('description').txt(FEED_DESC).up()
        .ele('language').txt('fr-FR').up();

  items.forEach(it => {
    const rows = [
      ['lieu/date', it.lieuEtDate],
      ['jours/heures', it.nbJours],
      ['prix', it.prix],
      ['complet', it.complet ? 'oui' : 'non']
    ].filter(([,v]) => v);

    const htmlTable =
      '<table>' +
      rows.map(([k,v]) => `<tr><th style="text-align:left;padding:4px 8px;">${esc(k)}</th><td style="padding:4px 8px;">${esc(v)}</td></tr>`).join('') +
      '</table>';

    const item = root.ele('item');
    item.ele('title').txt(it.title || 'Formation').up();
    item.ele('link').txt(it.link || SITE_URL).up();
    item.ele('guid').txt(it.link || SITE_URL).up();
    item.ele('pubDate').txt(toRssDate(it.dateStart)).up();
    item.ele('description').dat(htmlTable).up();
    if (it.image) item.ele('enclosure', { url: it.image, type: 'image/jpeg' }).up();
    item.up();
  });

  return root.end({ prettyPrint: true });
}

(async () => {
  try {
    console.log('➡️ Fetch:', SOURCE_URL);
    const res = await fetch(SOURCE_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || []);
    const list = items.filter(x => !x.complet).slice(0, LIMIT);

    const xml = buildRSS(list);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, xml, 'utf8');
    console.log('✅ RSS écrit →', OUTPUT);
  } catch (e) {
    console.error('❌ Erreur:', e.message || e);
    const fallback = buildRSS([]);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, fallback, 'utf8');
    process.exit(1);
  }
})();
