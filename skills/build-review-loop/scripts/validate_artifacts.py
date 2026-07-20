#!/usr/bin/env python3
"""Deterministically validate build-review-loop schema-version-2 artifacts."""

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
ROLES = {"builder", "reviewer", "fixer", "tester", "evaluator", "unblinder", "git_worker"}
RUBRIC = {
    "functional_correctness": 50,
    "robustness_security": 15,
    "accessibility_usability": 15,
    "test_effectiveness": 10,
    "maintainability_documentation": 10,
}
SEMANTIC_SNAPSHOTS = {"baseline_final", "treatment_initial", "treatment_final"}
ASSIGNMENT_DOMAIN = b"build-review-loop-assignment-v2\x00"


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


def nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def valid_cost(value: Any) -> bool:
    return value is None or (isinstance(value, int) and not isinstance(value, bool) and value >= 0)


def valid_candidate_id(value: Any) -> bool:
    return nonempty_string(value) and "\x00" not in value


def candidate_assignment(seed_hex: str, candidate_ids: list[str]) -> tuple[list[str], str, str]:
    """Return sorted IDs, baseline, treatment using the frozen v2 algorithm."""
    encoded = sorted((candidate.encode("utf-8"), candidate) for candidate in candidate_ids)
    material = bytearray(ASSIGNMENT_DOMAIN)
    material.extend(bytes.fromhex(seed_hex))
    for raw, _ in encoded:
        material.extend(len(raw).to_bytes(8, "big"))
        material.extend(raw)
    index = hashlib.sha256(bytes(material)).digest()[0] & 1
    ordered = [candidate for _, candidate in encoded]
    return ordered, ordered[index], ordered[1 - index]


def add_worker(value: Any, location: str, seen: set[str], errors: list[str]) -> None:
    require(nonempty_string(value), f"{location}: worker instance ID required", errors)
    if nonempty_string(value):
        require(value not in seen, f"{location}: worker instance reused", errors)
        seen.add(value)


