import sys
import types
from pathlib import Path

from oss_impact_dashboard.report_pdf import generate_pdf


def test_generate_pdf_waits_for_report_ready_and_writes_file(tmp_path: Path, monkeypatch):
    calls: list[tuple[str, object]] = []
    output = tmp_path / "latest.pdf"

    class FakePage:
        def goto(self, url, wait_until=None):
            calls.append(("goto", (url, wait_until)))

        def wait_for_selector(self, selector, timeout=None):
            calls.append(("wait_for_selector", (selector, timeout)))

        def pdf(self, path, format=None, print_background=None):
            calls.append(("pdf", (format, print_background)))
            Path(path).write_bytes(b"%PDF-1.4\n% test\n")

    class FakeBrowser:
        def new_page(self, viewport=None):
            calls.append(("new_page", viewport))
            return FakePage()

        def close(self):
            calls.append(("close", None))

    class FakeChromium:
        def launch(self):
            calls.append(("launch", None))
            return FakeBrowser()

    class FakePlaywright:
        chromium = FakeChromium()

    class FakeSyncPlaywright:
        def __enter__(self):
            return FakePlaywright()

        def __exit__(self, exc_type, exc, traceback):
            return False

    fake_sync_api = types.SimpleNamespace(sync_playwright=lambda: FakeSyncPlaywright())
    fake_playwright = types.SimpleNamespace(sync_api=fake_sync_api)
    monkeypatch.setitem(sys.modules, "playwright", fake_playwright)
    monkeypatch.setitem(sys.modules, "playwright.sync_api", fake_sync_api)

    generate_pdf("http://127.0.0.1:4173/demo/report.html", output)

    assert output.read_bytes().startswith(b"%PDF-1.4")
    assert ("wait_for_selector", ('body[data-report-ready="true"]', 15_000)) in calls
    assert ("pdf", ("Letter", True)) in calls
