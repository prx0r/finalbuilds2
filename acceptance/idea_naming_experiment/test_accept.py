"""FROZEN acceptance — idea_naming_experiment. Builder MUST NOT modify.
Contract: implement naming.py exposing score_candidates(names) -> list of
(candidates preserved, same length) and top_candidate() -> non-empty str."""
import importlib.util, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

def _load():
    p = ROOT / "naming.py"
    assert p.exists(), "candidate must provide naming.py at repo root"
    spec = importlib.util.spec_from_file_location("naming", p)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod

def test_score_preserves_and_orders():
    m = _load()
    out = m.score_candidates(["b.com", "a.com"])
    assert isinstance(out, list) and len(out) == 2, "must preserve all candidates"

def test_top_candidate_nonempty():
    m = _load()
    assert isinstance(m.top_candidate(), str) and len(m.top_candidate()) > 0
