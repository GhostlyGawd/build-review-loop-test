#!/usr/bin/env python3
"""Deterministically validate build-review-loop run artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
SEVERITIES = {"critical", "high", "medium", "low"}
FINDING_FIELDS = {
    "id", "severity", "title", "evidence", "impact", "required_change", "acceptance_check"
}


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def read_json(path: Path, errors: list[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"missing: {path.as_posix()}")
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        errors.append(f"invalid JSON: {path.as_posix()}: {exc}")
    return None


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def valid_cost(value: Any) -> bool:
    return value is None or (isinstance(value, int) and not isinstance(value, bool) and value >= 0)


def nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_run(root: Path, errors: list[str]) -> dict[str, Any] | None:
    data = read_json(root / "run.json", errors)
    if not isinstance(data, dict):
        return None
    require(data.get("schema_version") == 1, "run.json: schema_version must be 1", errors)
    require(data.get("experimental") is True, "run.json: experimental must be true", errors)
    require(data.get("portability_claim") is False, "run.json: portability_claim must be false", errors)
    require(bool(HEX40.fullmatch(str(data.get("base_commit", "")))), "run.json: invalid base_commit", errors)
    require(bool(HEX64.fullmatch(str(data.get("builder_prompt_sha256", "")))), "run.json: invalid builder_prompt_sha256", errors)
    require(data.get("max_cycles") == 5, "run.json: max_cycles must be 5", errors)
    gates = data.get("public_gates")
    require(isinstance(gates, list) and bool(gates) and all(nonempty_string(x) for x in gates), "run.json: public_gates must be nonempty strings", errors)
    assignment = data.get("assignment")
    require(isinstance(assignment, dict), "run.json: assignment must be an object", errors)
    if isinstance(assignment, dict):
        require(assignment.get("performed_after_both_freezes") is True, "run.json: assignment must occur after both freezes", errors)
        require(assignment.get("method") == "sha256-seed-parity-v1", "run.json: invalid assignment method", errors)
        seed_hex = assignment.get("seed_hex")
        require(bool(HEX64.fullmatch(str(seed_hex or ""))), "run.json: invalid assignment seed_hex", errors)
        require(nonempty_string(assignment.get("X")), "run.json: assignment.X is required", errors)
        require(nonempty_string(assignment.get("Y")), "run.json: assignment.Y is required", errors)
        require(assignment.get("X") != assignment.get("Y"), "run.json: X and Y candidates must differ", errors)
        if bool(HEX64.fullmatch(str(seed_hex or ""))) and nonempty_string(assignment.get("X")) and nonempty_string(assignment.get("Y")) and assignment.get("X") != assignment.get("Y"):
            candidates = sorted([assignment["X"], assignment["Y"]])
            material = bytes.fromhex(seed_hex) + b"\0" + candidates[0].encode("utf-8") + b"\0" + candidates[1].encode("utf-8")
            parity = hashlib.sha256(material).digest()[0] & 1
            expected_x = candidates[parity]
            require(assignment["X"] == expected_x, "run.json: assignment does not match seed-parity mapping", errors)
    return data


def validate_finding(finding: Any, location: str, errors: list[str]) -> None:
    require(isinstance(finding, dict), f"{location}: finding must be an object", errors)
    if not isinstance(finding, dict):
        return
    for field in sorted(FINDING_FIELDS):
        require(nonempty_string(finding.get(field)), f"{location}: missing or empty {field}", errors)
    require(finding.get("severity") in SEVERITIES, f"{location}: invalid severity", errors)


def validate_arm(root: Path, label: str, run: dict[str, Any] | None, seen_workers: set[str], errors: list[str]) -> None:
    arm_root = root / "arms" / label
    arm = read_json(arm_root / "arm.json", errors)
    if not isinstance(arm, dict):
        return
    require(arm.get("label") == label, f"arms/{label}/arm.json: label mismatch", errors)
    assignment = run.get("assignment", {}) if isinstance(run, dict) else {}
    require(arm.get("candidate_id") == assignment.get(label), f"arms/{label}/arm.json: candidate mismatch", errors)
    require(arm.get("base_commit") == (run or {}).get("base_commit"), f"arms/{label}/arm.json: base mismatch", errors)
    require(arm.get("builder_prompt_sha256") == (run or {}).get("builder_prompt_sha256"), f"arms/{label}/arm.json: builder prompt mismatch", errors)
    require(arm.get("initial_frozen_before_assignment") is True, f"arms/{label}/arm.json: initial freeze must precede assignment", errors)
    for field in ("initial_snapshot", "final_snapshot"):
        require(nonempty_string(arm.get(field)), f"arms/{label}/arm.json: {field} is required", errors)
    require(valid_cost(arm.get("token_cost")), f"arms/{label}/arm.json: token_cost must be integer or null", errors)
    stop_reason = arm.get("stop_reason")
    require(stop_reason in {"zero_findings", "max_cycles"}, f"arms/{label}/arm.json: invalid stop_reason", errors)

    cycles_root = arm_root / "cycles"
    cycle_dirs = sorted((p for p in cycles_root.iterdir() if p.is_dir()), key=lambda p: p.name) if cycles_root.is_dir() else []
    require(bool(cycle_dirs), f"arms/{label}: at least one cycle is required", errors)
    expected_names = [f"{n:02d}" for n in range(1, len(cycle_dirs) + 1)]
    require([p.name for p in cycle_dirs] == expected_names, f"arms/{label}: cycles must be contiguous 01..N", errors)
    require(len(cycle_dirs) <= 5, f"arms/{label}: more than five cycles", errors)
    final_review_empty = False
    final_output_snapshot: str | None = arm.get("initial_snapshot")

    for number, cycle_dir in enumerate(cycle_dirs, 1):
        prefix = f"arms/{label}/cycles/{cycle_dir.name}"
        review = read_json(cycle_dir / "review.json", errors)
        if not isinstance(review, dict):
            continue
        require(review.get("cycle") == number, f"{prefix}/review.json: cycle mismatch", errors)
        require(review.get("context") == "current_snapshot_only", f"{prefix}/review.json: invalid context", errors)
        require(review.get("snapshot") == final_output_snapshot, f"{prefix}/review.json: snapshot chain mismatch", errors)
        require(valid_cost(review.get("token_cost")), f"{prefix}/review.json: token_cost must be integer or null", errors)
        reviewer = review.get("reviewer_instance_id")
        require(nonempty_string(reviewer), f"{prefix}/review.json: reviewer_instance_id required", errors)
        if nonempty_string(reviewer):
            require(reviewer not in seen_workers, f"{prefix}/review.json: worker instance reused", errors)
            seen_workers.add(reviewer)
        findings = review.get("findings")
        require(isinstance(findings, list), f"{prefix}/review.json: findings must be an array", errors)
        if not isinstance(findings, list):
            continue
        finding_ids: list[str] = []
        for index, finding in enumerate(findings):
            validate_finding(finding, f"{prefix}/review.json findings[{index}]", errors)
            if isinstance(finding, dict) and nonempty_string(finding.get("id")):
                finding_ids.append(finding["id"])
        require(len(finding_ids) == len(set(finding_ids)), f"{prefix}/review.json: duplicate finding IDs", errors)

        fix_path = cycle_dir / "fix.json"
        gates_path = cycle_dir / "public-gates.json"
        if not findings:
            final_review_empty = number == len(cycle_dirs)
            require(number == len(cycle_dirs), f"{prefix}: cycles exist after zero findings", errors)
            require(not fix_path.exists() and not gates_path.exists(), f"{prefix}: fix/gates forbidden after zero findings", errors)
            continue

        fix = read_json(fix_path, errors)
        gates = read_json(gates_path, errors)
        if isinstance(fix, dict):
            require(fix.get("cycle") == number, f"{prefix}/fix.json: cycle mismatch", errors)
            require(fix.get("context") == "current_findings_only", f"{prefix}/fix.json: invalid context", errors)
            require(fix.get("input_snapshot") == review.get("snapshot"), f"{prefix}/fix.json: input snapshot mismatch", errors)
            require(nonempty_string(fix.get("output_snapshot")), f"{prefix}/fix.json: output_snapshot required", errors)
            require(isinstance(fix.get("changed_paths"), list), f"{prefix}/fix.json: changed_paths must be an array", errors)
            addressed = fix.get("addressed_finding_ids")
            valid_addressed = isinstance(addressed, list) and all(nonempty_string(item) for item in addressed)
            require(valid_addressed and set(addressed) == set(finding_ids), f"{prefix}/fix.json: addressed IDs must match findings", errors)
            require(valid_cost(fix.get("token_cost")), f"{prefix}/fix.json: token_cost must be integer or null", errors)
            fixer = fix.get("fixer_instance_id")
            require(nonempty_string(fixer), f"{prefix}/fix.json: fixer_instance_id required", errors)
            if nonempty_string(fixer):
                require(fixer not in seen_workers, f"{prefix}/fix.json: worker instance reused", errors)
                seen_workers.add(fixer)
            final_output_snapshot = fix.get("output_snapshot")
        if isinstance(gates, dict):
            require(gates.get("cycle") == number, f"{prefix}/public-gates.json: cycle mismatch", errors)
            require(gates.get("snapshot") == final_output_snapshot, f"{prefix}/public-gates.json: snapshot mismatch", errors)
            require(valid_cost(gates.get("token_cost")), f"{prefix}/public-gates.json: token_cost must be integer or null", errors)
            tester = gates.get("tester_instance_id")
            require(nonempty_string(tester), f"{prefix}/public-gates.json: tester_instance_id required", errors)
            if nonempty_string(tester):
                require(tester not in seen_workers, f"{prefix}/public-gates.json: worker instance reused", errors)
                seen_workers.add(tester)
            results = gates.get("results")
            run_gates = (run or {}).get("public_gates", [])
            require(isinstance(results, list) and len(results) == len(run_gates), f"{prefix}/public-gates.json: one result per public gate required", errors)
            if isinstance(results, list):
                for index, result in enumerate(results):
                    location = f"{prefix}/public-gates.json results[{index}]"
                    require(isinstance(result, dict), f"{location}: result must be an object", errors)
                    if isinstance(result, dict):
                        expected = run_gates[index] if index < len(run_gates) else None
                        require(result.get("command") == expected, f"{location}: command differs from frozen gate", errors)
                        require(isinstance(result.get("exit_code"), int) and not isinstance(result.get("exit_code"), bool), f"{location}: exit_code must be integer", errors)
                        require(nonempty_string(result.get("output_digest")), f"{location}: output_digest required", errors)

    require(arm.get("final_snapshot") == final_output_snapshot, f"arms/{label}/arm.json: final snapshot mismatch", errors)
    if stop_reason == "zero_findings":
        require(final_review_empty, f"arms/{label}: zero_findings requires empty final review", errors)
        require(arm.get("convergence_verified") is True, f"arms/{label}: zero_findings requires convergence true", errors)
    if stop_reason == "max_cycles":
        require(len(cycle_dirs) == 5, f"arms/{label}: max_cycles requires five cycles", errors)
        require(not final_review_empty, f"arms/{label}: max_cycles requires findings in cycle 5", errors)
        require(arm.get("convergence_verified") is False, f"arms/{label}: max_cycles requires convergence false", errors)


def validate_evaluation(root: Path, seen_workers: set[str], errors: list[str]) -> None:
    data = read_json(root / "evaluation" / "blind.json", errors)
    if not isinstance(data, dict):
        return
    evaluator = data.get("evaluator_instance_id")
    require(nonempty_string(evaluator), "evaluation/blind.json: evaluator_instance_id required", errors)
    if nonempty_string(evaluator):
        require(evaluator not in seen_workers, "evaluation/blind.json: worker instance reused", errors)
    require(data.get("blind_labels") == ["X", "Y"], "evaluation/blind.json: blind_labels must be [X, Y]", errors)
    excluded = data.get("excluded_context")
    valid_excluded = isinstance(excluded, list) and all(isinstance(item, str) for item in excluded)
    require(valid_excluded and {"identities", "assignment", "history", "costs"}.issubset(set(excluded)), "evaluation/blind.json: incomplete excluded_context", errors)
    require(data.get("winner") in {"X", "Y", "tie"}, "evaluation/blind.json: invalid winner", errors)
    require(isinstance(data.get("rubric"), list) and bool(data.get("rubric")), "evaluation/blind.json: rubric required", errors)
    require(isinstance(data.get("evidence"), list) and bool(data.get("evidence")), "evaluation/blind.json: evidence required", errors)
    require(valid_cost(data.get("token_cost")), "evaluation/blind.json: token_cost must be integer or null", errors)


def validate_evidence(root: Path, errors: list[str]) -> None:
    path = root / "evidence.jsonl"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (FileNotFoundError, OSError, UnicodeError) as exc:
        errors.append(f"missing or unreadable evidence.jsonl: {exc}")
        return
    require(bool(lines), "evidence.jsonl: at least one event required", errors)
    previous: str | None = None
    for index, line in enumerate(lines, 1):
        location = f"evidence.jsonl line {index}"
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"{location}: invalid JSON: {exc}")
            continue
        require(isinstance(event, dict), f"{location}: event must be an object", errors)
        if not isinstance(event, dict):
            continue
        require(event.get("sequence") == index, f"{location}: sequence mismatch", errors)
        require(nonempty_string(event.get("kind")), f"{location}: kind required", errors)
        require("payload" in event, f"{location}: payload required", errors)
        require(event.get("previous_event_hash") == previous, f"{location}: previous_event_hash mismatch", errors)
        claimed = event.get("event_hash")
        unsigned = {key: value for key, value in event.items() if key != "event_hash"}
        actual = hashlib.sha256(canonical(unsigned)).hexdigest()
        require(claimed == actual, f"{location}: event_hash mismatch", errors)
        previous = claimed if isinstance(claimed, str) else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    args = parser.parse_args(argv)
    root = args.run_dir.resolve()
    errors: list[str] = []
    require(root.is_dir(), f"run directory does not exist: {root}", errors)
    if root.is_dir():
        run = validate_run(root, errors)
        seen_workers: set[str] = set()
        validate_arm(root, "X", run, seen_workers, errors)
        validate_arm(root, "Y", run, seen_workers, errors)
        validate_evaluation(root, seen_workers, errors)
        validate_evidence(root, errors)
    if errors:
        for error in sorted(errors):
            print(f"ERROR: {error}")
        return 1
    print("OK: build-review-loop artifacts are structurally valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
