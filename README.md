# OSS Impact Dashboard

Static dashboard for open-source project operations, adoption signals, and impact reporting.

Python collects public and configured data into JSON. Vite serves a static site with Overview, Operations, Impact, and Report pages. No backend server or database required.

## What you can track

- **Overview** — stars, forks, open issues, releases, citation signals
- **Operations** — issue and PR velocity, contributor activity, CI health, repository traffic (with token)
- **Impact** — accomplishments, funding, risks, case studies, Zenodo and OpenAlex citations
- **Report** — printable PDF for funders and stakeholders
- **Settings** — integration health and source diagnostics

## Quick start

```bash
python -m pip install -e ".[dev]"
npm ci
cp projects/example.yml projects/my-project.yml   # edit repository field
bash scripts/dev-local.sh projects/my-project.yml
```

Open `http://127.0.0.1:5173/`. Run `npm run ci` before opening a pull request.

## Documentation

- [Getting started](docs/GETTING_STARTED.md) — configure, run, contribute, deploy
- [Architecture](docs/ARCHITECTURE.md) — system design for developers and AI tools

## License

GPL-3.0. See [LICENSE](LICENSE).
