import fetch from 'node-fetch';
import { create } from 'xmlbuilder2';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';

const SOURCE_URL = process.env.SOURCE_URL;
const OUTPUT     = process.env.RSS_OUTPUT || 'docs/rss.xml';
const FEED_TITLE = process.env.RSS_TITLE  || 'Tissual Balancing® – Formations';
const FEED_LINK  = process.env.SITE_URL   || 'https://www.tissual-balancing.com';
const FEED_DESC  = process.env.RSS_DESCRIPTION || 'Flux des formations (CMS).';
const LIMIT      = parseInt(process.env.RSS_LIMIT || '3', 10);

// ---------- helpers ----------
async function fetchWithRetry(url, { tries = 5, timeoutMs = 45000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const controller = new AbortController();
    try {
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'accept': 'application/json,text/html',
          'user-agent': 'Mozilla/5.0 (GitHubActions RSS Bot)'
        }
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      const backoff = Math.min(2000 * attempt, 8000); // 2s,4s,6s,8s…
      console.log(`Attempt ${attempt}/${tries} failed: ${e.message}. Retry in ${backoff}ms`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

function tableFromObject(obj) {
  const rows = Object.entries(obj)
    .filter(([k]) => !['_id','_owner','_createdDate','_updatedDate'].includes(k))
    .map(([k, v]) => {
      const val = Array.isArray(v) ? v.join(', ')
        : (v && typeof v === 'object' ? JSON.stringify(v) : v);
      if (val === undefined || val === null || val === '') return '';
      return `<tr><th style="text-align:left;padding:4px 8px;">${k}</th><td style="padding:4px 8px;">${val}</td></tr>`;
    })
    .filter(Boolean).join('\n');
  return `<table>${rows}</table>`;
}

function buildRSS(items) {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rss', { version: '2.0' })
    .ele('channel')
      .ele('title').txt(FEED_TITLE).up()
      .ele('link').txt(FEED_LINK).up()
      .ele('description').txt(FEED_DESC).up()
      .ele('language').txt('fr-FR').up();

  (items || []).slice(0, LIMIT).forEach(raw => {
    const title = raw.title || raw.Titre || raw.name || 'Sans titre';
    const link  = raw.url || raw.link || FEED_LINK;
    const guid  = link;
    const pub   = raw.dateStart ? dayjs(raw.dateStart).toDate().toUTCString() : null;

    const it = root.ele('item');
    it.ele('title').txt(title).up();
    it.ele('link').txt(link).up();
    it.ele('guid').txt(guid).up();
    if (pub) it.ele('pubDate').txt(pub).up();
    it.ele('description').txt(tableFromObject(raw)).up();

    const image = raw.image || raw.photo || raw.cover || null;
    if (image) it.ele('enclosure', { url: image, type: 'image/jpeg' }).up();

    const cats = raw.tags || raw.labels || raw.categories || [];
    (Array.isArray(cats) ? cats : String(cats).split(','))
      .map(x => String(x).trim()).filter(Boolean)
      .forEach(c => it.ele('category').txt(c).up());
  });

  return root.end({ prettyPrint: true });
}

// ---------- main ----------
(async () => {
  if (!SOURCE_URL) {
    console.error('❌ SOURCE_URL manquant (Settings → Secrets → Actions).');
    process.exit(1);
  }

  console.log('➡️ Fetch:', new URL(SOURCE_URL).host);
  let json;
  try {
    const res = await fetchWithRetry(SOURCE_URL, { tries: 5, timeoutMs: 45000 });
    json = await res.json().catch(() => null);
  } catch (e) {
    console.error('❌ Fetch final échec:', e.message);
    // Écrire un flux minimal pour qu’il y ait toujours un fichier servi
    const xmlFallback = buildRSS([{
      title: 'Flux indisponible',
      note: `Erreur: ${e.message}`,
      dateStart: new Date().toISOString()
    }]);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, xmlFallback, 'utf8');
    console.log('⚠️ Flux minimal écrit →', OUTPUT);
    process.exit(0);
  }

  const items = Array.isArray(json) ? json : (json?.items || json?.data || []);
  if (!Array.isArray(items) || items.length === 0) {
    console.warn('⚠️ Aucuns items reçus — on publie un flux “vide”.');
  }

  const xml = buildRSS(items || []);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, xml, 'utf8');
  console.log('✅ RSS écrit →', OUTPUT);
})();
