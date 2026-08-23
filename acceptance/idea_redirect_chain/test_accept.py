"""FROZEN acceptance — idea_redirect_chain. Builder MUST NOT modify.
Contract: explain redirect chains structurally; loops detected, never hang."""
import importlib.util, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]

def _load():
    p = ROOT / "redirect_chain.py"
    assert p.exists(), "candidate must provide redirect_chain.py at repo root"
    spec = importlib.util.spec_from_file_location("rc", p)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod

class FakeResp:
    def __init__(self, status, location): self.status_code, self.headers = status, {"location": location}

class FakeSession:
    def __init__(self, chain): self.chain, self.calls = chain, 0
    def get(self, url, allow_redirects=False, timeout=10):
        i = self.calls; self.calls += 1
        if i >= len(self.chain): raise AssertionError("chased past declared chain")
        return FakeResp(*self.chain[i])

def test_explains_each_hop():
    m = _load()
    hops = m.explain_chain("http://a.example/", session=FakeSession([(301, "http://b.example/"), (302, "https://c.example/")]))
    assert len(hops) == 2 and hops[-1]["final"] is True and hops[0]["status"] == 301

def test_loop_detected():
    m = _load()
    out = m.explain_chain("http://loop.example/", session=FakeSession([(301, "http://loop.example/")] * 12), max_hops=10)
    assert out[-1].get("loop") is True
