// src/buildRss.js
import fetch from 'node-fetch';
import { create } from 'xmlbuilder2';
import dayjs from 'dayjs';

// ====== ENV ======
const SOURCE_URL = process.env.SOURCE_URL;                // secret
const SITE_URL   = process.env.SITE_URL || 'https://www.tissual-balancing.com';
const FEED_TITLE = process.env.RSS_TITLE || 'Tissual Balancing® – Formations';
const FEED_DESC  = process.env.RSS_DESCRIPTION || 'Flux des formations (CMS).';
const LIMIT      = parseInt(process.env.RSS_LIMIT || '10', 10);
const OUTPUT     = process.env.RSS_OUTPUT || 'docs/rss.xml';

// ====== helpers ======
function toHttpFromWixImage(url) {
  // Transforme: wix:image://v1/3d487b_xxx~mv2.avif/Name.avif#originWidth...
  // en:         https://static.wixstatic.com/media/3d487b_xxx~mv2.avif
  if (!url || typeof url !== 'string') return undefined;
  const m = url.match(/^wix:image:\/\/v\d\/([^/]+)\//); // capture "3d487b_xxx~mv2.avif"
  if (m) return `https://static.wixstatic.com/media/${m[1]}`;
  return url; // si c’est déjà http(s)
}

function parseDateStartFromText(txt) {
  if (!txt) return undefined;
  const s = String(txt);

  // Cas "du 08/09 au 19/09/2025" -> start = 2025-09-08
  let m = s.match(/du\s+(\d{1,2})[\/\.](\d{1,2})\s+au\s+(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i);
  if (m) {
    const [, d1, mo1, , , y] = m;
    const pad = (n) => String(n).padStart(2, '0');
    return `${y}-${pad(mo1)}-${pad(d1)}`;
  }

  // yyyy-mm-dd quelque part
  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return m[0];

  // dd/mm/yyyy
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) {
    const [, d, mo, y] = m;
    const pad = (n) => String(n).padStart(2, '0');
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  // dd/mm (sans année) -> prend année courante
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m) {
    const [, d, mo] = m;
    const y = String(new Date().getFullYear());
    const pad = (n) => String(n).padStart(2, '0');
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  return undefined;
}

function buildItemDescription(it) {
  if (it.rssHtml && typeof it.rssHtml === 'string' && it.rssHtml.trim()) {
    // on fait confiance à ton HTML personnalisé
    return it.rssHtml;
  }
  // fallback : tableau propre
  const rows = [
    ['Lieu & dates', it.lieuEtDate],
    ['Durée', it.nbJours],
    ['Prix', it.prix]
  ].filter(([, v]) => v);

  const trs = rows
    .map(
      ([k, v]) =>
        `<tr><th style="text-align:left;padding:4px 8px;">${k}</th><td style="padding:4px 8px;">${String(
          v
        ).replace(/</g, '&lt;')}</td></tr>`
    )
    .join('\n');

  return `<table>${trs}</table>`;
}

// ====== main ======
async function main() {
  if (!SOURCE_URL) {
    console.error('❌ SOURCE_URL manquant (Settings → Secrets → Actions).');
    process.exit(1);
  }

  console.log(`➡️ Fetch: ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, { timeout: 20000 });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const srcItems = Array.isArray(json.items) ? json.items : [];

  if (!srcItems.length) {
    console.warn('⚠️ Aucune formation reçue. Écriture d’un flux minimal.');
  }

  // mapping exact des champs Wix (d’après ton debug)
  const items = srcItems
    .filter((it) => it && it.title) // simple garde-fou
    .map((it) => {
      const title = it.title || 'Formation';
      const link = it.link || it.lien || SITE_URL;
      const image = toHttpFromWixImage(it.image || it.nouveauChamp);
      const prix = it.prix;
      const lieuEtDate = it.lieuEtDate || it.dates;
      const nbJours = it.nbJours || it.nbDeJoursheures;
      const rssHtml = it.rssHtml;
      const dateStart = parseDateStartFromText(lieuEtDate) || it.dateStart;

      return {
        title,
        link,
        guid: link,
        dateStart,
        description: buildItemDescription({ rssHtml, lieuEtDate, nbJours, prix }),
        enclosure: image
      };
    })
    // tri ascendant sur dateStart si dispo
    .sort((a, b) => {
      const ta = a.dateStart ? +new Date(a.dateStart) : Infinity;
      const tb = b.dateStart ? +new Date(b.dateStart) : Infinity;
      return ta - tb;
    })
    .slice(0, LIMIT);

  // Construction RSS 2.0
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rss', { version: '2.0' })
    .ele('channel')
    .ele('title').txt(FEED_TITLE).up()
    .ele('link').txt(SITE_URL).up()
    .ele('description').txt(FEED_DESC).up()
    .ele('language').txt('fr-FR').up();

  for (const it of items) {
    const pubDate =
      it.dateStart ? dayjs(it.dateStart).toDate().toUTCString() : new Date().toUTCString();

    const item = root.ele('item');
    item.ele('title').txt(it.title).up();
    item.ele('link').txt(it.link).up();
    item.ele('guid').txt(it.guid).up();
    item.ele('pubDate').txt(pubDate).up();
    item.ele('description').txt(it.description).up();

    if (it.enclosure) {
      item
        .ele('enclosure', {
          url: it.enclosure,
          type: 'image/*'
        })
        .up();
    }
  }

  const xml = root.end({ prettyPrint: true });

  // write file
  import('fs').then(({ writeFileSync, mkdirSync }) => {
    mkdirSync(OUTPUT.split('/').slice(0, -1).join('/'), { recursive: true });
    writeFileSync(OUTPUT, xml, 'utf8');
    console.log(`✅ RSS écrit → ${OUTPUT}`);
  });
}

main().catch((e) => {
  console.error('❌ Build failed:', e);
  process.exit(1);
});
