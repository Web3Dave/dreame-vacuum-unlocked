#!/usr/bin/env python3
"""Build the Dreame Companion React UI to a static export.

Usage:  cd frontend && python3 build_ui.py

Rebuilds frontend/out/ from the Next.js app. The add-on image copies
frontend/out/ as static assets, so NO Node is needed in the Docker build or at
runtime. Does `npm install` (uses package-lock.json) + `npm run build`
(Next `output: 'export'`).

After a successful build, commit frontend/out/ and the changed source together.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")


def main() -> int:
    os.chdir(HERE)
    for cmd in (
        ["npm", "install"],
        ["npm", "run", "build"],
    ):
        print(">>", " ".join(cmd), flush=True)
        if subprocess.run(cmd).returncode != 0:
            print("BUILD FAILED", file=sys.stderr)
            return 1
    if not os.path.isfile(os.path.join(OUT, "index.html")):
        print("no out/index.html - did next export succeed?", file=sys.stderr)
        return 1
    print(f"\nOK: static export at {OUT}")
    print("Commit frontend/out/ + the changed source to ship the new UI.")
    return 0


if __name__ == "__main__":
    sys.exit(main())