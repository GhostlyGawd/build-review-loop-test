#!/usr/bin/env python3
"""Validate public protocol-v2 integrated run artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

SKILL_ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = SKILL_ROOT / "references" / "canonical-contract.json"
GOLDEN_PATH = SKILL_ROOT / "tests" / "fixtures" / "golden-run.json"
INVALID_PATH = SKILL_ROOT / "tests" / "fixtures" / "invalid-current.json"
CONTRACT_CANONICAL_SHA256 = "05a869d36aca6c9c146c56fa8f6432438d5c7e2c87fd944f822f660747e0d6f5"
GOLDEN_CANONICAL_SHA256 = "e53d8ecffdd1717e369acf312b2ba649726c511d7d31b1a58346cf734b7ffc69"
INVALID_CANONICAL_SHA256 = "2911016d16fca74949d93f1b9488d0d09013ac4658f412d3b8d4789e2f7969ff"
CONTRACT_RAW_SHA256 = "199eb11d2350ee002c6e8811996c5c5368ec01dce9614df45d7118d328667d3f"
GOLDEN_RAW_SHA256 = "fa17e10644d5d5d2958b040e4aca30348d3be737570a30f54aee985bb95f7869"
INVALID_RAW_SHA256 = "ee2583b65c2961121cd2ac2fdb81657ace1de826a8bd71b7df62e48a05cd2db3"
BUILDER_PROMPT_SHA256 = "7aa6ed9b0583ea2d5e555f26a354b2a9887851b2ded6e1930ec00772376e7b82"
BUILDER_CONFIG_SHA256 = "caf42a587e56b1b9ffcacf29047fbc69e80cba52188d6f4363a489ec84a5b40b"
LOCK_PROMPT_SHA256 = "7aa6ed9b0583ea2d5e555f26a354b2a9887851b2ded6e1930ec00772376e7b82"
LOCK_CONFIG_SHA256 = "caf42a587e56b1b9ffcacf29047fbc69e80cba52188d6f4363a489ec84a5b40b"
CANONICAL_DOMAIN = b"permissions-playground/canonical-json-v1\0"
ASSIGNMENT_DOMAIN = b"build-review-loop-assignment-v2\0"
EVALUATION_DOMAIN = "permissions-playground/protocol-v2/evaluation\n"
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
FINDING_ID = re.compile(r"^cycle-[1-5]-reviewer-[0-9]{2}$")
SENTINEL = re.compile(r"required-at-run|template-|placeholder|sentinel", re.IGNORECASE)
FINDING_FIELDS = (
    "id", "severity", "title", "evidence", "expected", "actual",
    "rubricItems", "verification", "duplicateOf",
)
SEVERITIES = {"critical", "high", "medium", "low"}
RUBRIC = (
    ("A1", 6, (0, 3, 6)), ("A2", 8, (0, 4, 8)),
    ("A3", 10, (0, 4, 7, 10)), ("A4", 10, (0, 4, 7, 10)),
    ("A5", 7, (0, 4, 7)), ("A6", 7, (0, 4, 7)),
    ("A7", 2, (0, 1, 2)), ("B1", 5, (0, 3, 5)),
    ("B2", 5, (0, 3, 5)), ("B3", 5, (0, 3, 5)),
    ("C1", 6, (0, 3, 6)), ("C2", 4, (0, 2, 4)),
    ("C3", 5, (0, 3, 5)), ("D1", 4, (0, 2, 4)),
    ("D2", 4, (0, 2, 4)), ("D3", 2, (0, 1, 2)),
    ("E1", 3, (0, 1, 2, 3)), ("E2", 3, (0, 1, 2, 3)),
    ("E3", 2, (0, 1, 2)), ("E4", 2, (0, 1, 2)),
)
RUBRIC_IDS = tuple(item[0] for item in RUBRIC)
RUBRIC_MAXIMA = {item[0]: item[1] for item in RUBRIC}
RUBRIC_ANCHORS = {item[0]: item[2] for item in RUBRIC}
SECTIONS = {
    "functional": tuple(item for item in RUBRIC_IDS if item.startswith("A")),
    "robustnessSecurity": tuple(item for item in RUBRIC_IDS if item.startswith("B")),
    "accessibilityUsability": tuple(item for item in RUBRIC_IDS if item.startswith("C")),
    "testEffectiveness": tuple(item for item in RUBRIC_IDS if item.startswith("D")),
    "maintainabilityDocs": tuple(item for item in RUBRIC_IDS if item.startswith("E")),
}
SECTION_MAXIMA = {
    "functional": 50, "robustnessSecurity": 15,
    "accessibilityUsability": 15, "testEffectiveness": 10,
    "maintainabilityDocs": 10,
}
ROLE_BUDGETS = {
    "builder": 2400, "reviewer": 900, "fixer": 1500,
    "tester": 900, "evaluator": 1800, "unblinder": 300,
    "git_worker": 600,
}
MODEL_ROLES = {"builder", "reviewer", "fixer", "tester", "evaluator"}
PUBLIC_GATES = (
    "npm run format:check", "npm run lint", "npm run typecheck",
    "npm run validate:scaffold", "npm run test:protocol",
    "npm run test:public:if-implemented", "npm run build",
)
TESTER_COMMAND = "npm run check"
EVALUATOR_PUBLIC_COMMAND = "npm run test:public"
HIDDEN_ID = "permissions-playground-sealed-v2"
HIDDEN_COMMAND = "node sealed-hidden-suite/run.mjs"
HIDDEN_SHA256 = "a6f38c08eff3fd23fca3299f0777adbea4001d3ac3147272511ff9babd98a19b"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_json(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        if abs(value) > 9_007_199_254_740_991:
            raise TypeError("canonical JSON numbers must be safe integers")
        return str(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise TypeError("canonical JSON object keys must be strings")
        keys = sorted(value, key=lambda key: key.encode("utf-8"))
        return "{" + ",".join(
            f"{canonical_json(key)}:{canonical_json(value[key])}" for key in keys
        ) + "}"
    raise TypeError(f"unsupported canonical JSON type: {type(value).__name__}")


def canonical_hash(value: Any) -> str:
    payload = CANONICAL_DOMAIN + canonical_json(value).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def valid_hash(value: Any, pattern: re.Pattern[str] = HEX64) -> bool:
    return isinstance(value, str) and bool(pattern.fullmatch(value))


def exact_fields(value: Any, fields: tuple[str, ...] | set[str], location: str,
                 errors: list[str]) -> bool:
    if not isinstance(value, dict):
        errors.append(f"{location}: must be an object")
        return False
    expected = set(fields)
    actual = set(value)
    require(actual == expected,
            f"{location}: fields must be exactly {','.join(sorted(expected))}", errors)
    return True


def parse_time(value: Any, location: str, errors: list[str]) -> datetime | None:
    if not nonempty(value):
        errors.append(f"{location}: date-time required")
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(f"{location}: invalid date-time")
        return None


def candidate_assignment(seed_hex: str, candidate_ids: list[str]) -> tuple[str, int, dict[str, str]]:
    encoded = sorted((candidate.encode("utf-8"), candidate) for candidate in candidate_ids)
    material = bytearray(ASSIGNMENT_DOMAIN)
    material.extend(bytes.fromhex(seed_hex))
    for raw, _ in encoded:
        material.extend(len(raw).to_bytes(8, "big"))
        material.extend(raw)
    digest = hashlib.sha256(material).hexdigest()
    draw = int(digest[:2], 16) & 1
    mapping = {
        candidate: "baseline" if index == draw else "treatment"
        for index, (_, candidate) in enumerate(encoded)
    }
    return digest, draw, mapping


def evaluation_randomization(seed_hex: str) -> tuple[str, dict[str, str], dict[str, str]]:
    digest = sha256_text(EVALUATION_DOMAIN + seed_hex)
    ranks = {name: sha256_text(f"{digest}\n{name}") for name in ("B0", "T0", "Tfinal")}
    ranked = sorted(ranks, key=lambda name: (ranks[name], name.encode("utf-8")))
    return digest, ranks, dict(zip(("X", "Y", "Z"), ranked, strict=True))


def validate_bundles() -> list[str]:
    errors: list[str] = []
    for path, raw_expected, canonical_expected, label in (
        (CONTRACT_PATH, CONTRACT_RAW_SHA256, CONTRACT_CANONICAL_SHA256, "canonical contract"),
        (GOLDEN_PATH, GOLDEN_RAW_SHA256, GOLDEN_CANONICAL_SHA256, "golden fixture"),
        (INVALID_PATH, INVALID_RAW_SHA256, INVALID_CANONICAL_SHA256, "invalid-current fixture"),
    ):
        try:
            raw = path.read_bytes()
            value = json.loads(raw.decode("utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            errors.append(f"bundled {label} unreadable: {exc}")
            continue
        require(hashlib.sha256(raw).hexdigest() == raw_expected,
                f"bundled {label} raw bytes diverge", errors)
        try:
            digest = canonical_hash(value)
        except (TypeError, UnicodeError) as exc:
            errors.append(f"bundled {label} is not canonicalizable: {exc}")
        else:
            require(digest == canonical_expected,
                    f"bundled {label} canonical SHA-256 diverges", errors)
    return errors


def validate_contract(contract: Any) -> list[str]:
    errors: list[str] = []
    require(canonical_hash(contract) == CONTRACT_CANONICAL_SHA256,
            "canonical contract SHA-256 mismatch", errors)
    require(contract.get("finding", {}).get("requiredFields") == list(FINDING_FIELDS),
            "canonical finding fields diverge", errors)
    require(contract.get("finding", {}).get("severities") == ["critical", "high", "medium", "low"],
            "canonical finding severities diverge", errors)
    require(contract.get("stopping", {}).get("baselineStopReason") == "baseline-zero-cycles",
            "canonical baseline stop reason diverges", errors)
    expected_rubric = [
        {"id": item_id, "maximum": maximum, "anchors": list(anchors)}
        for item_id, maximum, anchors in RUBRIC
    ]
    require(contract.get("evaluation", {}).get("rubricItems") == expected_rubric,
            "canonical rubric items diverge", errors)
    require(contract.get("evaluation", {}).get("sectionMaxima") == SECTION_MAXIMA,
            "canonical section maxima diverge", errors)
    for role, maximum in ROLE_BUDGETS.items():
        require(contract.get("roles", {}).get(role, {}).get("wallSecondsMaximum") == maximum,
                f"canonical {role} wall budget diverges", errors)
    require(contract.get("costPolicy", {}).get("maxTokens") is None and
            contract.get("costPolicy", {}).get("maxTokensUnavailableReasonRequired") is True,
            "canonical nullable maxTokens policy diverges", errors)
    require(contract.get("builderFreeze") == {
        "promptSha256": BUILDER_PROMPT_SHA256,
        "configSha256": BUILDER_CONFIG_SHA256,
        "rule": "every builder freeze must equal both canonical hashes and the corresponding lock commitments",
    }, "canonical builder prompt/config commitments diverge", errors)
    require(contract.get("invalidation") == {
        "completedStatuses": ["valid", "invalid"],
        "activeInvalidationFields": [
            "invalidationId", "scope", "code", "reason", "detectedAt",
            "evidenceSha256", "preservedArtifactSha256",
        ],
        "invalidAttemptFields": [
            "attemptId", "scope", "code", "reason", "invalidatedAt",
            "evidenceSha256", "preservedArtifactSha256",
        ],
        "validRule": "activeInvalidation is null; evaluations and scored outcome are required; invalidAttempts may be empty or preserved",
        "invalidRule": "activeInvalidation is required; evaluations and scored outcome are null; invalidAttempts may be empty or preserved",
    }, "canonical invalidation state contract diverges", errors)
    gates = contract.get("gates", {})
    require(gates.get("testerCommand") == TESTER_COMMAND and
            gates.get("evaluatorPublicCommand") == EVALUATOR_PUBLIC_COMMAND and
            gates.get("componentCommands") == list(PUBLIC_GATES),
            "canonical public gates diverge", errors)
    hidden = contract.get("hiddenSuite", {})
    require(hidden == {"id": HIDDEN_ID, "command": HIDDEN_COMMAND, "sha256": HIDDEN_SHA256},
            "canonical hidden commitment diverges", errors)
    return errors


def walk_values(value: Any, path: tuple[Any, ...] = ()):
    yield value, path
    if isinstance(value, list):
        for index, item in enumerate(value):
            yield from walk_values(item, (*path, index))
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from walk_values(item, (*path, key))


def validate_artifact_mode(value: Any, mode: str) -> list[str]:
    if mode not in {"template", "execution"}:
        return ["validation mode must be explicitly template or execution"]
    if mode == "template":
        return []
    errors: list[str] = []
    for item, path in walk_values(value):
        if not isinstance(item, str):
            continue
        location = ".".join(str(part) for part in path)
        if item in {"0" * 40, "0" * 64}:
            errors.append(f"execution record contains zero hash/seed at {location}")
        if SENTINEL.search(item):
            errors.append(f"execution record contains a template sentinel at {location}")
        if path and path[-1] == "freezeState" and item == "provisional":
            errors.append("execution record cannot use a provisional lock")
    return errors


def validate_finding(value: Any, cycle: int, location: str, errors: list[str]) -> None:
    if not exact_fields(value, FINDING_FIELDS, location, errors):
        return
    require(isinstance(value.get("id"), str) and bool(FINDING_ID.fullmatch(value["id"])) and
            value["id"].startswith(f"cycle-{cycle}-"), f"{location}: invalid finding id", errors)
    require(value.get("severity") in SEVERITIES, f"{location}: invalid severity", errors)
    for field in ("title", "expected", "actual", "verification"):
        require(nonempty(value.get(field)), f"{location}: {field} required", errors)
    evidence = value.get("evidence")
    require(isinstance(evidence, list) and bool(evidence) and all(nonempty(item) for item in evidence),
            f"{location}: evidence must contain nonempty strings", errors)
    rubric_items = value.get("rubricItems")
    require(isinstance(rubric_items, list) and bool(rubric_items) and
            len(rubric_items) == len(set(rubric_items)) and
            all(item in RUBRIC_IDS for item in rubric_items),
            f"{location}: rubricItems invalid", errors)
    duplicate = value.get("duplicateOf")
    require(duplicate is None or (isinstance(duplicate, str) and bool(FINDING_ID.fullmatch(duplicate))),
            f"{location}: duplicateOf invalid", errors)


def validate_test_result(value: Any, command: str, location: str, errors: list[str]) -> None:
    fields = {"passed", "failed", "command", "exitCode", "rawOutputSha256"}
    if not exact_fields(value, fields, location, errors):
        return
    require(isinstance(value.get("passed"), int) and not isinstance(value.get("passed"), bool) and value["passed"] >= 0,
            f"{location}: passed invalid", errors)
    require(isinstance(value.get("failed"), int) and not isinstance(value.get("failed"), bool) and value["failed"] >= 0,
            f"{location}: failed invalid", errors)
    require(value.get("command") == command, f"{location}: command diverges from commitment", errors)
    require(isinstance(value.get("exitCode"), int) and not isinstance(value.get("exitCode"), bool),
            f"{location}: exitCode invalid", errors)
    require(valid_hash(value.get("rawOutputSha256")), f"{location}: rawOutputSha256 invalid", errors)


def validate_evaluation(value: Any, location: str, errors: list[str]) -> None:
    fields = {
        "packageLabel", "packageSha256", "evaluatorWorkerId", "evaluatedAt",
        "publicTests", "hiddenTests", "items", "sectionTotals", "uncappedTotal",
        "capConditions", "capsApplied", "finalTotal", "uncertainties", "evidenceHash",
    }
    if not exact_fields(value, fields, location, errors):
        return
    require(value.get("packageLabel") in {"X", "Y", "Z"}, f"{location}: invalid packageLabel", errors)
    require(valid_hash(value.get("packageSha256")), f"{location}: packageSha256 invalid", errors)
    require(nonempty(value.get("evaluatorWorkerId")), f"{location}: evaluatorWorkerId required", errors)
    parse_time(value.get("evaluatedAt"), f"{location}.evaluatedAt", errors)
    validate_test_result(value.get("publicTests"), EVALUATOR_PUBLIC_COMMAND, f"{location}.publicTests", errors)
    validate_test_result(value.get("hiddenTests"), HIDDEN_COMMAND, f"{location}.hiddenTests", errors)
    items = value.get("items")
    require(isinstance(items, list) and len(items) == 20, f"{location}: exactly 20 rubric items required", errors)
    scores: dict[str, int] = {}
    if isinstance(items, list):
        require([item.get("id") if isinstance(item, dict) else None for item in items] == list(RUBRIC_IDS),
                f"{location}: rubric IDs must appear once in canonical order", errors)
        for index, item in enumerate(items):
            item_location = f"{location}.items[{index}]"
            if not exact_fields(item, {"id", "score", "maximum", "evidence", "rationale"}, item_location, errors):
                continue
            item_id = item.get("id")
            require(item.get("maximum") == RUBRIC_MAXIMA.get(item_id),
                    f"{item_location}: maximum diverges", errors)
            require(item.get("score") in RUBRIC_ANCHORS.get(item_id, ()),
                    f"{item_location}: score is not a written anchor", errors)
            require(isinstance(item.get("evidence"), list) and all(nonempty(e) for e in item["evidence"]),
                    f"{item_location}: evidence invalid", errors)
            require(nonempty(item.get("rationale")), f"{item_location}: rationale required", errors)
            if isinstance(item_id, str) and isinstance(item.get("score"), int):
                scores[item_id] = item["score"]
    section_totals = value.get("sectionTotals")
    if exact_fields(section_totals, set(SECTIONS), f"{location}.sectionTotals", errors):
        for section, ids in SECTIONS.items():
            expected = sum(scores.get(item_id, 0) for item_id in ids)
            require(section_totals.get(section) == expected,
                    f"{location}: {section} subtotal arithmetic is incorrect", errors)
            subtotal = section_totals.get(section)
            require(isinstance(subtotal, int) and not isinstance(subtotal, bool) and
                    0 <= subtotal <= SECTION_MAXIMA[section],
                    f"{location}: {section} exceeds section maximum", errors)
        expected_uncapped = sum(section_totals.get(section, 0) for section in SECTIONS)
        require(value.get("uncappedTotal") == expected_uncapped,
                f"{location}: uncappedTotal arithmetic is incorrect", errors)
    conditions = value.get("capConditions")
    condition_fields = {"buildFailedOrCannotRender", "defaultAllow", "executableInjectionOrUnexpectedNetwork"}
    expected_caps: list[str] = []
    expected_final = value.get("uncappedTotal")
    if exact_fields(conditions, condition_fields, f"{location}.capConditions", errors):
        require(all(isinstance(conditions.get(key), bool) for key in condition_fields),
                f"{location}: cap conditions must be booleans", errors)
        if conditions.get("buildFailedOrCannotRender"):
            expected_caps.append("functional-section-10")
            require(isinstance(section_totals, dict) and section_totals.get("functional", 11) <= 10,
                    f"{location}: functional build/render cap not applied", errors)
        if conditions.get("defaultAllow"):
            expected_caps.append("default-allow-A2-A3-combined-4")
            require(scores.get("A2", 9) + scores.get("A3", 11) <= 4,
                    f"{location}: default-allow A2+A3 cap not applied", errors)
        if conditions.get("executableInjectionOrUnexpectedNetwork"):
            expected_caps.append("overall-security-50")
            if isinstance(expected_final, int):
                expected_final = min(expected_final, 50)
    require(value.get("capsApplied") == expected_caps,
            f"{location}: capsApplied diverges", errors)
    require(value.get("finalTotal") == expected_final,
            f"{location}: finalTotal cap arithmetic is incorrect", errors)
    require(isinstance(value.get("uncertainties"), list) and
            all(nonempty(item) for item in value.get("uncertainties", [])),
            f"{location}: uncertainties invalid", errors)
    require(valid_hash(value.get("evidenceHash")), f"{location}: evidenceHash invalid", errors)


def resolve_artifact(value: Any, key: str) -> Any:
    current = value
    for part in key.split("."):
        if isinstance(current, list) and part.isdigit():
            index = int(part)
            if index >= len(current):
                return None
            current = current[index]
        elif isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


ACTIVE_INVALIDATION_FIELDS = (
    "invalidationId", "scope", "code", "reason", "detectedAt",
    "evidenceSha256", "preservedArtifactSha256",
)
INVALID_ATTEMPT_FIELDS = (
    "attemptId", "scope", "code", "reason", "invalidatedAt",
    "evidenceSha256", "preservedArtifactSha256",
)


def validate_invalidation(value: Any, fields: tuple[str, ...], timestamp_field: str,
                          location: str, errors: list[str]) -> None:
    if not exact_fields(value, fields, location, errors):
        return
    for field in fields[:4]:
        require(nonempty(value.get(field)), f"{location}.{field}: nonempty string required", errors)
    parse_time(value.get(timestamp_field), f"{location}.{timestamp_field}", errors)
    for field in ("evidenceSha256", "preservedArtifactSha256"):
        digest = value.get(field)
        require(valid_hash(digest) and digest != "0" * 64,
                f"{location}.{field}: nonzero SHA-256 required", errors)


def validate_conclusion(fixture: dict[str, Any], errors: list[str]) -> None:
    status = fixture.get("status")
    require(status in {"valid", "invalid"},
            "run: completed status must be valid or invalid", errors)
    attempts = fixture.get("invalidAttempts")
    require(isinstance(attempts, list), "run: invalidAttempts must be an array", errors)
    if isinstance(attempts, list):
        for index, attempt in enumerate(attempts):
            validate_invalidation(attempt, INVALID_ATTEMPT_FIELDS, "invalidatedAt",
                                  f"invalidAttempts[{index}]", errors)
    if status == "valid":
        require(fixture.get("activeInvalidation") is None,
                "run: valid status requires activeInvalidation null", errors)
        require(isinstance(fixture.get("evaluations"), list) and
                len(fixture["evaluations"]) == 3,
                "run: valid status requires exactly three evaluations", errors)
        require(isinstance(fixture.get("outcome"), dict),
                "run: valid status requires a scored outcome", errors)
    elif status == "invalid":
        validate_invalidation(fixture.get("activeInvalidation"),
                              ACTIVE_INVALIDATION_FIELDS, "detectedAt",
                              "activeInvalidation", errors)
        require(fixture.get("evaluations") is None,
                "run: invalid status requires evaluations null", errors)
        require(fixture.get("outcome") is None,
                "run: invalid status requires outcome null", errors)
    if fixture.get("activeInvalidation") is not None:
        require(fixture.get("outcome") is None,
                "run: active invalidation forbids a scored outcome", errors)


def validate_execution(fixture: Any) -> list[str]:
    errors = validate_artifact_mode(fixture, "execution")
    try:
        canonical_json(fixture)
    except (TypeError, UnicodeError) as exc:
        errors.append(f"run: not canonicalizable under utf8-sorted-json-v1: {exc}")
        return sorted(set(errors))
    if not isinstance(fixture, dict):
        errors.append("run: must be an object")
        return sorted(set(errors))
    validate_conclusion(fixture, errors)
    require(fixture.get("fixtureVersion") == "1.0.0", "run: fixtureVersion diverges", errors)
    require(fixture.get("protocolVersion") == "2.2.0", "run: protocolVersion diverges", errors)
    if fixture.get("status") == "invalid":
        invalid_fields = {
            "fixtureVersion", "fixtureKind", "protocolVersion", "status",
            "activeInvalidation", "invalidAttempts", "evaluations", "outcome",
        }
        exact_fields(fixture, invalid_fields, "run", errors)
        require(fixture.get("fixtureKind") == "prospective-invalid-current",
                "run: invalid fixtureKind diverges", errors)
        return sorted(set(errors))
    top_fields = {
        "fixtureVersion", "fixtureKind", "protocolVersion", "canonicalContractSha256",
        "status", "activeInvalidation", "invalidAttempts",
        "bindings", "environment", "workers", "builderFreezes", "assignment",
        "evaluationRandomization", "runs", "reviews", "fixes", "tests", "packages",
        "evaluations", "outcome", "costs", "evidenceChain",
    }
    if not exact_fields(fixture, top_fields, "run", errors):
        return sorted(set(errors))
    require(fixture.get("fixtureKind") == "prospective-conformance", "run: fixtureKind diverges", errors)
    require(fixture.get("canonicalContractSha256") == CONTRACT_CANONICAL_SHA256,
            "run: canonical contract binding diverges", errors)

    bindings = fixture.get("bindings")
    binding_fields = {
        "commonStartCommit", "preregistrationLockCommit", "lockFileSha256",
        "hiddenSuiteId", "hiddenSuiteSha256", "publicGates", "testerCommand",
        "evaluatorPublicCommand", "evaluatorHiddenCommand",
    }
    if exact_fields(bindings, binding_fields, "bindings", errors):
        require(valid_hash(bindings.get("commonStartCommit"), HEX40), "bindings: commonStartCommit invalid", errors)
        require(valid_hash(bindings.get("preregistrationLockCommit"), HEX40), "bindings: lock commit invalid", errors)
        require(valid_hash(bindings.get("lockFileSha256")), "bindings: lock hash invalid", errors)
        require(bindings.get("publicGates") == list(PUBLIC_GATES), "bindings: immutable public gates diverge", errors)
        require(bindings.get("testerCommand") == TESTER_COMMAND, "bindings: tester command diverges", errors)
        require(bindings.get("evaluatorPublicCommand") == EVALUATOR_PUBLIC_COMMAND,
                "bindings: evaluator public command diverges", errors)
        require(bindings.get("evaluatorHiddenCommand") == HIDDEN_COMMAND and
                bindings.get("hiddenSuiteId") == HIDDEN_ID and
                bindings.get("hiddenSuiteSha256") == HIDDEN_SHA256,
                "bindings: hidden-suite commitment diverges", errors)

    environment = fixture.get("environment")
    if exact_fields(environment, {"environmentSha256", "modelConfigSha256", "node", "npm"}, "environment", errors):
        require(valid_hash(environment.get("environmentSha256")), "environment: hash invalid", errors)
        require(valid_hash(environment.get("modelConfigSha256")), "environment: model config hash invalid", errors)
        require(environment.get("node") == "22.x", "environment: Node binding diverges", errors)
        require(nonempty(environment.get("npm")), "environment: npm version required", errors)
    if not isinstance(environment, dict):
        environment = {}

    workers = fixture.get("workers")
    require(isinstance(workers, list), "workers: array required", errors)
    worker_by_id: dict[str, dict[str, Any]] = {}
    if isinstance(workers, list):
        for index, worker in enumerate(workers):
            location = f"workers[{index}]"
            if not exact_fields(worker, {"workerId", "role", "invoked"}, location, errors):
                continue
            worker_id = worker.get("workerId")
            require(nonempty(worker_id) and len(worker_id) >= 8, f"{location}: workerId invalid", errors)
            require(worker.get("role") in ROLE_BUDGETS, f"{location}: role invalid", errors)
            require(isinstance(worker.get("invoked"), bool), f"{location}: invoked must be boolean", errors)
            if nonempty(worker_id):
                require(worker_id not in worker_by_id, "workers: duplicate worker IDs", errors)
                worker_by_id[worker_id] = worker
        require(set(worker.get("role") for worker in workers if isinstance(worker, dict)) == set(ROLE_BUDGETS),
                "workers: registry must cover all seven roles", errors)

    freezes = fixture.get("builderFreezes")
    freeze_times: list[datetime] = []
    if exact_fields(freezes, {"candidate-a", "candidate-b"}, "builderFreezes", errors):
        for candidate in ("candidate-a", "candidate-b"):
            freeze = freezes.get(candidate)
            location = f"builderFreezes.{candidate}"
            fields = {"candidateLabel", "workerId", "promptSha256", "configSha256", "commit", "treeSha256", "sealedAt"}
            if not exact_fields(freeze, fields, location, errors):
                continue
            require(freeze.get("candidateLabel") == candidate, f"{location}: candidateLabel mismatch", errors)
            require(worker_by_id.get(freeze.get("workerId"), {}).get("role") == "builder",
                    f"{location}: worker is not a builder", errors)
            for field in ("promptSha256", "configSha256", "treeSha256"):
                require(valid_hash(freeze.get(field)), f"{location}: {field} invalid", errors)
            require(freeze.get("promptSha256") == BUILDER_PROMPT_SHA256 and
                    freeze.get("promptSha256") == LOCK_PROMPT_SHA256,
                    f"{location}: prompt commitment drift from canonical contract and lock", errors)
            require(freeze.get("configSha256") == BUILDER_CONFIG_SHA256 and
                    freeze.get("configSha256") == LOCK_CONFIG_SHA256,
                    f"{location}: config commitment drift from canonical contract and lock", errors)
            require(valid_hash(freeze.get("commit"), HEX40), f"{location}: commit invalid", errors)
            parsed = parse_time(freeze.get("sealedAt"), f"{location}.sealedAt", errors)
            if parsed:
                freeze_times.append(parsed)
        if all(isinstance(freezes.get(candidate), dict) for candidate in ("candidate-a", "candidate-b")):
            require(freezes["candidate-a"].get("promptSha256") == freezes["candidate-b"].get("promptSha256"),
                    "builder freezes: prompt bytes differ", errors)
            require(freezes["candidate-a"].get("configSha256") == freezes["candidate-b"].get("configSha256"),
                    "builder freezes: config bytes differ", errors)
    if not isinstance(freezes, dict):
        freezes = {}

    assignment = fixture.get("assignment")
    assignment_fields = {"frozenInitialEvidenceHashes", "seedHex", "digestSha256", "draw", "generatedAt", "generator", "mapping"}
    if exact_fields(assignment, assignment_fields, "assignment", errors):
        seed = assignment.get("seedHex")
        require(valid_hash(seed), "assignment: seed must encode exactly 32 bytes", errors)
        if valid_hash(seed):
            digest, draw, mapping = candidate_assignment(seed, ["candidate-a", "candidate-b"])
            require(assignment.get("digestSha256") == digest, "assignment: digest bytes diverge", errors)
            require(assignment.get("draw") == draw, "assignment: draw diverges", errors)
            require(assignment.get("mapping") == mapping, "assignment: mapping diverges", errors)
        require(nonempty(assignment.get("generator")), "assignment: generator required", errors)
        generated = parse_time(assignment.get("generatedAt"), "assignment.generatedAt", errors)
        if generated and freeze_times:
            require(all(generated > frozen for frozen in freeze_times),
                    "assignment: seed must be generated after both freezes", errors)
        frozen_hashes = assignment.get("frozenInitialEvidenceHashes")
        if exact_fields(frozen_hashes, {"candidate-a", "candidate-b"}, "assignment.frozenInitialEvidenceHashes", errors):
            for candidate in ("candidate-a", "candidate-b"):
                require(isinstance(freezes, dict) and frozen_hashes.get(candidate) == canonical_hash(freezes.get(candidate)),
                        f"assignment: {candidate} frozen evidence hash diverges", errors)

    randomization = fixture.get("evaluationRandomization")
    random_fields = {"seedHex", "digestSha256", "rankDigests", "order", "mapping"}
    if exact_fields(randomization, random_fields, "evaluationRandomization", errors):
        seed = randomization.get("seedHex")
        require(valid_hash(seed), "evaluationRandomization: seed must encode exactly 32 bytes", errors)
        if valid_hash(seed):
            digest, ranks, mapping = evaluation_randomization(seed)
            require(randomization.get("digestSha256") == digest,
                    "evaluationRandomization: digest bytes diverge", errors)
            require(randomization.get("rankDigests") == ranks,
                    "evaluationRandomization: rank-hash bytes diverge", errors)
            require(randomization.get("mapping") == mapping,
                    "evaluationRandomization: X/Y/Z mapping diverges", errors)
        require(randomization.get("order") == ["X", "Y", "Z"],
                "evaluationRandomization: label order diverges", errors)
    if not isinstance(randomization, dict):
        randomization = {}

    runs = fixture.get("runs")
    if exact_fields(runs, {"candidate-a", "candidate-b"}, "runs", errors):
        baseline = runs.get("candidate-a")
        treatment = runs.get("candidate-b")
        run_fields = {"candidateLabel", "assignedArm", "builderWorkerId", "initialSnapshot", "finalSnapshot", "cycles", "stopReason", "convergence", "status"}
        if exact_fields(baseline, run_fields, "runs.candidate-a", errors):
            require(baseline.get("assignedArm") == "baseline", "baseline: assignedArm diverges", errors)
            require(baseline.get("cycles") == [], "baseline: must have zero cycles", errors)
            require(baseline.get("stopReason") == "baseline-zero-cycles",
                    "baseline: stopReason must be baseline-zero-cycles", errors)
            require(baseline.get("convergence") is None, "baseline: convergence must be null", errors)
            require(baseline.get("initialSnapshot") == baseline.get("finalSnapshot"),
                    "baseline: final snapshot must equal initial", errors)
        if exact_fields(treatment, run_fields, "runs.candidate-b", errors):
            require(treatment.get("assignedArm") == "treatment", "treatment: assignedArm diverges", errors)
            cycles = treatment.get("cycles")
            require(isinstance(cycles, list) and 1 <= len(cycles) <= 5, "treatment: one to five cycles required", errors)
            if isinstance(cycles, list):
                for index, cycle in enumerate(cycles):
                    cycle_fields = {"number", "reviewerWorkerId", "fixerWorkerId", "testerWorkerId", "reviewFindingCount", "decision"}
                    if not exact_fields(cycle, cycle_fields, f"treatment.cycles[{index}]", errors):
                        continue
                    require(cycle.get("number") == index + 1, "treatment: cycles must be contiguous from 1", errors)
                    count = cycle.get("reviewFindingCount")
                    require(isinstance(count, int) and not isinstance(count, bool) and count >= 0,
                            f"treatment.cycles[{index}]: reviewFindingCount invalid", errors)
                    if count == 0:
                        require(cycle.get("decision") == "zero-findings" and
                                cycle.get("fixerWorkerId") is None and cycle.get("testerWorkerId") is None,
                                "treatment: zero-findings must stop before fixer/tester", errors)
                    elif isinstance(count, int):
                        require(nonempty(cycle.get("fixerWorkerId")) and nonempty(cycle.get("testerWorkerId")),
                                "treatment: findings require fixer and tester", errors)
                last = cycles[-1] if cycles else {}
                if treatment.get("stopReason") == "zero-findings":
                    require(last.get("decision") == "zero-findings" and treatment.get("convergence") is True,
                            "treatment: zero-findings convergence diverges", errors)
                if treatment.get("stopReason") == "max-cycles":
                    require(len(cycles) == 5 and last.get("decision") == "max-cycles" and
                            treatment.get("convergence") is False,
                            "treatment: max-cycles semantics diverge", errors)

    reviews = fixture.get("reviews")
    require(isinstance(reviews, list), "reviews: array required", errors)
    findings_by_cycle: dict[int, list[dict[str, Any]]] = {}
    if isinstance(reviews, list):
        review_fields = {"candidateLabel", "cycle", "snapshotCommit", "roleInstanceId", "workerId", "startedAt", "completedAt", "checksRun", "evidenceExamined", "coverageGaps", "findings"}
        for index, review in enumerate(reviews):
            location = f"reviews[{index}]"
            if not exact_fields(review, review_fields, location, errors):
                continue
            cycle = review.get("cycle")
            require(isinstance(cycle, int) and not isinstance(cycle, bool) and 1 <= cycle <= 5,
                    f"{location}: cycle invalid", errors)
            require(review.get("roleInstanceId") == f"cycle-{cycle}-reviewer",
                    f"{location}: roleInstanceId diverges", errors)
            require(worker_by_id.get(review.get("workerId"), {}).get("role") == "reviewer",
                    f"{location}: worker is not reviewer", errors)
            evidence = review.get("evidenceExamined")
            require(isinstance(evidence, list) and bool(evidence) and all(nonempty(item) for item in evidence),
                    f"{location}: evidenceExamined required", errors)
            findings = review.get("findings")
            require(isinstance(findings, list), f"{location}: findings array required", errors)
            if isinstance(findings, list) and isinstance(cycle, int):
                findings_by_cycle[cycle] = findings
                for finding_index, finding in enumerate(findings):
                    validate_finding(finding, cycle, f"{location}.findings[{finding_index}]", errors)

    fixes = fixture.get("fixes")
    tests = fixture.get("tests")
    require(isinstance(fixes, list), "fixes: array required", errors)
    require(isinstance(tests, list), "tests: array required", errors)
    if isinstance(fixes, list):
        fix_fields = {"candidateLabel", "cycle", "roleInstanceId", "workerId", "startCommit", "finalCommit", "startedAt", "completedAt", "dispositions", "changedFiles", "checks", "remainingDefects", "deviations"}
        for index, fix in enumerate(fixes):
            location = f"fixes[{index}]"
            if exact_fields(fix, fix_fields, location, errors):
                cycle = fix.get("cycle")
                require(fix.get("roleInstanceId") == f"cycle-{cycle}-fixer", f"{location}: roleInstanceId diverges", errors)
                require(worker_by_id.get(fix.get("workerId"), {}).get("role") == "fixer",
                        f"{location}: worker is not fixer", errors)
                require(valid_hash(fix.get("startCommit"), HEX40) and valid_hash(fix.get("finalCommit"), HEX40),
                        f"{location}: commits invalid", errors)
                parse_time(fix.get("startedAt"), f"{location}.startedAt", errors)
                parse_time(fix.get("completedAt"), f"{location}.completedAt", errors)
                dispositions = fix.get("dispositions")
                require(isinstance(dispositions, list), f"{location}: dispositions array required", errors)
                expected_ids = [item.get("id") for item in findings_by_cycle.get(cycle, [])]
                if isinstance(dispositions, list):
                    require([item.get("findingId") for item in dispositions if isinstance(item, dict)] == expected_ids,
                            f"{location}: dispositions must cover current findings in order", errors)
                    for disposition_index, disposition in enumerate(dispositions):
                        disposition_location = f"{location}.dispositions[{disposition_index}]"
                        if exact_fields(disposition, {"findingId", "decision", "rationale", "evidence"},
                                        disposition_location, errors):
                            require(disposition.get("decision") in {"accepted", "partially-accepted", "rejected"},
                                    f"{disposition_location}: decision invalid", errors)
                            require(nonempty(disposition.get("rationale")),
                                    f"{disposition_location}: rationale required", errors)
                            disposition_evidence = disposition.get("evidence")
                            require(isinstance(disposition_evidence, list) and bool(disposition_evidence) and
                                    all(nonempty(item) for item in disposition_evidence),
                                    f"{disposition_location}: evidence required", errors)
                for field in ("changedFiles", "checks", "remainingDefects", "deviations"):
                    values = fix.get(field)
                    require(isinstance(values, list) and all(nonempty(item) for item in values),
                            f"{location}: {field} invalid", errors)
                if isinstance(fix.get("changedFiles"), list):
                    require(len(fix["changedFiles"]) == len(set(fix["changedFiles"])),
                            f"{location}: changedFiles must be unique", errors)
    if isinstance(tests, list):
        test_fields = {"candidateLabel", "cycle", "roleInstanceId", "workerId", "snapshotCommit", "startedAt", "completedAt", "command", "exitCode", "componentResults", "rawOutputSha256", "workingTreeClean"}
        for index, test in enumerate(tests):
            location = f"tests[{index}]"
            if not exact_fields(test, test_fields, location, errors):
                continue
            cycle = test.get("cycle")
            require(test.get("roleInstanceId") == f"cycle-{cycle}-tester", f"{location}: roleInstanceId diverges", errors)
            require(worker_by_id.get(test.get("workerId"), {}).get("role") == "tester",
                    f"{location}: worker is not tester", errors)
            require(test.get("command") == TESTER_COMMAND, f"{location}: tester command diverges", errors)
            require(valid_hash(test.get("snapshotCommit"), HEX40), f"{location}: snapshotCommit invalid", errors)
            parse_time(test.get("startedAt"), f"{location}.startedAt", errors)
            parse_time(test.get("completedAt"), f"{location}.completedAt", errors)
            require(isinstance(test.get("exitCode"), int) and not isinstance(test.get("exitCode"), bool),
                    f"{location}: exitCode invalid", errors)
            require(valid_hash(test.get("rawOutputSha256")), f"{location}: rawOutputSha256 invalid", errors)
            results = test.get("componentResults")
            require(isinstance(results, list) and len(results) == 7, f"{location}: seven component results required", errors)
            if isinstance(results, list):
                require([item.get("command") for item in results if isinstance(item, dict)] == list(PUBLIC_GATES),
                        f"{location}: component gates diverge", errors)
                for result_index, result in enumerate(results):
                    result_location = f"{location}.componentResults[{result_index}]"
                    if exact_fields(result, {"command", "exitCode"}, result_location, errors):
                        require(isinstance(result.get("exitCode"), int) and not isinstance(result.get("exitCode"), bool),
                                f"{result_location}: exitCode invalid", errors)
            require(test.get("workingTreeClean") is True, f"{location}: workingTreeClean must be true", errors)

    packages = fixture.get("packages")
    require(isinstance(packages, list) and len(packages) == 3, "packages: exactly three required", errors)
    package_by_label: dict[str, dict[str, Any]] = {}
    if isinstance(packages, list):
        require([item.get("packageLabel") for item in packages if isinstance(item, dict)] == ["X", "Y", "Z"],
                "packages: labels must be X/Y/Z in order", errors)
        for index, package in enumerate(packages):
            location = f"packages[{index}]"
            if not exact_fields(package, {"packageLabel", "snapshotRole", "sourceCommit", "treeSha256", "historyFree"}, location, errors):
                continue
            label = package.get("packageLabel")
            package_by_label[label] = package
            require(package.get("snapshotRole") == randomization.get("mapping", {}).get(label),
                    f"{location}: snapshotRole diverges from sealed mapping", errors)
            require(package.get("historyFree") is True, f"{location}: package must be history-free", errors)
            require(valid_hash(package.get("sourceCommit"), HEX40), f"{location}: sourceCommit invalid", errors)
            require(valid_hash(package.get("treeSha256")), f"{location}: treeSha256 invalid", errors)

    evaluations = fixture.get("evaluations")
    require(isinstance(evaluations, list) and len(evaluations) == 3,
            "evaluations: exactly three artifacts required", errors)
    evaluation_by_label: dict[str, dict[str, Any]] = {}
    if isinstance(evaluations, list):
        require([item.get("packageLabel") for item in evaluations if isinstance(item, dict)] == ["X", "Y", "Z"],
                "evaluations: labels must be X/Y/Z in order", errors)
        for index, evaluation in enumerate(evaluations):
            location = f"evaluations[{index}]"
            validate_evaluation(evaluation, location, errors)
            if isinstance(evaluation, dict):
                label = evaluation.get("packageLabel")
                evaluation_by_label[label] = evaluation
                package = package_by_label.get(label)
                require(isinstance(package, dict) and evaluation.get("packageSha256") == canonical_hash(package),
                        f"{location}: packageSha256 diverges", errors)
                require(worker_by_id.get(evaluation.get("evaluatorWorkerId"), {}).get("role") == "evaluator",
                        f"{location}: worker is not evaluator", errors)

    outcome = fixture.get("outcome")
    outcome_fields = {"packageMapping", "scores", "primaryTfinalMinusB0", "secondaryTfinalMinusT0", "mainSelection", "tiePolicy", "evaluationArtifactHashes", "evidenceHash", "unblinderWorkerId", "gitWorkerId"}
    if exact_fields(outcome, outcome_fields, "outcome", errors):
        mapping = outcome.get("packageMapping")
        require(mapping == randomization.get("mapping"), "outcome: package mapping diverges", errors)
        scores = outcome.get("scores")
        if exact_fields(scores, {"B0", "T0", "Tfinal"}, "outcome.scores", errors) and isinstance(mapping, dict):
            valid_scores = all(
                isinstance(scores.get(name), int) and not isinstance(scores.get(name), bool) and
                0 <= scores[name] <= 100 for name in ("B0", "T0", "Tfinal")
            )
            require(valid_scores, "outcome: scores must be integers from 0 through 100", errors)
            expected_scores = {
                snapshot: evaluation_by_label.get(label, {}).get("finalTotal")
                for label, snapshot in mapping.items()
            }
            require(scores == expected_scores, "outcome: scores diverge from evaluation artifacts", errors)
            if valid_scores:
                require(outcome.get("primaryTfinalMinusB0") == scores["Tfinal"] - scores["B0"],
                        "outcome: primary Tfinal-B0 arithmetic incorrect", errors)
                require(outcome.get("secondaryTfinalMinusT0") == scores["Tfinal"] - scores["T0"],
                        "outcome: secondary Tfinal-T0 arithmetic incorrect", errors)
                expected_selection = "treatment" if scores["Tfinal"] > scores["B0"] else "baseline"
                require(outcome.get("mainSelection") == expected_selection,
                        "outcome: selection must choose higher score and baseline on ties", errors)
        require(outcome.get("tiePolicy") == "baseline", "outcome: tiePolicy must be baseline", errors)
        hashes = outcome.get("evaluationArtifactHashes")
        if exact_fields(hashes, {"X", "Y", "Z"}, "outcome.evaluationArtifactHashes", errors):
            for label in ("X", "Y", "Z"):
                require(hashes.get(label) == canonical_hash(evaluation_by_label.get(label)),
                        f"outcome: evaluation hash mismatch for {label}", errors)
        require(worker_by_id.get(outcome.get("unblinderWorkerId"), {}).get("role") == "unblinder",
                "outcome: unblinder worker invalid", errors)
        require(worker_by_id.get(outcome.get("gitWorkerId"), {}).get("role") == "git_worker",
                "outcome: git worker invalid", errors)
        require(valid_hash(outcome.get("evidenceHash")), "outcome: evidenceHash invalid", errors)

    costs = fixture.get("costs")
    require(isinstance(costs, list), "costs: array required", errors)
    cost_worker_ids: set[str] = set()
    if isinstance(costs, list):
        cost_fields = {"workerId", "role", "candidateLabel", "packageLabel", "cycle", "turnLimit", "wallSecondsMaximum", "maxTokens", "maxTokensUnavailableReason", "environmentSha256", "modelConfigSha256", "modelConfigUnavailableReason", "startedAt", "completedAt", "wallSeconds", "totalTokens", "usd", "source"}
        for index, cost in enumerate(costs):
            location = f"costs[{index}]"
            if not exact_fields(cost, cost_fields, location, errors):
                continue
            worker_id = cost.get("workerId")
            require(worker_id not in cost_worker_ids, "costs: duplicate worker IDs", errors)
            cost_worker_ids.add(worker_id)
            role = cost.get("role")
            budget = ROLE_BUDGETS.get(role)
            require(worker_by_id.get(worker_id, {}).get("role") == role,
                    f"{location}: worker role mismatch", errors)
            require(cost.get("turnLimit") == 1, f"{location}: turnLimit must be 1", errors)
            require(cost.get("wallSecondsMaximum") == budget,
                    f"{location}: wall budget diverges", errors)
            wall = cost.get("wallSeconds")
            require(budget is not None and isinstance(wall, int) and not isinstance(wall, bool) and
                    0 <= wall <= budget,
                    f"{location}: wallSeconds exceeds budget", errors)
            require(cost.get("maxTokens") is None and nonempty(cost.get("maxTokensUnavailableReason")),
                    f"{location}: unavailable maxTokens must be null with reason", errors)
            require(cost.get("environmentSha256") == environment.get("environmentSha256"),
                    f"{location}: environment binding diverges", errors)
            if role in MODEL_ROLES:
                require(valid_hash(cost.get("modelConfigSha256")) and cost.get("modelConfigUnavailableReason") is None,
                        f"{location}: model role must bind model config", errors)
            else:
                require((valid_hash(cost.get("modelConfigSha256")) and cost.get("modelConfigUnavailableReason") is None) or
                        (cost.get("modelConfigSha256") is None and nonempty(cost.get("modelConfigUnavailableReason"))),
                        f"{location}: nullable model config requires reason", errors)
            if role in {"reviewer", "fixer", "tester"}:
                require(isinstance(cost.get("cycle"), int) and 1 <= cost["cycle"] <= 5,
                        f"{location}: cycle role must name cycle", errors)
            else:
                require(cost.get("cycle") is None, f"{location}: non-cycle role must have null cycle", errors)
            if cost.get("source") == "unavailable":
                require(cost.get("totalTokens") is None and cost.get("usd") is None,
                        f"{location}: unavailable telemetry must remain null", errors)
        invoked_ids = {worker_id for worker_id, worker in worker_by_id.items() if worker.get("invoked")}
        require(cost_worker_ids == invoked_ids, "costs: records must match invoked workers exactly", errors)

    evidence_chain = fixture.get("evidenceChain")
    require(isinstance(evidence_chain, list) and bool(evidence_chain), "evidenceChain: nonempty array required", errors)
    if isinstance(evidence_chain, list):
        for index, entry in enumerate(evidence_chain):
            location = f"evidenceChain[{index}]"
            if not exact_fields(entry, {"sequence", "artifactKey", "artifactSha256", "previousSha256"}, location, errors):
                continue
            require(entry.get("sequence") == index,
                    f"{location}: sequence must start at 0 and be contiguous", errors)
            expected_previous = None if index == 0 else evidence_chain[index - 1].get("artifactSha256")
            require(entry.get("previousSha256") == expected_previous,
                    f"{location}: previousSha256 mismatch", errors)
            artifact = resolve_artifact(fixture, entry.get("artifactKey", ""))
            require(artifact is not None and entry.get("artifactSha256") == canonical_hash(artifact),
                    f"{location}: domain-separated canonical artifact hash mismatch", errors)
    return sorted(set(errors))


def validate_document(value: Any, mode: str, expect_golden: bool = False) -> list[str]:
    errors = validate_artifact_mode(value, mode)
    if mode == "template":
        return sorted(set(errors))
    if expect_golden:
        try:
            require(canonical_hash(value) == GOLDEN_CANONICAL_SHA256,
                    "input canonical SHA-256 does not match frozen golden fixture", errors)
        except (TypeError, UnicodeError) as exc:
            errors.append(f"input is not canonicalizable: {exc}")
    errors.extend(validate_execution(value))
    return sorted(set(errors))


def validate_path(path: Path, mode: str, expect_golden: bool = False) -> list[str]:
    errors = validate_bundles()
    try:
        contract = load_json(CONTRACT_PATH)
        errors.extend(validate_contract(contract))
    except (OSError, UnicodeError, json.JSONDecodeError, TypeError) as exc:
        errors.append(f"canonical contract invalid: {exc}")
    try:
        value = load_json(path)
    except FileNotFoundError:
        errors.append(f"missing artifact: {path}")
        return sorted(set(errors))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        errors.append(f"invalid JSON artifact: {exc}")
        return sorted(set(errors))
    errors.extend(validate_document(value, mode, expect_golden))
    return sorted(set(errors))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path, help="integrated protocol-v2 JSON artifact")
    parser.add_argument("--mode", choices=("template", "execution"), required=True)
    parser.add_argument("--expect-golden", action="store_true",
                        help="require the frozen golden fixture canonical SHA-256")
    args = parser.parse_args(argv)
    errors = validate_path(args.artifact.resolve(), args.mode, args.expect_golden)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"OK: protocol-v2 {args.mode} artifact is canonically valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
