"""STANDARD alignment contract for logs.cardinality_guard."""
import importlib.util, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
PROD = ROOT / "platform" / "products" / "logs.cardinality_guard"
def _load():
    p = PROD / "align.py"
    assert p.exists(), f"missing platform/products/logs.cardinality_guard/align.py"
    s = importlib.util.spec_from_file_location("align", p)
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
def test_product_dir_exists():
    assert PROD.is_dir() and any(PROD.iterdir()), "product directory empty"
def test_align_demo_ok():
    r = _load().demo()
    assert isinstance(r, dict) and r.get("ok") is True, f"demo not ok: {r}"
