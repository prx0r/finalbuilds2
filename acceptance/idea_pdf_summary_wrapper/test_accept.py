"""FROZEN acceptance — idea_pdf_summary_wrapper. Builder MUST NOT modify.
Contract: summarize_pdf(path_or_bytes) -> {"summary": str, "pages": int|None}
with explicit UNKNOWN handling; never fabricates page counts."""
import importlib.util, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
def _load():
    p = ROOT / "pdf_summary.py"
    assert p.exists(), "candidate must provide pdf_summary.py at repo root"
    s = importlib.util.spec_from_file_location("ps", p)
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m

def test_unparseable_is_unknown_not_crash():
    m = _load()
    r = m.summarize_pdf(b"not a pdf at all")
    assert r["summary"] == "" or r.get("status") == "UNKNOWN", "garbage input must degrade gracefully"

def test_empty_bytes_handled():
    m = _load()
    r = m.summarize_pdf(b"")
    assert isinstance(r, dict) and "summary" in r
