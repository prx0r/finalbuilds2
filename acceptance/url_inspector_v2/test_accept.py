"""STANDARD alignment contract — url_inspector_v2 (EDGE SITE shape)."""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]

def test_site_source_exists():
    assert (ROOT / "site" / "package.json").exists() or (ROOT / "site" / "src").exists(), \
        "Astro site must live under site/"

def test_worker_function_present():
    fn = ROOT / "site" / "functions" / "api" / "check.ts"
    assert fn.exists() or (ROOT/"site"/"functions").is_dir(), "CF Pages function /api/check required"

def test_discovery_files_in_public():
    pub = ROOT / "site" / "public"
    assert (pub / "llms.txt").exists(), "public/llms.txt required (agent discovery)"
    assert (pub / "robots.txt").exists(), "public/robots.txt required"
