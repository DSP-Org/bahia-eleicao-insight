<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Election results are a static snapshot in public/data/*.json (generated from TSE `resultados.tse.jus.br/oficial/ele2026/{6257|6259}/dados/ba/*-u.json` + IBGE malha/localidades); refresh by re-running the fetch script rather than live-fetching 2000+ TSE files per request (Worker subrequest limits).
- Leaflet is dynamic-imported inside useEffect in MapaBA so it never runs during SSR.
- Report PDFs are generated client-side through a lazy-loaded pdf-lib module using bundled Unicode fonts, report color tokens from global CSS, and a cropped CDN-hosted brand logo embedded on every page; this preserves accents, legible branding, and pagination without requiring server infrastructure.
- Report PDFs choose A4 portrait or landscape per table from estimated column width and may mix orientations; this keeps summaries compact while preserving wide-table readability.
- Bancadas uses an opt-in presentation on its existing table block for screen summaries and PDF sections; retaining the original rows preserves CSV and sorting without changing election calculations.
- Wide election tables use labeled mobile record cards below the small-screen breakpoint, while report cards retain filtering and sorting; this keeps phone layouts readable without losing data or changing exports.
- A chosen name in any large pick-list doubles as the search field (BuscaItem's `selecionado`): clicking or typing on it reopens the suggestions, so changing a choice never needs a clear button first.
- Indicator numbers and labels size themselves with their own box through container-query clamps instead of fixed text classes, because the same Stat renders in grids from 2 to 5 columns and fixed sizes either wrap a number mid-digit or overflow the cell.
- Cross-office comparisons present absolute votes and within-office percentages as separate readings, because raw totals alone are not comparable across contests with different valid-vote pools.
- Comparison reports live in the Relatórios catalog as exportable tables and keep each office's valid-vote denominator separate, so cross-office percentages remain meaningful.
- The indicators page derives its cards through a pure calculation module from the static snapshots, labels vote denominators and separates projected from official winners; this keeps statistics testable and avoids conflating Senate votes with voters.

- Urna/local-de-votação data is a separate static snapshot (public/data/secoes.json from scripts/gerar-secoes.py over TSE votacao_secao CSV) for a fixed list of municipalities, loaded optionally into the reports base; keeps existing reports independent of it and the file small.
