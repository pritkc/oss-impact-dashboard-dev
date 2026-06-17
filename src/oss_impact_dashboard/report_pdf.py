from __future__ import annotations

import argparse
from pathlib import Path


def generate_pdf(url: str, output: Path) -> None:
    from playwright.sync_api import sync_playwright

    output.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 1600})
        page.goto(url, wait_until="networkidle")
        page.pdf(path=str(output), format="Letter", print_background=True)
        browser.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate report PDF from report.html")
    parser.add_argument("--url", default="http://127.0.0.1:5173/report.html")
    parser.add_argument("--output", default="reports/latest.pdf")
    args = parser.parse_args(argv)
    generate_pdf(args.url, Path(args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

