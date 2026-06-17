from __future__ import annotations

import argparse
import json
from pathlib import Path

from oss_impact_dashboard.build_dataset import build_dataset
from oss_impact_dashboard.config import load_project_config


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_command(args: argparse.Namespace) -> int:
    config = load_project_config(args.project)
    data = build_dataset(config, manual_root=Path(args.manual_root))
    write_json(Path(args.output), data)
    print(f"Wrote {args.output} with {len(data.get('items', []))} items")
    return 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="oss-impact-dashboard")
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build", help="Collect public data and build dashboard JSON")
    build.add_argument("--project", required=True, help="Project YAML file")
    build.add_argument("--output", required=True, help="Output dashboard JSON")
    build.add_argument("--manual-root", default="manual", help="Manual evidence YAML directory")
    build.set_defaults(func=build_command)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

