"""FROZEN acceptance — idea_domain_intelligence. Builder MUST NOT modify.
Contract: naming/domain candidates with deterministic normalization + explicit
UNKNOWN for unverifiable facts (never fabricated availability)."""
import importlib.util, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]

def _load():
    p = ROOT / "domain_intelligence.py"
    assert p.exists(), "candidate must provide domain_intelligence.py at repo root"
    spec = importlib.util.spec_from_file_location("di", p)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod

def test_normalize_is_deterministic():
    m = _load()
    a = m.normalize_candidates(["  Example.COM ", "example.com"])
    b = m.normalize_candidates(["Example.COM", "example.com"])
    assert [x["name"] for x in a] == ["example.com", "example.com"]
    assert a == b, "normalization must be deterministic"

def test_unknown_not_fabricated():
    m = _load()
    r = m.availability("this-domain-cannot-be-checked-xyz123.com", provider=None)
    assert r["status"] in ("UNKNOWN", "UNAVAILABLE"), "no provider -> UNKNOWN/UNAVAILABLE, never AVAILABLE"