def validate_run(root: Path, errors: list[str]) -> dict[str, Any] | None:
    data = read_json(root / "run.json", errors)
    if not isinstance(data, dict):
        return None
    require(data.get("schema_version") == 2, "run.json: schema_version must be 2", errors)
    require(data.get("experimental") is True, "run.json: experimental must be true", errors)
    require(data.get("portability_claim") is False, "run.json: portability_claim must be false", errors)
    require(data.get("valid") is True, "run.json: completed comparison must be valid", errors)
    require(data.get("invalidation") is None, "run.json: completed comparison cannot be invalidated", errors)

    start = data.get("common_start")
    require(isinstance(start, dict), "run.json: common_start must be an object", errors)
    if isinstance(start, dict):
        require(bool(HEX40.fullmatch(str(start.get("commit", "")))), "run.json: invalid common_start.commit", errors)
        require(bool(HEX40.fullmatch(str(start.get("tree", "")))), "run.json: invalid common_start.tree", errors)
    for field in ("builder_prompt_sha256", "builder_config_sha256"):
        require(bool(HEX64.fullmatch(str(data.get(field, "")))), f"run.json: invalid {field}", errors)

    delegation = data.get("delegation")
    require(isinstance(delegation, dict), "run.json: delegation must be an object", errors)
    if isinstance(delegation, dict):
        require(delegation.get("root_role") == "orchestration_only", "run.json: root must be orchestration_only", errors)
        for role in ("implementation", "review", "fix", "test", "evaluation", "git"):
            require(delegation.get(role) is True, f"run.json: {role} must be delegated", errors)

    role_policy = data.get("role_policy")
    require(isinstance(role_policy, dict), "run.json: role_policy must be an object", errors)
    if isinstance(role_policy, dict):
        require(set(role_policy) == ROLES, "run.json: role_policy must freeze every required role", errors)
        for role in sorted(ROLES):
            policy = role_policy.get(role)
            location = f"run.json: role_policy.{role}"
            require(isinstance(policy, dict), f"{location} must be an object", errors)
            if isinstance(policy, dict):
                require("max_tokens" in policy, f"{location}.max_tokens must be present", errors)
                max_tokens = policy.get("max_tokens")
                reason = policy.get("max_tokens_unavailable_reason")
                if max_tokens is None:
                    require("max_tokens_unavailable_reason" in policy and nonempty_string(reason),
                            f"{location}.max_tokens_unavailable_reason required when max_tokens is null", errors)
                else:
                    require(positive_int(max_tokens), f"{location}.max_tokens must be positive or null", errors)
                    require(reason is None,
                            f"{location}.max_tokens_unavailable_reason must be null or absent when max_tokens is capped", errors)
                require(positive_int(policy.get("timeout_seconds")), f"{location}.timeout_seconds must be positive", errors)
                for field in ("environment_sha256", "model_settings_sha256"):
                    require(bool(HEX64.fullmatch(str(policy.get(field, "")))), f"{location}.{field} invalid", errors)

    for field in ("public_gates", "hidden_suites"):
        values = data.get(field)
        require(isinstance(values, list) and bool(values) and all(nonempty_string(x) for x in values),
                f"run.json: {field} must contain nonempty strings", errors)
        if isinstance(values, list):
            require(len(values) == len(set(x for x in values if isinstance(x, str))),
                    f"run.json: {field} entries must be unique", errors)
    require(data.get("max_treatment_cycles") == 5, "run.json: max_treatment_cycles must be 5", errors)

    assignment = data.get("assignment")
    require(isinstance(assignment, dict), "run.json: assignment must be an object", errors)
    if isinstance(assignment, dict):
        require(assignment.get("method") == "sha256-baseline-treatment-v2", "run.json: invalid assignment method", errors)
        require(assignment.get("seed_generated_after_both_freezes") is True,
                "run.json: assignment seed must be generated after both freezes", errors)
        seed = assignment.get("seed_hex")
        ids = assignment.get("sorted_candidate_ids")
        require(bool(HEX64.fullmatch(str(seed or ""))), "run.json: assignment seed must encode 32 bytes", errors)
        require(isinstance(ids, list) and len(ids) == 2 and all(valid_candidate_id(x) for x in ids),
                "run.json: assignment requires two valid candidate IDs", errors)
        if isinstance(ids, list) and len(ids) == 2:
            require(ids[0] != ids[1], "run.json: candidate IDs must differ", errors)
        require(positive_int(assignment.get("event_sequence")), "run.json: assignment event_sequence must be positive", errors)
        if bool(HEX64.fullmatch(str(seed or ""))) and isinstance(ids, list) and len(ids) == 2 and all(valid_candidate_id(x) for x in ids) and ids[0] != ids[1]:
            ordered, baseline, treatment = candidate_assignment(seed, ids)
            require(ids == ordered, "run.json: sorted_candidate_ids are not UTF-8 byte sorted", errors)
            require(assignment.get("baseline") == baseline, "run.json: baseline does not match assignment algorithm", errors)
            require(assignment.get("treatment") == treatment, "run.json: treatment does not match assignment algorithm", errors)
    return data


def validate_evidence(root: Path, errors: list[str]) -> dict[int, dict[str, Any]]:
    path = root / "evidence.jsonl"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (FileNotFoundError, OSError, UnicodeError) as exc:
        errors.append(f"missing or unreadable evidence.jsonl: {exc}")
        return {}
    require(bool(lines), "evidence.jsonl: at least one event required", errors)
    events: dict[int, dict[str, Any]] = {}
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
        actual = hashlib.sha256(canonical({key: value for key, value in event.items() if key != "event_hash"})).hexdigest()
        require(claimed == actual, f"{location}: event_hash mismatch", errors)
        if isinstance(event.get("sequence"), int):
            events[event["sequence"]] = event
        previous = claimed if isinstance(claimed, str) else None
    return events


