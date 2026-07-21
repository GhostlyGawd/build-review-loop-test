#!/usr/bin/env python3
"""Generate and validate MANIFEST.sha256 from canonical Git blob bytes."""

from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
import sys
from pathlib import Path

HEADER = (
    "# Frozen SHA-256 manifest for build-review-loop skill v2 / public protocol 2.6.0-draft.\n"
    "# Hashes cover canonical Git blobs for attributes, skill sources, public fixtures, parity, and evidence.\n"
    "# Excluded: this manifest (to avoid self-reference), ignored bytecode, and unrelated repository files.\n"
)
ENTRY = re.compile(r"^([0-9a-f]{64})  ([^\\]+)$")


def git(repo: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", *args], cwd=repo, capture_output=True, check=False,
    )
    if result.returncode:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {message}")
    return result.stdout


def canonical_paths(repo: Path, source: str) -> list[str]:
    if source == "index":
        raw = git(repo, "ls-files", "-z")
    else:
        raw = git(repo, "ls-tree", "-r", "-z", "--name-only", source)
    paths = raw.decode("utf-8").split("\0")
    return sorted(
        path for path in paths
        if path and path != "MANIFEST.sha256" and
        (path == ".gitattributes" or path.startswith("skills/") or path.startswith("validation/"))
    )


def canonical_blob(repo: Path, path: str, source: str) -> bytes:
    spec = f":{path}" if source == "index" else f"{source}:{path}"
    return git(repo, "show", spec)


def render_manifest(repo: Path, source: str = "index") -> str:
    rows = [
        f"{hashlib.sha256(canonical_blob(repo, path, source)).hexdigest()}  {path}"
        for path in canonical_paths(repo, source)
    ]
    return HEADER + "\n".join(rows) + "\n"


def validate_manifest(repo: Path, source: str = "index") -> list[str]:
    path = repo / "MANIFEST.sha256"
    try:
        raw = path.read_bytes()
        text = raw.decode("utf-8")
    except (OSError, UnicodeError) as exc:
        return [f"manifest unreadable: {exc}"]
    errors: list[str] = []
    if b"\r" in raw:
        errors.append("manifest must use LF bytes")
    if not text.startswith(HEADER):
        errors.append("manifest header diverges")
    actual: dict[str, str] = {}
    for line in text.splitlines()[3:]:
        match = ENTRY.fullmatch(line)
        if not match:
            errors.append(f"malformed manifest entry: {line!r}")
            continue
        digest, name = match.groups()
        if name in actual:
            errors.append(f"duplicate manifest path: {name}")
        actual[name] = digest
    expected_paths = canonical_paths(repo, source)
    if list(actual) != expected_paths:
        errors.append("manifest path set or UTF-8 order diverges")
    for name in expected_paths:
        expected = hashlib.sha256(canonical_blob(repo, name, source)).hexdigest()
        if actual.get(name) != expected:
            errors.append(f"canonical Git blob hash mismatch: {name}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--source", default="index", help="index or a Git tree-ish such as HEAD")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    if args.write:
        (repo / "MANIFEST.sha256").write_bytes(render_manifest(repo, args.source).encode("utf-8"))
        print(f"wrote canonical manifest from {args.source}")
        return 0
    errors = validate_manifest(repo, args.source)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"OK: canonical manifest matches {args.source}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
