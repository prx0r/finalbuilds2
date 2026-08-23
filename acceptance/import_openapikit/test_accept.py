"""FROZEN acceptance — import_openapikit. Builder MUST NOT modify.
Alignment contract for vendored frankie567/openapi-kit:
- vendor snapshot preserved; align.py demo() -> dict(ok=True) with a real diff."""
import importlib.util, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROD = ROOT / "platform" / "products" / "openapikit"

def _load():
    p = PROD / "align.py"
    assert p.exists(), "missing align.py — see spec alignment contract"
    s = importlib.util.spec_from_file_location("align", p)
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m

def test_vendor_preserved():
    assert (PROD / "vendor").is_dir()
    assert any(PROD.rglob("LICENSE*"))

def test_demo_diff_works():
    r = _load().demo()
    assert isinstance(r, dict) and r.get("ok") is True
    assert r.get("diff_found") is True
