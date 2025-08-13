import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { create } from 'xmlbuilder2';

const SOURCE_URL = process.env.SOURCE_URL || 'https://www.tissual-balancing.com/_functions/rssData?limit=3';
const OUTPUT_PATH = path.join('docs', 'rss.xml');

// Convertit wix:image:// → URL HTTP
function toHttpFromWixImage(url) {
  if (!url || typeof url !== 'string') return undefined;
  const m = url.match(/^wix:image:\/\/v\d\/([^/]+)\//);
  if (m) return `https://static.wixstatic.com/media/${m[1]}`;
  return url;
}

// Détecte le type MIME en fonction de l'extension
function guessMimeFromUrl(url) {
  if (!url) return 'image/*';
  const u = url.toLowerCase();
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.avif')) return 'image/avif';
  return 'image/*';
}

async function main() {
  console.log('Fetching data from', SOURCE_URL);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const json = await res.json();

  const items = json.items || [];
  console.log(`Got ${items.length} items`);

  const limit = parseInt((SOURCE_URL.match(/limit=(\d+)/) || [])[1] || items.length, 10);
  const limitedItems = items.slice(0, limit);

  const feed = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rss', { version: '2.0' })
    .ele('channel')
    .ele('title').txt('Tissual Balancing® – Formations').up()
    .ele('link').txt('https://www.tissual-balancing.com').up()
    .ele('description').txt('Flux des formations (CMS).').up()
    .ele('language').txt('fr-FR').up();

  for (const it of limitedItems) {
    const title = it.title || '';
    const link = it.link || it.lien || '';
    const guid = link;
    const pubDate = it.dates || ''; // On prend directement le champ dates sans extraction
    const image = toHttpFromWixImage(it.image || it.nouveauChamp);
    const prix = it.prix || '';
    const lieuEtDate = it.lieuEtDate || it.dates || '';
    const nbJours = it.nbJours || it.nbDeJoursheures || '';
    const complet = it.complet ? 'oui' : 'non';

    const descriptionHtml = `
      <table>
        <tr><th style="text-align:left;padding:4px 8px;">lieu/date</th><td style="padding:4px 8px;">${lieuEtDate}</td></tr>
        <tr><th style="text-align:left;padding:4px 8px;">jours/heures</th><td style="padding:4px 8px;">${nbJours}</td></tr>
        <tr><th style="text-align:left;padding:4px 8px;">prix</th><td style="padding:4px 8px;">${prix}</td></tr>
        <tr><th style="text-align:left;padding:4px 8px;">complet</th><td style="padding:4px 8px;">${complet}</td></tr>
      </table>
    `.trim();

    const item = feed.ele('item');
    item.ele('title').txt(title).up();
    item.ele('link').txt(link).up();
    item.ele('guid').txt(guid).up();
    item.ele('pubDate').txt(pubDate).up();
    item.ele('description').dat(descriptionHtml).up();

    if (image) {
      item.ele('enclosure', { url: image, type: guessMimeFromUrl(image) }).up();
    }
  }

  const xml = feed.end({ prettyPrint: true });
  fs.writeFileSync(OUTPUT_PATH, xml, 'utf8');
  console.log('RSS feed written to', OUTPUT_PATH);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