def validate_builders(root: Path, run: dict[str, Any] | None, events: dict[int, dict[str, Any]],
                      seen: set[str], errors: list[str]) -> dict[str, dict[str, Any]]:
    attestations: dict[str, dict[str, Any]] = {}
    files = sorted((root / "builders").glob("*/attestation.json")) if (root / "builders").is_dir() else []
    require(len(files) == 2, "builders: exactly two attestations required", errors)
    assignment = run.get("assignment", {}) if isinstance(run, dict) else {}
    assignment_sequence = assignment.get("event_sequence")
    for path in files:
        attestation = read_json(path, errors)
        location = path.relative_to(root).as_posix()
        if not isinstance(attestation, dict):
            continue
        candidate = attestation.get("candidate_id")
        require(valid_candidate_id(candidate), f"{location}: invalid candidate_id", errors)
        if valid_candidate_id(candidate):
            require(candidate not in attestations, f"{location}: duplicate candidate_id", errors)
            attestations[candidate] = attestation
        add_worker(attestation.get("builder_instance_id"), location, seen, errors)
        require(attestation.get("skill_exposed") is False, f"{location}: skill_exposed must be false", errors)
        require(attestation.get("frozen") is True, f"{location}: frozen must be true", errors)
        require(nonempty_string(attestation.get("initial_snapshot")), f"{location}: initial_snapshot required", errors)
        require(attestation.get("common_start") == (run or {}).get("common_start"), f"{location}: common_start mismatch", errors)
        for field in ("builder_prompt_sha256", "builder_config_sha256"):
            require(attestation.get(field) == (run or {}).get(field), f"{location}: {field} mismatch", errors)
        require(valid_cost(attestation.get("token_cost")), f"{location}: token_cost must be integer or null", errors)
        sequence = attestation.get("freeze_event_sequence")
        require(positive_int(sequence), f"{location}: freeze_event_sequence must be positive", errors)
        if positive_int(sequence):
            event = events.get(sequence)
            require(isinstance(event, dict) and event.get("kind") == "builder_frozen", f"{location}: freeze event missing", errors)
            payload = event.get("payload") if isinstance(event, dict) else None
            require(isinstance(payload, dict) and payload.get("candidate_id") == candidate and
                    payload.get("snapshot") == attestation.get("initial_snapshot"), f"{location}: freeze event payload mismatch", errors)
            if positive_int(assignment_sequence):
                require(sequence < assignment_sequence, f"{location}: freeze must precede assignment", errors)
    expected = set(assignment.get("sorted_candidate_ids", [])) if isinstance(assignment, dict) else set()
    require(set(attestations) == expected, "builders: attestations must match assigned candidate IDs", errors)
    if positive_int(assignment_sequence):
        event = events.get(assignment_sequence)
        require(isinstance(event, dict) and event.get("kind") == "assignment", "run.json: assignment event missing", errors)
        payload = event.get("payload") if isinstance(event, dict) else None
        require(isinstance(payload, dict) and payload.get("baseline") == assignment.get("baseline") and
                payload.get("treatment") == assignment.get("treatment") and payload.get("seed_hex") == assignment.get("seed_hex"),
                "run.json: assignment event payload mismatch", errors)
    return attestations


def validate_finding(finding: Any, location: str, errors: list[str]) -> str | None:
    require(isinstance(finding, dict), f"{location}: finding must be an object", errors)
    if not isinstance(finding, dict):
        return None
    for field in sorted(FINDING_FIELDS):
        require(nonempty_string(finding.get(field)), f"{location}: missing or empty {field}", errors)
    require(finding.get("severity") in SEVERITIES, f"{location}: invalid severity", errors)
    return finding.get("id") if nonempty_string(finding.get("id")) else None


def validate_gate_results(results: Any, expected: list[str], location: str, key: str,
                          errors: list[str]) -> None:
    require(isinstance(results, list) and len(results) == len(expected),
            f"{location}: one result per frozen {key} required", errors)
    if not isinstance(results, list):
        return
    for index, result in enumerate(results):
        item = f"{location}[{index}]"
        require(isinstance(result, dict), f"{item}: result must be an object", errors)
        if isinstance(result, dict):
            require(result.get("command" if key == "public gate" else "suite") == expected[index],
                    f"{item}: differs from frozen {key}", errors)
            require(isinstance(result.get("exit_code"), int) and not isinstance(result.get("exit_code"), bool),
                    f"{item}: exit_code must be integer", errors)
            require(nonempty_string(result.get("output_digest")), f"{item}: output_digest required", errors)


