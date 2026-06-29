# OSS Impact Dashboard

Static dashboard for open-source project operations, adoption signals, and growth reporting.

Python collects public and configured data into JSON. Vite serves a static site with six dashboard sections plus Settings and Report pages. No backend server or database required.

## What you can track

- **Overview** — action KPIs (triage, security, CI), backlog change, activity trend, open priorities
- **Operations** — issue/PR velocity, SLA metrics, backlog trends, filterable issue table
- **Reliability** — CI health, failed runs, security alerts, OpenSSF score, governance, engagement coverage
- **Community** — contributors, newcomers, commit velocity
- **Impact** — citations, Zenodo downloads, releases, package adoption, GitHub reach
- **Docs** — unified documentation analytics (GoatCounter and/or Read the Docs)
- **Report** — printable growth summary for stakeholders
- **Settings** — integration health and metric definitions

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
