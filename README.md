# OSS Impact Dashboard

Static dashboard for open-source project operations, adoption signals, and growth reporting.

Python collects public and configured data into JSON. Vite serves a static site with Overview, Operations, Growth, and Report pages. No backend server or database required.

## What you can track

- **Overview** — open issues/PRs, backlog change, activity trend, open priorities
- **Operations** — issue and PR velocity, triage queues, CI health, security alerts
- **Growth** — citations, downloads, releases, contributors, docs reach, repository traffic
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
- [Growth refactor plan](docs/dashboard-growth-refactor-plan.md) — dashboard content reduction checklist

## License

GPL-3.0. See [LICENSE](LICENSE).