def validate_arms(root: Path, run: dict[str, Any] | None, attestations: dict[str, dict[str, Any]],
                  seen: set[str], errors: list[str]) -> dict[str, dict[str, Any]]:
    arms: dict[str, dict[str, Any]] = {}
    assignment = run.get("assignment", {}) if isinstance(run, dict) else {}
    for role in ("baseline", "treatment"):
        path = root / "arms" / role / "arm.json"
        arm = read_json(path, errors)
        if not isinstance(arm, dict):
            continue
        arms[role] = arm
        location = f"arms/{role}/arm.json"
        candidate = assignment.get(role)
        attestation = attestations.get(candidate, {})
        require(arm.get("role") == role, f"{location}: role mismatch", errors)
        require(arm.get("candidate_id") == candidate, f"{location}: candidate mismatch", errors)
        require(arm.get("initial_snapshot") == attestation.get("initial_snapshot"), f"{location}: initial snapshot mismatch", errors)
        require(valid_cost(arm.get("token_cost")), f"{location}: token_cost must be integer or null", errors)

    baseline = arms.get("baseline")
    if isinstance(baseline, dict):
        require(baseline.get("final_snapshot") == baseline.get("initial_snapshot"), "arms/baseline: baseline must remain frozen", errors)
        require(baseline.get("cycle_count") == 0, "arms/baseline: cycle_count must be zero", errors)
        require(baseline.get("stop_reason") == "baseline_frozen", "arms/baseline: stop_reason must be baseline_frozen", errors)
        require(baseline.get("convergence_verified") is None, "arms/baseline: convergence_verified must be null", errors)
        require(not (root / "arms" / "baseline" / "cycles").exists(), "arms/baseline: cycles directory is forbidden", errors)

    treatment = arms.get("treatment")
    if not isinstance(treatment, dict):
        return arms
    cycles_root = root / "arms" / "treatment" / "cycles"
    entries = sorted(path for path in cycles_root.iterdir()) if cycles_root.is_dir() else []
    require(bool(entries), "arms/treatment: at least one cycle required", errors)
    require(all(path.is_dir() and re.fullmatch(r"0[1-5]", path.name) for path in entries),
            "arms/treatment: cycle directories must be 01 through 05", errors)
    numbered = [int(path.name) for path in entries if path.is_dir() and re.fullmatch(r"0[1-5]", path.name)]
    require(numbered == list(range(1, len(numbered) + 1)), "arms/treatment: cycles must be contiguous from 1", errors)
    require(treatment.get("cycle_count") == len(numbered), "arms/treatment: cycle_count mismatch", errors)

    current = treatment.get("initial_snapshot")
    final_review_empty = False
    public_gates = (run or {}).get("public_gates", [])
    for number in numbered:
        prefix = f"arms/treatment/cycles/{number:02d}"
        cycle_root = cycles_root / f"{number:02d}"
        review = read_json(cycle_root / "review.json", errors)
        if not isinstance(review, dict):
            continue
        require(review.get("cycle") == number, f"{prefix}/review.json: cycle mismatch", errors)
        add_worker(review.get("reviewer_instance_id"), f"{prefix}/review.json", seen, errors)
        require(review.get("context") == "current_snapshot_only", f"{prefix}/review.json: context mismatch", errors)
        require(review.get("snapshot") == current, f"{prefix}/review.json: snapshot flow mismatch", errors)
        require(valid_cost(review.get("token_cost")), f"{prefix}/review.json: token_cost must be integer or null", errors)
        findings = review.get("findings")
        require(isinstance(findings, list), f"{prefix}/review.json: findings must be a list", errors)
        finding_ids = [validate_finding(finding, f"{prefix}/review.json findings[{index}]", errors)
                       for index, finding in enumerate(findings)] if isinstance(findings, list) else []
        require(len([item for item in finding_ids if item is not None]) == len(set(item for item in finding_ids if item is not None)),
                f"{prefix}/review.json: finding IDs must be unique", errors)
        if not findings:
            final_review_empty = True
            require(number == numbered[-1], f"{prefix}: empty review must be final", errors)
            require(not (cycle_root / "fix.json").exists(), f"{prefix}: fix forbidden after empty review", errors)
            require(not (cycle_root / "public-gates.json").exists(), f"{prefix}: gates forbidden after empty review", errors)
            continue

        final_review_empty = False
        fix = read_json(cycle_root / "fix.json", errors)
        gates = read_json(cycle_root / "public-gates.json", errors)
        output_snapshot = None
        if isinstance(fix, dict):
            require(fix.get("cycle") == number, f"{prefix}/fix.json: cycle mismatch", errors)
            add_worker(fix.get("fixer_instance_id"), f"{prefix}/fix.json", seen, errors)
            require(fix.get("context") == "current_findings_only", f"{prefix}/fix.json: context mismatch", errors)
            require(fix.get("input_snapshot") == current, f"{prefix}/fix.json: input snapshot mismatch", errors)
            require(nonempty_string(fix.get("output_snapshot")), f"{prefix}/fix.json: output snapshot required", errors)
            require(fix.get("output_snapshot") != current, f"{prefix}/fix.json: output must be a new snapshot", errors)
            require(fix.get("addressed_finding_ids") == finding_ids, f"{prefix}/fix.json: must address all current findings in order", errors)
            require(isinstance(fix.get("changed_paths"), list) and bool(fix.get("changed_paths")) and
                    all(nonempty_string(path) for path in fix.get("changed_paths", [])),
                    f"{prefix}/fix.json: changed_paths required", errors)
            require(valid_cost(fix.get("token_cost")), f"{prefix}/fix.json: token_cost must be integer or null", errors)
            output_snapshot = fix.get("output_snapshot")
        if isinstance(gates, dict):
            require(gates.get("cycle") == number, f"{prefix}/public-gates.json: cycle mismatch", errors)
            add_worker(gates.get("tester_instance_id"), f"{prefix}/public-gates.json", seen, errors)
            require(gates.get("snapshot") == output_snapshot, f"{prefix}/public-gates.json: snapshot mismatch", errors)
            require(valid_cost(gates.get("token_cost")), f"{prefix}/public-gates.json: token_cost must be integer or null", errors)
            validate_gate_results(gates.get("results"), public_gates, f"{prefix}/public-gates.json results", "public gate", errors)
        current = output_snapshot

    require(treatment.get("final_snapshot") == current, "arms/treatment: final snapshot mismatch", errors)
    reason = treatment.get("stop_reason")
    require(reason in {"zero_findings", "max_cycles"}, "arms/treatment: invalid stop_reason", errors)
    if reason == "zero_findings":
        require(final_review_empty, "arms/treatment: zero_findings requires a fresh empty final review", errors)
        require(treatment.get("convergence_verified") is True, "arms/treatment: zero_findings requires convergence true", errors)
    if reason == "max_cycles":
        require(numbered == [1, 2, 3, 4, 5], "arms/treatment: max_cycles requires five cycles", errors)
        require(not final_review_empty, "arms/treatment: max_cycles requires cycle-5 findings and fix", errors)
        require(treatment.get("convergence_verified") is False, "arms/treatment: max_cycles convergence must be false", errors)
    return arms


