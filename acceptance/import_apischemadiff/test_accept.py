"""FROZEN acceptance — import_apischemadiff. Builder MUST NOT modify.
Alignment contract for vendored teolzr/schema-diff:
- vendor snapshot preserved under platform/products/apischemadiff/vendor/
- align.py exposes demo() -> dict(ok=True) proving a breaking change is DETECTED
  by running the vendored library in-process against two tiny OpenAPI specs."""
import importlib.util, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROD = ROOT / "platform" / "products" / "apischemadiff"

def _load():
    p = PROD / "align.py"
    assert p.exists(), "missing align.py — see spec alignment contract"
    s = importlib.util.spec_from_file_location("align", p)
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m

def test_vendor_preserved():
    assert (PROD / "vendor").is_dir(), "vendored upstream snapshot missing"
    assert any(PROD.rglob("LICENSE*")), "upstream LICENSE must be kept"

def test_demo_detects_breaking_change():
    r = _load().demo()
    assert isinstance(r, dict) and r.get("ok") is True, f"demo failed: {r}"
    assert r.get("breaking_detected") is True, "must actually detect a breaking change"
