// src/buildRss.js
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { create } from 'xmlbuilder2';

// ===== ENV =====
const SOURCE_URL = process.env.SOURCE_URL;                         // Secret GitHub
const SITE_URL   = process.env.SITE_URL || 'https://www.tissual-balancing.com';
const FEED_TITLE = process.env.RSS_TITLE || 'Tissual Balancing® – Formations';
const FEED_DESC  = process.env.RSS_DESCRIPTION || 'Flux des formations (CMS).';
const LIMIT      = parseInt(process.env.RSS_LIMIT || '3', 10);
const OUTPUT     = process.env.RSS_OUTPUT || 'docs/rss.xml';

if (!SOURCE_URL) {
  console.error('❌ SOURCE_URL manquant (Settings → Secrets → Actions).');
  process.exit(1);
}

// ===== Helpers =====
function toHttpFromWixImage(url) {
  if (!url || typeof url !== 'string') return undefined;
  // wix:image://v1/<MEDIA_ID>/Name.ext#...
  const m = url.match(/^wix:image:\/\/v\d\/([^/]+)\//);
  if (m) return `https://static.wixstatic.com/media/${m[1]}`;
  return url;
}

function guessMimeFromUrl(url) {
  if (!url) return 'image/*';
  const u = url.toLowerCase();
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.avif')) return 'image/avif';
  return 'image/*';
}

function buildTableDesc({ lieuEtDate, nbJours, prix, complet }) {
  const rows = [
    ['lieu/date', lieuEtDate],
    ['jours/heures', nbJours],
    ['prix', prix],
    ['complet', complet ? 'oui' : 'non'],
  ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');

  const esc = (s) => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  return `<table>${
    rows.map(([k,v]) =>
      `<tr><th style="text-align:left;padding:4px 8px;">${esc(k)}</th><td style="padding:4px 8px;">${esc(v)}</td></tr>`
    ).join('')
  }</table>`;
}

// ===== Main =====
(async () => {
  try {
    console.log('➡️ Fetch:', SOURCE_URL);
    const res = await fetch(SOURCE_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const src = Array.isArray(data?.items) ? data.items : [];

    // Tri **uniquement** par ordreChronologique si dispo, sinon on conserve l’ordre reçu
    const items = [...src].sort((a, b) => {
      const oa = (a?.ordreChronologique ?? null);
      const ob = (b?.ordreChronologique ?? null);
      if (oa == null && ob == null) return 0;
      if (oa == null) return 1;
      if (ob == null) return -1;
      // comparaison num/alpha tolérante
      if (typeof oa === 'number' && typeof ob === 'number') return oa - ob;
      return String(oa).localeCompare(String(ob), 'fr', { numeric: true, sensitivity: 'base' });
    }).slice(0, LIMIT);

    // Build RSS
    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('rss', { version: '2.0' })
        .ele('channel')
          .ele('title').txt(FEED_TITLE).up()
          .ele('link').txt(SITE_URL).up()
          .ele('description').txt(FEED_DESC).up()
          .ele('language').txt('fr-FR').up();

    for (const it of items) {
      const title = it.title || it.titre || it.nom || 'Formation';
      const link  = it.link || it.lien || it.url || SITE_URL;

      // pubDate = **le champ dates tel quel** (à ta demande)
      const pubDate = it.dates || it.lieuEtDate || '';

      const image = toHttpFromWixImage(it.image || it.nouveauChamp || it.photo);
      const mime  = guessMimeFromUrl(image);
      const desc  = it.rssHtml && String(it.rssHtml).trim()
        ? String(it.rssHtml)                         // si tu fournis un HTML prêt à l’emploi
        : buildTableDesc({
            lieuEtDate: it.lieuEtDate ?? it.dates,
            nbJours: it.nbJours ?? it.nbDeJoursheures,
            prix: it.prix,
            complet: it.complet === true
          });

      const item = root.ele('item');
      item.ele('title').txt(title).up();
      item.ele('link').txt(link).up();
      item.ele('guid').txt(link).up();
      item.ele('pubDate').txt(pubDate).up();      // pas d’interprétation de date
      item.ele('description').dat(desc).up();

      if (image) item.ele('enclosure', { url: image, type: mime }).up();

      item.up();
    }

    const xml = root.end({ prettyPrint: true });

    // Écriture fichier
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, xml, 'utf8');
    console.log(`✅ RSS écrit → ${OUTPUT} (${xml.length} chars)`);

  } catch (e) {
    console.error('❌ Build failed:', e?.message || e);
    // Fallback minimal pour ne pas casser le déploiement
    const xml = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('rss', { version: '2.0' })
        .ele('channel')
          .ele('title').txt(FEED_TITLE).up()
          .ele('link').txt(SITE_URL).up()
          .ele('description').txt(FEED_DESC).up()
          .ele('language').txt('fr-FR').up()
        .up()
      .end({ prettyPrint: true });
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, xml, 'utf8');
    process.exit(1);
  }
})();