def validate_evaluation(root: Path, run: dict[str, Any] | None, arms: dict[str, dict[str, Any]],
                        seen: set[str], errors: list[str]) -> None:
    mapping = read_json(root / "evaluation" / "package-map.json", errors)
    blind = read_json(root / "evaluation" / "blind.json", errors)
    unblinded = read_json(root / "evaluation" / "unblinded.json", errors)
    if not isinstance(mapping, dict) or not isinstance(blind, dict) or not isinstance(unblinded, dict):
        return
    require(mapping.get("sealed_from_evaluator") is True, "evaluation/package-map.json: must be sealed", errors)
    require(mapping.get("randomization_method") == "system_csprng_shuffle_v1",
            "evaluation/package-map.json: CSPRNG randomization method required", errors)
    require(bool(HEX64.fullmatch(str(mapping.get("randomization_record_sha256", "")))),
            "evaluation/package-map.json: randomization record digest required", errors)
    packages = mapping.get("packages")
    require(isinstance(packages, dict) and set(packages) == {"X", "Y", "Z"},
            "evaluation/package-map.json: packages must be X/Y/Z", errors)
    expected_snapshots = {
        "baseline_final": arms.get("baseline", {}).get("final_snapshot"),
        "treatment_initial": arms.get("treatment", {}).get("initial_snapshot"),
        "treatment_final": arms.get("treatment", {}).get("final_snapshot"),
    }
    direct_mapping: dict[str, str] = {}
    if isinstance(packages, dict):
        for label in ("X", "Y", "Z"):
            package = packages.get(label)
            require(isinstance(package, dict), f"evaluation/package-map.json: {label} must be an object", errors)
            if isinstance(package, dict):
                source = package.get("source")
                direct_mapping[label] = source
                require(source in SEMANTIC_SNAPSHOTS, f"evaluation/package-map.json: invalid {label} source", errors)
                require(package.get("snapshot") == expected_snapshots.get(source),
                        f"evaluation/package-map.json: {label} snapshot mismatch", errors)
        require(set(direct_mapping.values()) == SEMANTIC_SNAPSHOTS,
                "evaluation/package-map.json: semantic snapshots must be bijective", errors)

    add_worker(blind.get("evaluator_instance_id"), "evaluation/blind.json", seen, errors)
    require(blind.get("blind_labels") == ["X", "Y", "Z"], "evaluation/blind.json: blind_labels must be X/Y/Z", errors)
    require(blind.get("history_free") is True, "evaluation/blind.json: evaluator must be history-free", errors)
    excluded = blind.get("excluded_context")
    required_excluded = {"identities", "assignment", "mapping", "history", "costs"}
    require(isinstance(excluded, list) and all(isinstance(item, str) for item in excluded) and
            required_excluded.issubset(set(excluded)), "evaluation/blind.json: incomplete excluded_context", errors)
    require(valid_cost(blind.get("token_cost")), "evaluation/blind.json: token_cost must be integer or null", errors)
    suite_results = blind.get("suite_results")
    scores = blind.get("scores")
    require(isinstance(suite_results, dict) and set(suite_results) == {"X", "Y", "Z"},
            "evaluation/blind.json: suite_results must cover X/Y/Z", errors)
    require(isinstance(scores, dict) and set(scores) == {"X", "Y", "Z"},
            "evaluation/blind.json: scores must cover X/Y/Z", errors)
    totals_by_label: dict[str, int] = {}
    for label in ("X", "Y", "Z"):
        results = suite_results.get(label) if isinstance(suite_results, dict) else None
        require(isinstance(results, dict), f"evaluation/blind.json: {label} suite results required", errors)
        if isinstance(results, dict):
            validate_gate_results(results.get("public"), (run or {}).get("public_gates", []),
                                  f"evaluation/blind.json {label}.public", "public gate", errors)
            validate_gate_results(results.get("hidden"), (run or {}).get("hidden_suites", []),
                                  f"evaluation/blind.json {label}.hidden", "hidden suite", errors)
        score = scores.get(label) if isinstance(scores, dict) else None
        require(isinstance(score, dict), f"evaluation/blind.json: {label} score required", errors)
        if not isinstance(score, dict):
            continue
        dimensions = score.get("dimensions")
        require(isinstance(dimensions, dict) and set(dimensions) == set(RUBRIC),
                f"evaluation/blind.json: {label} rubric dimensions mismatch", errors)
        total = 0
        if isinstance(dimensions, dict):
            for name, weight in RUBRIC.items():
                dimension = dimensions.get(name)
                require(isinstance(dimension, dict), f"evaluation/blind.json: {label}.{name} required", errors)
                if isinstance(dimension, dict):
                    value = dimension.get("score")
                    require(dimension.get("weight") == weight,
                            f"evaluation/blind.json: {label}.{name} weight must be {weight}", errors)
                    require(isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= weight,
                            f"evaluation/blind.json: {label}.{name} score out of range", errors)
                    require(nonempty_string(dimension.get("evidence")),
                            f"evaluation/blind.json: {label}.{name} evidence required", errors)
                    if isinstance(value, int) and not isinstance(value, bool):
                        total += value
        require(score.get("total") == total, f"evaluation/blind.json: {label} total mismatch", errors)
        totals_by_label[label] = total

    add_worker(unblinded.get("unblinder_instance_id"), "evaluation/unblinded.json", seen, errors)
    require(unblinded.get("scores_unchanged") is True, "evaluation/unblinded.json: scores_unchanged must be true", errors)
    require(unblinded.get("package_mapping") == direct_mapping,
            "evaluation/unblinded.json: package mapping differs from sealed map", errors)
    semantic_totals = unblinded.get("totals")
    expected_totals = {semantic: totals_by_label.get(label) for label, semantic in direct_mapping.items()}
    require(semantic_totals == expected_totals, "evaluation/unblinded.json: semantic totals mismatch", errors)
    if isinstance(semantic_totals, dict) and all(isinstance(semantic_totals.get(key), int) for key in SEMANTIC_SNAPSHOTS):
        primary = semantic_totals["treatment_final"] - semantic_totals["baseline_final"]
        secondary = semantic_totals["treatment_final"] - semantic_totals["treatment_initial"]
        require(unblinded.get("primary_delta") == primary, "evaluation/unblinded.json: primary_delta mismatch", errors)
        require(unblinded.get("secondary_delta") == secondary, "evaluation/unblinded.json: secondary_delta mismatch", errors)
    require(valid_cost(unblinded.get("token_cost")), "evaluation/unblinded.json: token_cost must be integer or null", errors)


def validate(root: Path) -> list[str]:
    errors: list[str] = []
    require(root.is_dir(), f"run directory does not exist: {root}", errors)
    if not root.is_dir():
        return errors
    run = validate_run(root, errors)
    events = validate_evidence(root, errors)
    seen: set[str] = set()
    attestations = validate_builders(root, run, events, seen, errors)
    arms = validate_arms(root, run, attestations, seen, errors)
    validate_evaluation(root, run, arms, seen, errors)
    return sorted(errors)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    args = parser.parse_args(argv)
    errors = validate(args.run_dir.resolve())
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("OK: build-review-loop schema-version-2 artifacts are structurally valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
