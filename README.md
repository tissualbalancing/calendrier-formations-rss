# RSS auto (GitHub Actions)

Ce projet génère automatiquement `rss.xml` depuis une source (JSON/HTML) et le publie sur `main` via GitHub Actions.

## Étapes
1. Crée un repo GitHub et upload ce dossier.
2. Dans **Settings → Secrets and variables → Actions**, ajoute :
   - `SOURCE_URL` (obligatoire) : ex. `https://www.tissual-balancing.com/_functions/rssFormations`
3. (Optionnel) Dans **Variables (vars)** ajoute `SITE_URL`, `RSS_TITLE`, `RSS_DESCRIPTION`.
4. Le workflow tourne toutes les 6h et commit `public/rss.xml`.

### Règles par défaut
- Garde uniquement `visible === true` (si le champ existe).
- Garde uniquement les éléments à venir (`dateStart >= aujourd'hui`) si `dateStart` existe.
- Trie par `ordre` si présent (croissant), sinon par `dateStart`.
- Limite à 3 éléments.
