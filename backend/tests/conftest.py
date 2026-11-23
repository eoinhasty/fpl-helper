import json
from pathlib import Path

TESTDATA = Path(__file__).resolve().parents[2] / "testdata"


def shared_cases(name: str):
    """Cases in the repo-root testdata/, which the frontend tests run too."""
    return json.loads((TESTDATA / name).read_text(encoding="utf-8"))
