"""STANDARD alignment contract for r2_outcome_marketplace_rather_than_labor_marketplac."""
import importlib.util, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
PROD = ROOT / "platform" / "products" / "r2_outcome_marketplace_rather_than_labor_marketplac"
def _load():
    p = PROD / "align.py"
    assert p.exists(), f"missing platform/products/r2_outcome_marketplace_rather_than_labor_marketplac/align.py"
    s = importlib.util.spec_from_file_location("align", p)
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
def test_product_dir_exists():
    assert PROD.is_dir() and any(PROD.iterdir()), "product directory empty"
def test_align_demo_ok():
    r = _load().demo()
    assert isinstance(r, dict) and r.get("ok") is True, f"demo not ok: {r}"
