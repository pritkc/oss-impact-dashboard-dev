# OSS Impact Dashboard — Deep Research Report

**Project:** MOLE (Mimetic Operators Library Enhanced) — `csrc-sdsu/mole`
**Dashboard Repository:** `oss-impact-dashboard-dev`
**Date:** 2026-06-22
**Author:** Prit Chakalasiya (contributor, dashboard builder)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [MOLE Project Context](#2-mole-project-context)
3. [Existing Dashboard — Current State Audit](#3-existing-dashboard--current-state-audit)
4. [External Research — OSS Health & Impact Metrics Landscape](#4-external-research--oss-health--impact-metrics-landscape)
5. [Gap Analysis — What the Dashboard Is Missing](#5-gap-analysis--what-the-dashboard-is-missing)
6. [Recommended New KPIs & Features](#6-recommended-new-kpis--features)
7. [Existing Features to Improve](#7-existing-features-to-improve)
8. [Existing Features to Retire](#8-existing-features-to-retire)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Appendix: Reference Projects & Sources](#10-appendix-reference-projects--sources)

---

## 1. Executive Summary

This report documents a deep research effort into the MOLE open-source ecosystem (OSE) at CSRC-SDSU, the existing OSS Impact Dashboard built for it, and the broader landscape of open-source project health metrics. The goal is to identify KPIs and features that can be integrated into the dashboard to help maintainers, the steering council, and funding agencies track development progress, identify gaps, and generate printable reports for federal funding applications (NSF POSE, CSSI, etc.).

**Key findings:**

- The existing dashboard already covers a strong baseline of operations, contributor, release, documentation, and citation metrics — comparable to early-stage CHAOSS implementations.
- **Major gaps** exist in: security posture (OpenSSF Scorecard), dependency freshness (Libyears), community standards compliance, organizational diversity, downstream package adoption (Spack/conda/PyPI), governance health, and DEI indicators.
- The dashboard's manual data layer (`funding.yml`, `case-studies.yml`) is almost entirely empty — this is the primary mechanism for federal funding report content and needs structured population.
- The MOLE project has a formal 4-pillar governance model with evaluation metrics explicitly called for in the "Evaluation and Growth Pillar" — the dashboard should directly serve that pillar.
- NSF solicitations (POSE, CSSI) require quantitative metrics with annual targets, sustainability plans, and community adoption evidence — the dashboard's PDF report is well-positioned to serve this but needs richer content.

---

## 2. MOLE Project Context

### 2.1 Project Overview

MOLE is a high-quality C++ & MATLAB/Octave library implementing high-order mimetic operators for solving PDEs. It is developed at the Computational Science Research Center (CSRC) at San Diego State University (SDSU).

- **Repository:** `github.com/csrc-sdsu/mole`
- **Language:** MATLAB (primary), C++ (secondary), Julia (emerging)
- **License:** GPL-3.0
- **Stars:** 39 | **Forks:** 83 | **Open Issues:** 41
- **Created:** April 2021
- **Latest Release:** v1.2.0 (May 2026)
- **JOSS Publication:** [doi.org/10.21105/joss.06288](https://doi.org/10.21105/joss.06288)
- **Zenodo DOI:** [10.5281/zenodo.20128874](https://doi.org/10.5281/zenodo.20128874)
- **Documentation:** [mole-docs.readthedocs.io](https://mole-docs.readthedocs.io)
- **MATLAB File Exchange:** [mathworks.com/matlabcentral/fileexchange/124870-mole](https://www.mathworks.com/matlabcentral/fileexchange/124870-mole)

### 2.2 Governance Structure

MOLE has a formal OSE governance model documented in `OSE_GOVERNANCE.md` and `OSE_ORGANIZATION.md`:

- **Steering Council** — stewards resources, makes binding decisions when consensus fails
- **4 Governance Circles:**
  1. Community Engagement
  2. Software Engineering
  3. Computational Sciences
  4. Mimetic Differences
- **4 Organizational Pillars:**
  1. Community Engagement
  2. Organization and Governance
  3. Sustainable Infrastructure
  4. **Evaluation and Growth** ← this is the pillar the dashboard directly serves

The Evaluation and Growth Pillar is defined as: *"implementation and management of a set of well-defined metrics and performance indicators that guarantee the sustainability and relevancy of the MOLE library and the OSE organization, their growth, their evolution and the library's adoption within third-party academic and commercial software projects."*

### 2.3 Leadership Team

- Prof. Jose Castillo (founder)
- Dr. Johnny Delgado Corbino (founder)
- Prof. Valeria Barra
- Dr. Jared Brzenski
- Dr. Tony Drummond
- Prof. Miguel Dumett
- Dr. Giulia Pagallo
- Prof. Chris Paolini

### 2.4 Release History

| Tag | Date | Notes |
|-----|------|-------|
| v1.0 | Aug 2024 | Initial tagged release |
| v1.1.0 | Aug 2025 | First major release with 173+ PRs merged |
| v1.2.0 | May 2026 | Major release with Julia bindings, C++ mimetic ops, scalar BCs |

### 2.5 Funding Context

MOLE is an academic scientific software project that relies on federal funding (NSF, DOE, etc.). The NSF POSE (Pathways to Enable Open-Source Ecosystems) solicitation explicitly requires:

- *"an actionable evaluation plan, along with metrics to assess and evaluate success"*
- *"quantitative metrics with targets identified for each year of the award"*
- *"Sustainability: Articulate clear sustainability goals... with respect to financial support mechanisms and strategies to sustain vibrant communities"*
- Annual project reports with *"publications, and other specific products and impacts of the project"*

The NSF CSSI (Cyberinfrastructure for Sustained Scientific Innovation) solicitation similarly requires:
- *"a list of tangible metrics to be used to measure the success of the project activities"*
- *"quantifiable evidence of the use, impact and sustainability"*
- *"quantitative metrics with targets identified for each year of the award"*

---

## 3. Existing Dashboard — Current State Audit

### 3.1 Architecture

The dashboard is a **static site** — no backend, database, or paid service required.

```
projects/*.yml → Python collectors → dashboard.json → Vite build → GitHub Pages
```

- **Backend:** Python collectors fetch data from public APIs, produce a single `dashboard.json`
- **Frontend:** Vanilla JS + Chart.js, served as static HTML via GitHub Pages
- **PDF Reports:** Playwright renders `report.html` to PDF
- **Deployment:** GitHub Actions → `gh-pages` branch

### 3.2 Current Data Sources

| Source | Collector | Status | What It Provides |
|--------|-----------|--------|-----------------|
| GitHub | `collectors/github.py` | Active | Issues, PRs, releases, contributors, labels, events, comments, reviews |
| GitHub Traffic | `collectors/github_traffic.py` | Active (token-gated) | Views, clones, popular paths, referrers |
| GitHub Actions | `collectors/github_actions.py` | Active (token-gated) | CI runs, success rate, duration, failed runs |
| GoatCounter | `collectors/goatcounter.py` | Active (API key) | Documentation visitors, page hits, searches, 404s |
| Read the Docs | `collectors/readthedocs.py` | Disabled in config | CSV fallback for docs analytics |
| Zenodo | `collectors/zenodo.py` | Active | Downloads, views, unique views/downloads, DOI metadata |
| OpenAlex | `collectors/openalex.py` | Active | Citation count, citations by year |
| Manual | `collectors/manual.py` | Active (empty) | Funding, case studies, maintainer capacity, risks, targets |
| Snapshots | `snapshots.py` | Active | Historical trend data for cumulative metrics |

### 3.3 Current KPIs Displayed

**Operations KPIs (Overview page):**
- Open issues count
- Open PRs count
- Untriaged items count
- Items open over threshold (stale days)
- Median issue close time (days)
- Median PR merge time (days)
- Median first response time (days)
- Median first review time (days)
- P90 first response time (days)
- PRs awaiting review
- Net backlog change
- Latest release age (days)

**Impact KPIs (Impact page):**
- Zenodo downloads
- Zenodo views
- Citation count (OpenAlex)
- Unique contributors
- Releases in period
- New contributors in period
- Release asset downloads
- Total releases

**Documentation KPIs:**
- Documentation visitors
- Search events
- No-result searches
- Documentation 404s
- Provider label
- Last docs collection date

**CI/Reliability KPIs (Report page):**
- Workflow runs total
- Success rate
- Median duration
- Recent failed runs

**Contributor KPIs:**
- Unique contributors
- Commit contributors
- New contributors in period
- Repeat contributors in period
- Top 3 contribution concentration

**Report Page Sections:**
- Executive KPI Summary
- Adoption and Downloads
- Documentation Reach
- Documentation Details (popular pages, missing paths, limitations)
- Development and Maintenance Activity
- Release Delivery
- Contributors and Community
- CI and Reliability
- Maintainer Capacity (manual)
- Technical Debt and Sustainability Risks (manual)
- Requested Work Packages (manual)
- Baseline to Target Outcomes (manual)
- Case Studies (manual)
- Methodology, Data Sources and Limitations

### 3.4 Current Strengths

1. **No-backend architecture** — trivially deployable, no ongoing server costs
2. **Source status transparency** — every data source shows available/unavailable/partial/error status
3. **Period comparisons** — current vs. previous period deltas for key metrics
4. **Snapshot history** — persistent trend tracking for cumulative metrics
5. **PDF report generation** — printable for funding applications
6. **Sandbox vs. production distinction** — development data is clearly marked
7. **PR preview deployments** — every PR gets a preview
8. **Metric definitions** — embedded in dataset for self-documentation
9. **Label metrics** — per-label breakdown of issues and PRs
10. **Engagement metrics** — first response time, first review time, awaiting review

### 3.5 Current Weaknesses

1. **Manual data layer is empty** — `funding.yml` and `case-studies.yml` have no content
2. **No security metrics** — OpenSSF Scorecard, vulnerability tracking, security policy status
3. **No dependency freshness metrics** — Libyears, outdated dependencies
4. **No community standards check** — CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md presence
5. **No organizational diversity** — contributor affiliation breakdown
6. **No downstream adoption tracking** — Spack recipes, conda-forge, PyPI, MATLAB File Exchange
7. **No governance health indicators** — steering council activity, circle participation
8. **No DEI metrics** — contributor demographics, geographic diversity
9. **No newcomer funnel** — time from first interaction to first merged PR
10. **No benchmark/performance tracking** — relevant for scientific software
11. **GitHub stars/forks/watchers not displayed** — basic adoption signals missing
12. **No social media / community discussion metrics**
13. **No email list / forum activity metrics**
14. **MATLAB File Exchange downloads not tracked** — a key adoption channel for MOLE
15. **Julia ecosystem (MOLE.jl) not separately tracked** — emerging language binding

---

## 4. External Research — OSS Health & Impact Metrics Landscape

### 4.1 CHAOSS (Community Health Analytics in Open Source Software)

CHAOSS is the gold standard for OSS health metrics, maintained by the Linux Foundation. Their metrics are organized into working groups:

**Common Metrics Working Group:**
- Time to First Response (issue/PR)
- Change Requests (PRs) Duration
- Change Request Closure Ratio
- Issue Resolution Duration
- Contributor Absence Factor (bus factor)
- Elephant Factor (min companies for 50% of commits)
- Libyears (dependency freshness)
- OSI Approved Licenses

**Diversity & Inclusion Working Group:**
- Organizational Diversity
- Project Demographics
- Inclusive Leadership
- Newcomer Experience
- New Contributors
- Project Burnout

**Evolution Working Group:**
- Code Commits
- Code Change Lines
- Issues Active/Closed/New
- Change Requests Active/Closed/New
- Reviews
- Bot Activity

**Risk Working Group:**
- Security Vulnerability Disclosure
- Dependency Vulnerability
- License Compliance
- Defect Resolution Duration
- Maintained Status

**Value Working Group:**
- Software Citation
- Downstream Impact
- Community Activity
- Project Popularity

### 4.2 CNCF DevStats

CNCF DevStats is the most comprehensive OSS project dashboard in production, tracking:
- PR reviews by contributor
- PR time to engagement
- Commit velocity
- Issue/PR lifecycle
- Company/organization affiliation
- Bot activity separation
- Geographic distribution (from GitHub profiles)
- Repository activity heatmaps
- Custom non-standard metrics

### 4.3 GitHub OSPO Health Metrics

GitHub's own Open Source Program Office recommends tracking:
- Community standards documents (CONTRIBUTING.md, CODE_OF_CONDUCT.md, LICENSE, README)
- Issue/PR activity and response times
- Release cadence (including point releases for security fixes)
- Time to first response (their internal guideline: 2 business days)
- Maintained status

### 4.4 OpenSSF Scorecard

OpenSSF Scorecard provides automated security health checks across 18+ checks in 3 themes:

**Holistic Security Practices:**
- Code Review
- Security Policy
- CII Best Practices Badge
- License
- Maintained
- Dangerous Workflow
- Fuzzing
- Packaging
- SAST (Static Application Security Testing)
- Token Permissions

**Source Code Risk:**
- Binary Artifacts
- Branch Protection
- Dangerous Workflow
- Pinned Dependencies
- SQL Injection
- Vulnerabilities

**Build Process:**
- CI Tests
- Dependency Update Tool
- Signed Releases
- Webhooks

Each check scores 0-10, with an aggregate weighted score. Results are publicly available via API for the top 1M projects.

### 4.5 CASS (Community for Open Source Scientific Software) Sustainability Metrics

CASS has developed a sustainability metrics framework specifically for scientific software, with three core dimensions:

**Adoption & Impact:**
- Citation counts & bibliometrics
- DOI resolutions & downloads
- Dependent package analysis
- HPC facility adoption
- Training material inclusion
- Field research references
- Community uptake signals (stars, forks)

**Sustainability (beyond OpenSSF):**
- Cross-platform testing
- Container availability
- Performance benchmarks
- Reproducibility indicators
- Portability (Spack, conda, E4S)

**Community Health:**
- Commit frequency
- Release history
- Issue response patterns
- Contributor diversity

### 4.6 LFX Insights (Linux Foundation)

LFX Insights tracks popularity metrics for LF projects:
- Stars, forks, watchers
- GitHub mentions (references in issues/PRs/READMEs)
- Search engine volume
- Package downloads (via ecosyste.ms API)
- Package dependencies (dependent repos, packages, Docker images)

### 4.7 NSF Federal Funding Requirements

From NSF POSE (NSF 24-606) and CSSI (NSF 22-632) solicitations:

**Required metrics categories:**
- Community adoption and usage (quantitative)
- Development methodology effectiveness
- Quality control processes
- Security and privacy of new content
- User support mechanisms
- New contributor onboarding
- Sustainability goals (financial and community)
- Annual targets for each metric
- Publications and products
- Organizational diversity

---

## 5. Gap Analysis — What the Dashboard Is Missing

### 5.1 Critical Gaps (High Priority for Federal Funding)

| Gap | Why It Matters | Data Source |
|-----|---------------|-------------|
| **Security posture (OpenSSF Scorecard)** | NSF requires security/privacy evidence; OpenSSF Scorecard is the industry standard | `api.scorecard.dev` public API |
| **Dependency freshness (Libyears)** | CHAOSS metric; outdated deps = 4x more likely to have security issues | GitHub dependency graph API or `renovate.json` |
| **Community standards compliance** | GitHub OSPO recommends; NSF requires governance documentation | GitHub GraphQL API (communityFiles) |
| **Downstream package adoption** | CASS framework; NSF requires "community adoption" evidence | Spack, conda-forge, PyPI, MATLAB File Exchange APIs |
| **GitHub stars/forks/watchers** | Basic adoption signal; LFX Insights tracks these; research shows correlation with practical usability | GitHub repository metadata (already fetched but not displayed) |
| **Annual metric targets** | NSF explicitly requires "targets identified for each year" | Manual YAML (extend `funding.yml`) |
| **Maintainer capacity populated** | NSF requires sustainability plan with financial support mechanisms | Manual YAML (needs real data) |

### 5.2 Important Gaps (Medium Priority)

| Gap | Why It Matters | Data Source |
|-----|---------------|-------------|
| **Contributor absence factor (bus factor)** | CHAOSS metric; key sustainability risk indicator | Derived from existing contributor data |
| **Elephant factor** | CHAOSS metric; organizational diversity proxy | Derived from contributor + affiliation data |
| **Organizational diversity** | CHAOSS D&I metric; NSF requires organizational diversity | GitHub user profiles (company field) or manual |
| **Newcomer funnel metrics** | CHAOSS; time from first interaction to first merged PR | Derived from existing issue/PR/event data |
| **Change request closure ratio** | CHAOSS; PR merged / PR closed ratio | Derived from existing PR data |
| **Defect resolution duration** | CHAOSS Risk; time from bug-labeled issue to close | Derived from existing issue + label data |
| **Release cadence consistency** | GitHub OSPO; regular releases indicate mature project | Derived from existing release data |
| **Geographic diversity** | CHAOSS D&I; indicates global reach | GitHub user location field (optional, privacy-sensitive) |
| **Governance health** | MOLE-specific; steering council and circle activity | Manual YAML (new file) |
| **MATLAB File Exchange metrics** | MOLE-specific; key adoption channel for MATLAB users | Mathworks API (if available) or manual |

### 5.3 Nice-to-Have Gaps (Low Priority)

| Gap | Why It Matters | Data Source |
|-----|---------------|-------------|
| **Social media mentions** | Community engagement signal | X/Twitter API, Mastodon (cost/complexity) |
| **Forum/mailing list activity** | Community engagement | Google Groups API, Discord API |
| **Conference/workshop presentations** | Academic impact evidence | Manual YAML |
| **Course adoption** | MOLE integrated into SDSU courses | Manual YAML |
| **Performance benchmarks over time** | Scientific software quality | CI artifacts or manual |
| **Reproducibility indicators** | CASS framework | Manual or CI |
| **Cross-platform test matrix** | CASS framework; MOLE supports Linux/macOS with multiple compilers | CI workflow data |
| **Julia ecosystem (MOLE.jl) metrics** | Emerging language binding | Separate GitHub repo or subdirectory tracking |

---

## 6. Recommended New KPIs & Features

### 6.1 New Automated KPIs (Fetchable from APIs)

#### 6.1.1 OpenSSF Scorecard Integration
**Priority: Critical**

Add a new collector `collectors/openssf_scorecard.py` that fetches from the public Scorecard API:
```
GET https://api.scorecard.dev/projects/github.com/{owner}/{repo}
```

**KPIs to surface:**
- Aggregate security score (0-10)
- Individual check scores: Code Review, Security Policy, Maintained, Vulnerabilities, Dependency Update Tool, Branch Protection, CI Tests, Signed Releases
- CII Best Practices Badge level (passing/silver/gold/in-progress/none)
- Trend over time (via snapshots)

**Dashboard placement:** New "Security" section on Overview page; dedicated subsection in PDF report.

#### 6.1.2 GitHub Repository Metadata (Stars, Forks, Watchers)
**Priority: Critical**

The GitHub collector already fetches repository metadata (`client.one(repo_path(...))`) but the dashboard does not display stars, forks, or watchers. These are already in the `github_raw["repository"]` object.

**KPIs to surface:**
- Star count (with trend via snapshots)
- Fork count
- Watcher count
- Subscriber count
- Network count (forks of forks)
- Open issue count (GitHub's count, vs. our computed count)

**Implementation:** Add to `summary` in `build_dataset.py`, add snapshot fields, add to KPI cards and report.

#### 6.1.3 Downstream Package Adoption
**Priority: Critical**

Add a new collector `collectors/package_adoption.py` that checks multiple package registries:

- **Spack:** Check if MOLE has a Spack recipe (`spack.io` or GitHub `spack/spack` repo `var/spack/repos/builtin/packages/mole`)
- **conda-forge:** Check conda-forge for MOLE packages
- **PyPI:** If Python bindings exist, check PyPI download stats via `pypistats.org` API
- **MATLAB File Exchange:** Track downloads/ratings from Mathworks (may require manual or scraping)
- **ecosyste.ms API:** `https://packages.ecosyste.ms/api/v1/packages/lookup?repository_url=https://github.com/csrc-sdsu/mole`

**KPIs to surface:**
- Package registry presence (boolean per registry)
- Download counts per registry (where available)
- Dependent package count
- Dependent repository count

#### 6.1.4 Community Standards Compliance
**Priority: High**

Use GitHub GraphQL API to check for presence of community health files:
```graphql
query {
  repository(owner: $owner, name: $repo) {
    contributingGuidelines { name }
    codeOfConduct { name }
    licenseInfo { name }
    readme { name }
    securityPolicy { name }
    issueTemplates { name }
    pullRequestTemplates { name }
  }
}
```

**KPIs to surface:**
- Community standards scorecard (checklist of present/absent files)
- Compliance percentage

#### 6.1.5 Dependency Freshness (Libyears)
**Priority: High**

Add a collector that parses dependency manifests (CMakeLists.txt, Project.toml for Julia, requirements.txt for docs) and compares installed versions against latest releases.

**KPIs to surface:**
- Total Libyears (cumulative age of dependencies vs. current releases)
- Outdated dependency count
- Most outdated dependencies list

**Note:** This may require a different approach for C++ projects (CMake doesn't have a central registry like npm/pip). Can use GitHub Dependabot alerts or `renovate` data if available.

### 6.2 New Derived KPIs (Computed from Existing Data)

#### 6.2.1 Contributor Absence Factor (Bus Factor)
**Priority: High**

The minimum number of contributors whose departure would leave the project unable to maintain itself. Computed as: the smallest set of contributors who account for >50% of recent commits/PRs.

**Implementation:** Extend `metrics/contributors.py` to compute from existing contributor data.

#### 6.2.2 Elephant Factor
**Priority: Medium**

The minimum number of organizations whose employees perform 50% of the commits. Requires organization affiliation data.

**Implementation:** Can be approximated from GitHub user profiles (company field) or manually maintained in config.

#### 6.2.3 Newcomer Funnel Metrics
**Priority: Medium**

- Time from first issue/PR to first merged PR (per contributor)
- New contributor → repeat contributor conversion rate
- New contributor retention (active after 3 months)

**Implementation:** Extend `metrics/contributors.py` with funnel analysis from existing event timeline data.

#### 6.2.4 Change Request Closure Ratio
**Priority: Medium**

PRs merged / (PRs merged + PRs closed without merge + PRs still open beyond threshold)

**Implementation:** Extend `metrics/operations.py`.

#### 6.2.5 Defect Resolution Duration
**Priority: Medium**

Time from issue creation (filtered by `bug` label) to close. Currently, median issue close time is computed across all issues; a bug-specific variant is more informative for quality assessment.

**Implementation:** Extend `metrics/operations.py` with label-filtered close time stats.

#### 6.2.6 Release Cadence Consistency
**Priority: Low**

Standard deviation of release intervals. A low value indicates predictable, sustainable release cadence.

**Implementation:** Extend `metrics/releases.py`.

### 6.3 New Manual Data Features

#### 6.3.1 Annual Metric Targets
**Priority: Critical**

Extend `manual/funding.yml` schema to support annual targets for each KPI:

```yaml
targets:
  - year: 2026
    metrics:
      - metric: unique_contributors
        baseline: 25
        target: 40
        expected_outcome: "Broader contributor base"
      - metric: median_issue_close_days
        baseline: 15
        target: 7
        expected_outcome: "Faster issue resolution"
      - metric: release_cadence_months
        baseline: 12
        target: 6
        expected_outcome: "More frequent releases"
```

This directly serves NSF's requirement for "quantitative metrics with targets identified for each year."

#### 6.3.2 Governance Health Tracker
**Priority: Medium**

New manual file `manual/governance.yml`:

```yaml
steering_council:
  active_members: 8
  meetings_per_year: 4
  last_meeting: "2026-05-15"
  decisions_this_period: 3

governance_circles:
  - name: Community Engagement
    active_members: 5
    last_activity: "2026-06-01"
  - name: Software Engineering
    active_members: 6
    last_activity: "2026-06-10"
  - name: Computational Sciences
    active_members: 4
    last_activity: "2026-04-20"
  - name: Mimetic Differences
    active_members: 3
    last_activity: "2026-03-15"

community_events:
  - event: "Annual MOLE Users Meeting"
    date: "2026-05-15"
    attendees: 45
  - event: "Workshop at SIAM CSE"
    date: "2026-03-01"
    attendees: 30
```

#### 6.3.3 Funding & Sustainability Tracker
**Priority: Critical**

Populate `manual/funding.yml` with real data:

```yaml
reporting_period: "2026"
accomplishments:
  - "Released MOLE v1.2.0 with Julia bindings and C++ mimetic operators"
  - "Published JOSS paper with 6+ citations"
  - "Established 4 governance circles and steering council"

maintainer_capacity:
  funded_hours: 40
  volunteer_hours: 20
  funding_sources:
    - source: "NSF POSE Phase II"
      amount: 500000
      period: "2025-2028"
      status: "pending"

risks:
  - risk: "Key contributor dependency on 2 developers"
    severity: high
    mitigation: "Onboarding new contributors through governance circles"
  - risk: "No Spack or conda-forge packaging"
    severity: medium
    mitigation: "Add Spack recipe in Q3 2026"

requested_work:
  - package: "Spack packaging"
    effort: "2 person-weeks"
    impact: "HPC facility adoption"
  - package: "Python bindings"
    effort: "3 person-months"
    impact: "Broader user community"
```

#### 6.3.4 Case Studies & Impact Evidence
**Priority: High**

Populate `manual/case-studies.yml`:

```yaml
case_studies:
  - title: "3D Viscoelastic Anisotropic Seismic Modeling"
    authors: "Ferrer, De La Puente, Farrés, Castillo"
    publication: "ICOSAHOM 2014"
    outcome: "Used MOLE mimetic operators for seismic modeling"
    doi: "10.1007/978-3-319-19800-2_18"
  - title: "MOLE in SDSU Graduate Course"
    course: "Computational Science 650"
    semester: "Fall 2025"
    students: 25
    outcome: "Students learned mimetic methods using MOLE"
```

### 6.4 New Dashboard UI Features

#### 6.4.1 Security Health Section
**Priority: Critical**

New section on the Overview page showing:
- OpenSSF Scorecard aggregate score (gauge chart)
- Individual check scores (bar chart or radar chart)
- CII Best Practices badge status
- Vulnerability count
- Security policy presence

#### 6.4.2 Adoption Matrix
**Priority: Critical**

New section on the Impact page showing:
- Package registry presence grid (Spack, conda-forge, PyPI, MATLAB File Exchange)
- Download counts per registry (where available)
- Dependent packages/repositories count
- GitHub stars/forks/watchers with trend

#### 6.4.3 Contributor Diversity Panel
**Priority: Medium**

New section on the Impact page showing:
- Bus factor number
- Elephant factor (if org data available)
- New vs. repeat contributor trend
- Newcomer funnel visualization
- Organizational diversity breakdown (if available)

#### 6.4.4 Governance Health Panel
**Priority: Medium**

New section on the Overview page showing:
- Steering council activity (last meeting, decisions count)
- Governance circle participation
- Community events log

#### 6.4.5 Annual Targets Progress Tracker
**Priority: Critical**

New section on the Report page showing:
- Current value vs. annual target for each KPI
- Progress bars or delta indicators
- Color-coded status (on-track / behind / exceeded)

#### 6.4.6 Community Standards Checklist
**Priority: High**

Visual checklist showing presence/absence of:
- README.md
- CONTRIBUTING.md
- CODE_OF_CONDUCT.md
- SECURITY.md
- LICENSE
- Issue templates
- PR template
- CITATION.cff
- .zenodo.json

#### 6.4.7 Enhanced PDF Report for Funding Applications
**Priority: Critical**

The PDF report should be restructured to align with NSF reporting requirements:
- **Section 1: Project Overview** (existing, enhance)
- **Section 2: Executive KPI Summary** (existing, add targets)
- **Section 3: Community Health** (new — combine contributor, engagement, governance)
- **Section 4: Security & Quality** (new — Scorecard, CI, standards)
- **Section 5: Adoption & Impact** (enhanced — add package registries, stars, citations)
- **Section 6: Development Activity** (existing, enhance)
- **Section 7: Sustainability** (new — maintainer capacity, funding, risks)
- **Section 8: Targets & Progress** (new — annual targets with current progress)
- **Section 9: Accomplishments** (existing, populate)
- **Section 10: Case Studies** (existing, populate)
- **Section 11: Methodology & Limitations** (existing, keep)

---

## 7. Existing Features to Improve

### 7.1 Manual Data Layer — Populate It
**Current state:** `funding.yml` and `case-studies.yml` are empty placeholders.
**Improvement:** Populate with real MOLE data (see Section 6.3). This is the single highest-impact improvement — the report page already renders this data, it just has nothing to show.

### 7.2 GitHub Stars/Forks/Watchers — Display Them
**Current state:** Repository metadata is fetched but stars/forks/watchers are not shown.
**Improvement:** Add to summary, KPI cards, and snapshot history. One-line changes in `build_dataset.py` and `app.js`.

### 7.3 Snapshot History — Add More Metrics
**Current state:** Snapshots track 10 cumulative metrics (traffic views, docs visitors, Zenodo downloads, citations).
**Improvement:** Add stars, forks, watchers, OpenSSF score, package downloads to snapshot records for trend tracking.

### 7.4 Contributor Metrics — Add Bus Factor
**Current state:** Contributor concentration (top 1/3/5 share) is computed but bus factor is not.
**Improvement:** Add bus factor computation to `contributors.py`. This is a derived metric from existing data — no new API calls needed.

### 7.5 Operations Metrics — Add Label-Specific Close Times
**Current state:** Median issue close time is computed across all issues.
**Improvement:** Add bug-specific and enhancement-specific median close times. The label data is already available.

### 7.6 Report Page — Add Target Progress
**Current state:** The "Baseline to Target Outcomes" section exists but has no data.
**Improvement:** Populate `funding.yml` targets and render progress bars showing current value vs. target.

### 7.7 Period Comparison — Add More Metrics
**Current state:** Period comparisons exist for operations and contributor metrics.
**Improvement:** Extend to releases, documentation analytics, and impact metrics for period-over-period trend analysis.

### 7.8 Documentation Analytics — Add Trend Visualization
**Current state:** Documentation visitor trends are stored in snapshots but not charted on the Impact page.
**Improvement:** Add a line chart showing documentation visitors over time using snapshot history.

### 7.9 CI/Reliability — Add Workflow-Specific Breakdown
**Current state:** CI metrics aggregate all workflow runs.
**Improvement:** Break down by workflow name (ci.yml vs. documentation build vs. other) to identify which workflows are failing.

### 7.10 Label Metrics — Add Label-Specific Aging
**Current state:** Label metrics show total/open/closed counts per label.
**Improvement:** Add median age of open items per label to identify which categories of issues are aging most.

---

## 8. Existing Features to Retire

### 8.1 Read the Docs CSV Fallback — Consider Deprecation
**Current state:** The RTD CSV fallback is a secondary data path used when GoatCounter is unavailable. It's disabled in the mole.yml config.
**Recommendation:** Keep the code but do not invest further in this path. GoatCounter is the primary analytics provider and is working. If RTD adds a proper analytics API in the future, migrate to that instead of maintaining CSV parsing.

### 8.2 `private_sources` Placeholder in Impact
**Current state:** `impact.py` returns `private_sources` with hardcoded "Access not configured" strings for `github_traffic` and `readthedocs`.
**Recommendation:** Remove this placeholder. The `source_status` object already tracks these sources' availability. The `private_sources` field adds no value and is not displayed in the UI.

### 8.3 `core_contributors: []` — Populate or Remove
**Current state:** `core_contributors` is configured as an empty list in `mole.yml`, which means `external_contributor_share` is always `None`.
**Recommendation:** Populate with the leadership team GitHub logins (see Section 2.3) to enable external vs. internal contributor analysis. If not ready to define core contributors, remove the field and its dependent metrics until it can be properly configured.

---

## 9. Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)

1. **Populate `funding.yml`** with real MOLE data (accomplishments, capacity, risks, targets)
2. **Populate `case-studies.yml`** with published research using MOLE
3. **Populate `core_contributors`** in `mole.yml` with leadership team logins
4. **Display stars/forks/watchers** — add to summary, KPI cards, and snapshots
5. **Remove `private_sources` placeholder** from `impact.py`
6. **Add bus factor** computation to `contributors.py`

### Phase 2: Security & Adoption (2-4 weeks)

7. **Add OpenSSF Scorecard collector** — new `collectors/openssf_scorecard.py`
8. **Add community standards check** — extend GitHub GraphQL queries
9. **Add package adoption collector** — new `collectors/package_adoption.py`
10. **Add Security section** to dashboard UI
11. **Add Adoption Matrix section** to dashboard UI
12. **Add community standards checklist** to dashboard UI

### Phase 3: Derived Metrics (2-3 weeks)

13. **Add newcomer funnel metrics** to `contributors.py`
14. **Add change request closure ratio** to `operations.py`
15. **Add defect resolution duration** (bug-labeled) to `operations.py`
16. **Add release cadence consistency** to `releases.py`
17. **Add label-specific aging** to `operations.py`
18. **Extend snapshot history** with new metrics

### Phase 4: Governance & Reporting (2-3 weeks)

19. **Add governance health tracker** — new `manual/governance.yml` schema and collector
20. **Add annual targets progress tracker** to report page
21. **Restructure PDF report** to align with NSF reporting requirements
22. **Add Governance Health panel** to dashboard UI
23. **Add Contributor Diversity panel** to dashboard UI
24. **Add Annual Targets Progress section** to report

### Phase 5: Advanced (Future)

25. **Add Libyears/dependency freshness** collector
26. **Add organizational diversity** (from GitHub profiles or manual)
27. **Add MATLAB File Exchange** metrics tracking
28. **Add Julia ecosystem (MOLE.jl)** separate tracking
29. **Add conference/workshop presentations** manual tracking
30. **Add performance benchmark** tracking from CI

---

## 10. Appendix: Reference Projects & Sources

### 10.1 OSS Health Metrics Frameworks

| Framework | Organization | URL |
|-----------|-------------|-----|
| CHAOSS Metrics | Linux Foundation | [chaoss.community/metrics](https://chaoss.community/metrics) |
| CHAOSS wg-common | CHAOSS | [github.com/chaoss/wg-common](https://github.com/chaoss/wg-common) |
| CHAOSS wg-diversity-inclusion | CHAOSS | [github.com/chaoss/wg-diversity-inclusion](https://github.com/chaoss/wg-diversity-inclusion) |
| CHAOSS wg-evolution | CHAOSS | [github.com/chaoss/wg-evolution](https://github.com/chaoss/wg-evolution) |
| CHAOSS wg-risk | CHAOSS | [github.com/chaoss/wg-risk](https://github.com/chaoss/wg-risk) |
| CHAOSS wg-value | CHAOSS | [github.com/chaoss/wg-value](https://github.com/chaoss/wg-value) |
| OpenSSF Scorecard | OpenSSF | [scorecard.dev](https://www.scorecard.dev/) |
| OpenSSF Best Practices Badge | OpenSSF | [bestpractices.dev](https://www.bestpractices.dev/) |
| CASS Sustainability Metrics | CASS | [cass.community](https://cass.community/) |

### 10.2 OSS Project Dashboards

| Project | Organization | URL |
|---------|-------------|-----|
| CNCF DevStats | CNCF | [github.com/cncf/devstats](https://github.com/cncf/devstats) |
| LFX Insights | Linux Foundation | [insights.linuxfoundation.org](https://insights.linuxfoundation.org/) |
| GitHub OSPO Metrics | GitHub | [github.com/github/github-ospo](https://github.com/github/github-ospo) |
| CORSA Dashboard | CASS | Referenced in CASS Sustainability Metrics Report |

### 10.3 Federal Funding Solicitations Referenced

| Solicitation | Agency | URL |
|-------------|--------|-----|
| NSF 24-606 POSE | NSF | [nsf.gov/funding/opportunities/pose](https://www.nsf.gov/funding/opportunities/pose-pathways-enable-open-source-ecosystems/nsf24-606/solicitation) |
| NSF 22-632 CSSI | NSF | [nsf.gov/funding/opportunities/cssi](https://www.nsf.gov/funding/opportunities/cssi-cyberinfrastructure-sustained-scientific-innovation/nsf22-632/solicitation) |
| NSF 17-526 SSE/SSI/S2I2 | NSF | [nsf.gov/solicitations/nsf17526](https://nsf-gov-resources.nsf.gov/solicitations/pubs/2017/nsf17526/nsf17526.pdf) |

### 10.4 Research Papers Referenced

- "Uncovering Scientific Software Sustainability through Community Engagement and Software Quality Metrics" — [arxiv.org/html/2511.07851](https://arxiv.org/html/2511.07851)
- "GitHub Statistics as a Measure of the Impact of Open-Source Bioinformatics Software" — [frontiersin.org](https://www.frontiersin.org/journals/bioengineering-and-bioinformatics/articles/10.3389/fbioe.2018.00198/full)
- "A Practical Guide to Measuring Project Sustainability" — CASS Community, Feb 2026
- Corbino, Dumett, Castillo (2024) "MOLE: Mimetic Operators Library Enhanced" — JOSS

### 10.5 MOLE Project Files Referenced

- `README.md` — Project overview, installation, citation
- `OSE_GOVERNANCE.md` — Governance model, voting, conflict resolution
- `OSE_ORGANIZATION.md` — 4-pillar structure, governance circles
- `COMMUNITY_ROLES.md` — Role definitions (leadership, contributors, collaborators, users)
- `PUBLICATIONS.md` — Publications using MOLE
- `CONTRIBUTING.md` — Contribution guidelines
- `CITATION.cff` — Citation metadata
- `.zenodo.json` — Zenodo metadata
- `MOLE_SW_DESIGN.md` — Software design document

### 10.6 Dashboard Codebase Files Audited

| File | Role |
|------|------|
| `src/oss_impact_dashboard/build_dataset.py` | Main dataset builder, orchestrates all collectors and metrics |
| `src/oss_impact_dashboard/config.py` | Project config loading and validation |
| `src/oss_impact_dashboard/schema.py` | Schema version, validation, utility functions |
| `src/oss_impact_dashboard/snapshots.py` | Snapshot history for trend tracking |
| `src/oss_impact_dashboard/cli.py` | CLI entry point |
| `src/oss_impact_dashboard/collectors/github.py` | GitHub API client and data fetcher |
| `src/oss_impact_dashboard/collectors/github_actions.py` | CI/CD workflow run metrics |
| `src/oss_impact_dashboard/collectors/github_traffic.py` | Repository traffic metrics |
| `src/oss_impact_dashboard/collectors/goatcounter.py` | Documentation analytics |
| `src/oss_impact_dashboard/collectors/readthedocs.py` | RTD CSV fallback |
| `src/oss_impact_dashboard/collectors/zenodo.py` | Zenodo record stats |
| `src/oss_impact_dashboard/collectors/openalex.py` | OpenAlex citation data |
| `src/oss_impact_dashboard/collectors/manual.py` | Manual YAML data loader |
| `src/oss_impact_dashboard/metrics/operations.py` | Issue/PR operations metrics |
| `src/oss_impact_dashboard/metrics/contributors.py` | Contributor metrics |
| `src/oss_impact_dashboard/metrics/releases.py` | Release metrics |
| `src/oss_impact_dashboard/metrics/impact.py` | Impact metrics (Zenodo, OpenAlex, manual) |
| `web/src/app.js` | Frontend application logic, KPI rendering, report generation |
| `web/src/registry.js` | Chart and KPI registry system |
| `projects/mole.yml` | MOLE project configuration |
| `manual/funding.yml` | Manual funding data (empty) |
| `manual/case-studies.yml` | Manual case studies (empty) |

---

*End of Report*
