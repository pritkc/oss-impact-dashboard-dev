from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from oss_impact_dashboard.build_dataset import build_dataset
from oss_impact_dashboard.collectors.github import github_token
from oss_impact_dashboard.collectors.goatcounter import (
    GoatCounterClient,
    GoatCounterConfigError,
    settings_from_env,
)
from oss_impact_dashboard.config import load_project_config, source_enabled, validate_project_path
from oss_impact_dashboard.snapshots import append_snapshot, load_snapshot_history, snapshot_record


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_command(args: argparse.Namespace) -> int:
    project = validate_project_path(args.project) if args.safe_project else args.project
    config = load_project_config(project)
    data = build_dataset(config, manual_root=Path(args.manual_root))
    write_json(Path(args.output), data)
    print(f"Wrote {args.output} with {len(data.get('items', []))} items")
    return 0


def validate_project_command(args: argparse.Namespace) -> int:
    path = validate_project_path(args.project)
    load_project_config(path)
    print(f"Project config valid: {args.project}")
    return 0


def project_info_command(args: argparse.Namespace) -> int:
    path = validate_project_path(args.project)
    config = load_project_config(path)
    if args.field == "snapshot_history":
        value = (
            (config.sources.get("snapshots") or {}).get("history_path")
            or "metrics-history.json"
        )
    elif args.field == "environment":
        value = config.environment
    elif args.field == "project_id":
        value = config.id
    else:
        raise ValueError(f"Unsupported project info field: {args.field}")
    print(value)
    return 0


def snapshot_append_command(args: argparse.Namespace) -> int:
    dataset = json.loads(Path(args.dataset).read_text(encoding="utf-8"))
    history = load_snapshot_history(args.history)
    branch = args.branch or os.environ.get("GITHUB_REF_NAME")
    next_history = append_snapshot(
        history,
        snapshot_record(dataset),
        branch=branch,
        protected_branch=args.protected_branch,
    )
    if not next_history.get("write_allowed", True):
        print(next_history["blocked_reason"])
        return 0
    write_json(Path(args.history), next_history)
    print(f"Wrote {args.history} with {len(next_history.get('snapshots', []))} snapshots")
    return 0


def _status_line(label: str, value: str) -> str:
    return f"{label}: {value}"


def doctor_command(args: argparse.Namespace) -> int:
    failures: list[str] = []
    try:
        project_path = validate_project_path(args.project)
        config = load_project_config(project_path)
        print(_status_line("Project config", "valid"))
    except Exception as exc:  # noqa: BLE001 - diagnostics should explain config failures.
        print(_status_line("Project config", "invalid"))
        print(str(exc))
        return 1

    token = github_token()
    print(_status_line("GitHub token", "configured" if token else "missing"))
    github_required = source_enabled(config, "github")
    traffic_required = source_enabled(config, "github_traffic")
    actions_required = source_enabled(config, "github_actions")
    print(_status_line("GitHub collection", "available" if github_required else "disabled"))
    traffic_state = (
        "available" if traffic_required and token else "error" if traffic_required else "disabled"
    )
    actions_state = (
        "available" if actions_required and token else "error" if actions_required else "disabled"
    )
    print(_status_line("GitHub traffic", traffic_state))
    print(_status_line("GitHub Actions", actions_state))
    if traffic_required and not token:
        failures.append("GitHub traffic requires a token")
    if actions_required and not token:
        failures.append("GitHub Actions requires a token")

    goatcounter_required = source_enabled(config, "documentation_analytics")
    try:
        settings = settings_from_env(require_api_key=False)
        print(_status_line("GoatCounter site URL", "valid" if settings else "invalid"))
        print(_status_line("GoatCounter tracked domain", "valid" if settings else "invalid"))
        api_key_configured = bool(os.environ.get("GOATCOUNTER_API_KEY"))
        print(
            _status_line(
                "GoatCounter API key",
                "configured" if api_key_configured else "missing",
            )
        )
        if goatcounter_required and (not settings or not api_key_configured):
            raise GoatCounterConfigError("GoatCounter configuration is incomplete")
        if goatcounter_required and settings and api_key_configured:
            client = GoatCounterClient(settings)
            client.get_json("/stats/total", {})
            print(_status_line("GoatCounter API", "available"))
        else:
            print(_status_line("GoatCounter API", "disabled"))
    except Exception as exc:  # noqa: BLE001 - diagnostics only prints sanitized messages.
        print(_status_line("GoatCounter API", "error"))
        if goatcounter_required:
            failures.append(str(exc))

    tracker_active = bool(
        os.environ.get("GOATCOUNTER_SITE_URL")
        and os.environ.get("GOATCOUNTER_TRACKED_DOMAIN")
    )
    print(_status_line("RTD tracker", "active" if tracker_active else "disabled"))
    return 1 if failures else 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="oss-impact-dashboard")
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build", help="Collect public data and build dashboard JSON")
    build.add_argument("--project", required=True, help="Project YAML file")
    build.add_argument("--output", required=True, help="Output dashboard JSON")
    build.add_argument("--manual-root", default="manual", help="Manual evidence YAML directory")
    build.add_argument(
        "--safe-project",
        action="store_true",
        help="Require --project to be inside projects/",
    )
    build.set_defaults(func=build_command)

    validate_project = sub.add_parser("validate-project", help="Validate project config path")
    validate_project.add_argument("--project", required=True, help="Project YAML file")
    validate_project.set_defaults(func=validate_project_command)

    project_info = sub.add_parser("project-info", help="Print safe project metadata")
    project_info.add_argument("--project", required=True, help="Project YAML file")
    project_info.add_argument(
        "--field",
        required=True,
        choices=["snapshot_history", "environment", "project_id"],
    )
    project_info.set_defaults(func=project_info_command)

    snapshot = sub.add_parser(
        "snapshot-append", help="Append cumulative metrics to snapshot history"
    )
    snapshot.add_argument("--dataset", required=True, help="Built dashboard JSON")
    snapshot.add_argument("--history", required=True, help="Snapshot history JSON")
    snapshot.add_argument("--branch", help="Current branch name; defaults to GITHUB_REF_NAME")
    snapshot.add_argument("--protected-branch", default="main")
    snapshot.set_defaults(func=snapshot_append_command)

    doctor = sub.add_parser(
        "doctor",
        help="Check integration configuration without printing secrets",
    )
    doctor.add_argument("--project", required=True, help="Project YAML file")
    doctor.set_defaults(func=doctor_command)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
