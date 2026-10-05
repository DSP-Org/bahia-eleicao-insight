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
