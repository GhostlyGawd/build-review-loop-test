#!/usr/bin/env python3
"""Validate public protocol-v2 integrated run artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import ntpath
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

SKILL_ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = SKILL_ROOT / "references" / "canonical-contract.json"
GOLDEN_PATH = SKILL_ROOT / "tests" / "fixtures" / "golden-run.json"
INVALID_PATH = SKILL_ROOT / "tests" / "fixtures" / "invalid-current.json"
CLI_SCHEMA_PATH = SKILL_ROOT / "references" / "cli-runtime-contract.schema.json"
CLI_TEMPLATE_PATH = SKILL_ROOT / "references" / "cli-runtime-contract.template.json"
CLI_RUNNER_PATH = SKILL_ROOT / "scripts" / "run-cli-builders.ps1"
CANONICAL_PATH_HELPER_PATH = SKILL_ROOT / "scripts" / "canonicalize-paths.mjs"
COMMIT_HELPER_PATH = SKILL_ROOT / "scripts" / "commit-candidate.ps1"
PERMISSION_PROBE_SCRIPT_PATH = SKILL_ROOT / "scripts" / "verify-cli-exec-permissions.ps1"
PERMISSION_PROBE_PATH = SKILL_ROOT / "references" / "actual-exec-permission-probe-2.7.0.json"
PERMISSION_PROBE_SCHEMA_PATH = SKILL_ROOT / "references" / "actual-exec-permission-probe.schema.json"
SECONDARY_PERMISSION_PROBE_SCRIPT_PATH = SKILL_ROOT / "scripts" / "verify-cli-permissions.ps1"
SECONDARY_PERMISSION_PROBE_PATH = SKILL_ROOT / "references" / "permission-probe-2.6.0.json"
ACTUAL_EXEC_PROMPT_PATH = SKILL_ROOT / "references" / "actual-exec-capability-probe.md"
ABORTED_26_PATH = SKILL_ROOT / "references" / "aborted-lock-2.6.0.json"
ROLE_SCHEMA_PATH = SKILL_ROOT / "references" / "role-runtime-contract.schema.json"
ROLE_TEMPLATE_PATH = SKILL_ROOT / "references" / "role-runtime-contract.template.json"
ROLE_RUNNER_PATH = SKILL_ROOT / "scripts" / "run-cli-role.ps1"
EVIDENCE_SCHEMA_PATH = SKILL_ROOT / "references" / "cli-supervision-evidence.schema.json"
EVIDENCE_TEMPLATE_PATH = SKILL_ROOT / "references" / "cli-supervision-evidence.template.json"
PACKAGE_SCHEMA_PATH = SKILL_ROOT / "references" / "blinded-package-manifest.schema.json"
PACKAGE_TEMPLATE_PATH = SKILL_ROOT / "references" / "blinded-package-manifest.template.json"
MAPPING_SCHEMA_PATH = SKILL_ROOT / "references" / "blinded-package-mapping.schema.json"
MAPPING_TEMPLATE_PATH = SKILL_ROOT / "references" / "blinded-package-mapping.template.json"
PACKAGER_PATH = SKILL_ROOT / "scripts" / "package-blinded-snapshots.mjs"
NEUTRAL_PROMPT_PATH = SKILL_ROOT / "references" / "neutral-builder.md"
SMOKE_PROMPT_PATH = SKILL_ROOT / "references" / "runner-smoke.md"
BUILDER_CONFIG_PATH = SKILL_ROOT / "references" / "builder-config.json"
BUILDER_ALLOWLIST_PATH = SKILL_ROOT / "references" / "builder-input-allowlist.json"
BUILDER_MANIFEST_SCHEMA_PATH = SKILL_ROOT / "references" / "builder-input-manifest.schema.json"
BUILDER_PREPARER_PATH = SKILL_ROOT / "scripts" / "prepare-builder-input.mjs"
BUILDER_PACKAGE_PATH = SKILL_ROOT / "references" / "builder-package.json"
PROTOCOL_LOCK_PATH = SKILL_ROOT / "references" / "protocol-lock.json"
EXPERIMENT_LOCK_SCHEMA_PATH = SKILL_ROOT / "references" / "experiment-lock.schema.json"
PROTOCOL_PATH = SKILL_ROOT / "references" / "protocol.md"
GOLDEN_README_PATH = SKILL_ROOT / "references" / "golden-run.README.md"
PROJECTION_PATHS = (
    SKILL_ROOT / "references" / "projection" / "index.html",
    SKILL_ROOT / "references" / "projection" / "src" / "main.tsx",
    SKILL_ROOT / "references" / "projection" / "docs" / "public-test-contract.md",
    SKILL_ROOT / "references" / "projection" / "package-lock.json",
)
ROLE_PROMPT_PATHS = {
    "reviewer": SKILL_ROOT / "references" / "blinded-reviewer.md",
    "fixer": SKILL_ROOT / "references" / "fixer.md",
    "tester": SKILL_ROOT / "references" / "tester.md",
    "evaluator": SKILL_ROOT / "references" / "blinded-evaluator.md",
}
CONTRACT_CANONICAL_SHA256 = "803ef84dadde7280c338ff0fd886e2dd532edf04d746527dd697e1310b38bb2e"
GOLDEN_CANONICAL_SHA256 = "ba53b413b157c919052bf42bfd8102bd4e50d8f022344b6d878429fe5b671534"
INVALID_CANONICAL_SHA256 = "049bf6fde3315383d0f4f431952c7d30886e9aef8b82b09fbf26b061d0302f7e"
CONTRACT_RAW_SHA256 = "8638231a471a442b8a024e0e8ad9757b443f5f3ec9576040c282804a02985ff6"
GOLDEN_RAW_SHA256 = "c4aebb2aad31567c42ff52ace1d8e8a614b2b0d15baeba4228921f863e75f321"
INVALID_RAW_SHA256 = "3fbeb3a38f2689a3990ac13de999aadb9dfa4a2131fcd5e0b3f156a4998a9941"
CLI_SCHEMA_SHA256 = "af1442dcf1cb0ffa8d7f3d0d082b6b43ed75924e8bea4970bedbf080adba6316"
CLI_TEMPLATE_RAW_SHA256 = "7bdeea71d9765d044a689debd8ef561bdd70159dcc140026089e9f2c9523a263"
CLI_RUNNER_SHA256 = "a87972d1f12f301c51ec531ce3a5f4b611cf4d10dc8d62e9f2e5ef687c1a9fd0"
CANONICAL_PATH_HELPER_SHA256 = "194af01d50aac44f741644e6f32bc73f75f72ccb118e9d721780ef2b2bc9ab0e"
COMMIT_HELPER_SHA256 = "813e0f79c92aa997a803e6b3822d45ab5ba58f501faeb1a496f59c7e21ed351f"
PERMISSION_PROBE_SCRIPT_SHA256 = "da1dc96f2bf02a8419d658de3a4d23bafc1fc8f550b283a61184c728b1e1975d"
PERMISSION_PROBE_SHA256 = "3a302500033ecaaa284a7b6a833ceee94c62a72b4c995d94fe38d89f9d65b688"
PERMISSION_PROBE_SCHEMA_SHA256 = "e22b85b6c20de96de404a63816d862d6ad5198715515016016c93fee64c0b9cd"
SECONDARY_PERMISSION_PROBE_SCRIPT_SHA256 = "770fe1ec68a3b599b497d08346e1caf19064a5d3c90b2d418fdba22f1914f893"
SECONDARY_PERMISSION_PROBE_SHA256 = "7d7b716012aa95d79eafcd3a22d4ce81e998172e6fe3584ea091d7ae9d7fec0c"
ACTUAL_EXEC_PROMPT_SHA256 = "6a0bfb5c28aea871ab7bece541da24745cd0543a662a8059bffa9887411a0da5"
ABORTED_26_SHA256 = "bb8696bcb50d7a6febec9924d2402e2a1a595315e6730c55dd4799bf4e5c01e0"
ROLE_SCHEMA_SHA256 = "11bfdd9d33cdfa0fa0053d74c6e2222180fa6aa02b9a7a12123cf5af24875a06"
ROLE_TEMPLATE_RAW_SHA256 = "2218c2edbe53d793a7874e7adcc28cde63386b13219dce5455a88d1a30d5f6f3"
ROLE_RUNNER_SHA256 = "e0bcef63b939e961bbe7ded794658948d70251c73c0dbaacaadb7691b168eca2"
EVIDENCE_SCHEMA_SHA256 = "b722627806b07254e995d5ae3a38ba921d69abba46651e41132fd8b9d7691d32"
EVIDENCE_TEMPLATE_RAW_SHA256 = "545627764d7f0a2eb51c310a5929c4656f19ce4d673fb1588315d98a0759faaa"
PACKAGE_SCHEMA_SHA256 = "4d9d8397fc068cdf511e99bae6980ed2d2ef5410e5128385043f1c426cdb8bd5"
PACKAGE_TEMPLATE_RAW_SHA256 = "c35470675fadf7157d954216bba53f88b226786c204ab2d6ce575b31450acadf"
MAPPING_SCHEMA_SHA256 = "2d0a96f27d43f511c26b57a49dfef5c05acfe0f5dfb1f8419f724d524513fb74"
MAPPING_TEMPLATE_RAW_SHA256 = "680da1c7b4bfe0e9eb1f056b712e9cc796e9be536097a36dbe244686795d1d43"
PACKAGER_SHA256 = "98ef96dd16f37a14fa4a56b324a0274dd3aa29010d296244e695fe42663478d7"
BUILDER_PROMPT_SHA256 = "5ed878d3be56824f94d3a72a40606c111dbfdfc1631bdf98b6ca7fe75ffebd56"
SMOKE_PROMPT_SHA256 = "135c5fc59fe72b4b37d924cd6f1a14e4f2a3b7b59711cc12294e81f52cbfd6a2"
BUILDER_CONFIG_SHA256 = "8d64a062c76ba8bdbd436b99d42cd7566ae2601821e009315afe8e37800f323b"
BUILDER_ALLOWLIST_SHA256 = "37af679c4f3f71cbd9e28b810897d4ff82c7c47cf4421a9d661b8b90947aef5b"
BUILDER_MANIFEST_SCHEMA_SHA256 = "b044646ede4fef4543a4950e5842f51997dc3b65e6bfabad7eeb1ff84caf0bb5"
BUILDER_PREPARER_SHA256 = "68e186914a0dd99e0b91f0851d45f8081086fffadae8d2949050e29ea1b832b3"
BUNDLE_EXTRA_HASHES = {
    BUILDER_PACKAGE_PATH: "be233b856939e83840a4807c22f59e8883643c2dd80cddb90166db655cd98143",
    PROTOCOL_LOCK_PATH: "5c463b371a2974cae2694f8707f4b1bce447b7ff6e20d54b8462bbee1109964f",
    EXPERIMENT_LOCK_SCHEMA_PATH: "625e7eeda8914b19bd5619428e876f2e00aab1d39447fb9c734decb4a8f8a292",
    PROTOCOL_PATH: "f613e5bb051d864c2a38082a1701d057815936f7bb4b88f2119cb0a123c3c9e9",
    GOLDEN_README_PATH: "7cb32b826cbd0919fa7eaf65154de833da7fe9c830a24451f3063b2dde672b55",
    COMMIT_HELPER_PATH: COMMIT_HELPER_SHA256,
    PERMISSION_PROBE_SCRIPT_PATH: PERMISSION_PROBE_SCRIPT_SHA256,
    PERMISSION_PROBE_PATH: PERMISSION_PROBE_SHA256,
    PERMISSION_PROBE_SCHEMA_PATH: PERMISSION_PROBE_SCHEMA_SHA256,
    SECONDARY_PERMISSION_PROBE_SCRIPT_PATH: SECONDARY_PERMISSION_PROBE_SCRIPT_SHA256,
    SECONDARY_PERMISSION_PROBE_PATH: SECONDARY_PERMISSION_PROBE_SHA256,
    ACTUAL_EXEC_PROMPT_PATH: ACTUAL_EXEC_PROMPT_SHA256,
    ABORTED_26_PATH: ABORTED_26_SHA256,
    PROJECTION_PATHS[0]: "2c281ab2fc936c659323a135234622fb2c8ea1baa720fc411cca1e995b321424",
    PROJECTION_PATHS[1]: "880acfdd79d16f24b1849ed6491198926ed49b6df89af2f4cac99defe8d78e9c",
    PROJECTION_PATHS[2]: "e85aee3135740a7b5501030af2dc3ffe7c16f50d93812499759a6f60c7238ee9",
    PROJECTION_PATHS[3]: "f1a2806abaa69116b0180d1e047916a4bc62b53fa89c0d65a2ece3a9aa94d00b",
}
LOCK_PROMPT_SHA256 = BUILDER_PROMPT_SHA256
LOCK_CONFIG_SHA256 = BUILDER_CONFIG_SHA256
CLI_BINARY_PATH = r"C:\Users\rhenm\.codex\plugins\.plugin-appserver\codex.exe"
CLI_VERSION = "codex-cli 0.145.0-alpha.18"
CLI_BINARY_SHA256 = "20d611ef1c9851f4da1cb4609beb6763904f72275cb91517b2400639ca1c28c4"
CLI_AUTH_STATUS = "Logged in using ChatGPT"
PWSH_PATH = r"C:\Users\rhenm\AppData\Local\pwsh7\pwsh.exe"
PWSH_VERSION = "7.6.2"
PWSH_SHA256 = "99ec38d8c4910fd5f2feeeec4dedb5076ff39a08ca21e12642822bc8d989e316"
CLI_INVARIANT_ARGV = (
    "-a", "never", "-m", "gpt-5.4", "-c", 'model_reasoning_effort="xhigh"',
    "-c", 'windows.sandbox="elevated"', "-c", "sandbox_workspace_write.network_access=false",
    "exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check",
    "--sandbox", "workspace-write", "--json",
)
MODEL_ROLE_PROMPT_SHA256 = {
    "builder": BUILDER_PROMPT_SHA256,
    "reviewer": "5bd94cc7c44165acae23675f82d74ece6bab0b4dab31f387d338d1c9a5e7dcae",
    "fixer": "7949487ec366fa042f11ab6264575826eabb875b429c4560783f03c8f1c17f99",
    "tester": "644ef262eb7a4c85b3a4d5636d88479082ebca37a5f082dbce165c90a9ef16c3",
    "evaluator": "ee2e0620aa9a7d55ef047dda9d6d947ee750ebd3bb3bc1f149a229eb11adbe40",
}
ROLE_ARTIFACT_SCHEMA_SHA256 = {
    "reviewer": "66e47c9e4a0a8a4b1d5f09a73f09f753879b8f0f0d8219a1e4b187b88d3d791f",
    "fixer": "d92b46d65322b053699bdcc8e35a6f9d0c1c91d3dacccddbcfc569c673d7e96b",
    "tester": "e9774f5d6a718582b9871cfbf54519508c0f80424181f0bdeb35158b026fc2fd",
    "evaluator": "12a769a0868261e28299b5a7feef71626ea6e1ee51bfb0eb59ce65bbec05e6aa",
}
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
    "npm run test:public", "npm run build",
)
TESTER_COMMAND = "npm run check"
EVALUATOR_PUBLIC_COMMAND = "npm run test:public"
HIDDEN_ID = "permissions-playground-sealed-v2"
HIDDEN_COMMAND = "node sealed-hidden-suite/run.mjs"
HIDDEN_SHA256 = "a6f38c08eff3fd23fca3299f0777adbea4001d3ac3147272511ff9babd98a19b"
INVOCATION_ID = re.compile(r"^[0-9a-f]{32}$")


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
    for path, expected, label in (
        (CLI_SCHEMA_PATH, CLI_SCHEMA_SHA256, "CLI runtime schema"),
        (CLI_TEMPLATE_PATH, CLI_TEMPLATE_RAW_SHA256, "CLI runtime template"),
        (CLI_RUNNER_PATH, CLI_RUNNER_SHA256, "CLI builder runner"),
        (CANONICAL_PATH_HELPER_PATH, CANONICAL_PATH_HELPER_SHA256, "canonical path helper"),
        (ROLE_SCHEMA_PATH, ROLE_SCHEMA_SHA256, "role runtime schema"),
        (ROLE_TEMPLATE_PATH, ROLE_TEMPLATE_RAW_SHA256, "role runtime template"),
        (ROLE_RUNNER_PATH, ROLE_RUNNER_SHA256, "role runner"),
        (EVIDENCE_SCHEMA_PATH, EVIDENCE_SCHEMA_SHA256, "supervision evidence schema"),
        (EVIDENCE_TEMPLATE_PATH, EVIDENCE_TEMPLATE_RAW_SHA256, "supervision evidence template"),
        (PACKAGE_SCHEMA_PATH, PACKAGE_SCHEMA_SHA256, "blinded manifest schema"),
        (PACKAGE_TEMPLATE_PATH, PACKAGE_TEMPLATE_RAW_SHA256, "blinded manifest template"),
        (MAPPING_SCHEMA_PATH, MAPPING_SCHEMA_SHA256, "blinded mapping schema"),
        (MAPPING_TEMPLATE_PATH, MAPPING_TEMPLATE_RAW_SHA256, "blinded mapping template"),
        (PACKAGER_PATH, PACKAGER_SHA256, "blinded packager"),
        (NEUTRAL_PROMPT_PATH, BUILDER_PROMPT_SHA256, "neutral builder prompt"),
        (SMOKE_PROMPT_PATH, SMOKE_PROMPT_SHA256, "runner smoke prompt"),
        (BUILDER_CONFIG_PATH, BUILDER_CONFIG_SHA256, "builder config"),
        (BUILDER_ALLOWLIST_PATH, BUILDER_ALLOWLIST_SHA256, "builder input allowlist"),
        (BUILDER_MANIFEST_SCHEMA_PATH, BUILDER_MANIFEST_SCHEMA_SHA256, "builder manifest schema"),
        (BUILDER_PREPARER_PATH, BUILDER_PREPARER_SHA256, "builder input preparer"),
        *((path, digest, f"public bundle {path.name}")
          for path, digest in BUNDLE_EXTRA_HASHES.items()),
        *((path, MODEL_ROLE_PROMPT_SHA256[role], f"{role} prompt")
          for role, path in ROLE_PROMPT_PATHS.items()),
    ):
        try:
            raw = path.read_bytes()
        except OSError as exc:
            errors.append(f"bundled {label} unreadable: {exc}")
            continue
        require(hashlib.sha256(raw).hexdigest() == expected,
                f"bundled {label} raw bytes diverge", errors)
        if path.suffix == ".json":
            try:
                parsed = json.loads(raw.decode("utf-8"))
                if path == BUILDER_ALLOWLIST_PATH:
                    errors.extend(validate_builder_allowlist(parsed))
            except (UnicodeError, json.JSONDecodeError) as exc:
                errors.append(f"bundled {label} invalid JSON: {exc}")
        elif path == NEUTRAL_PROMPT_PATH:
            try:
                errors.extend(validate_neutral_builder_prompt(raw.decode("utf-8")))
            except UnicodeError as exc:
                errors.append(f"bundled {label} invalid UTF-8: {exc}")
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
        if role in MODEL_ROLES:
            require(contract.get("roles", {}).get(role, {}).get("executionRuntime") ==
                    "fresh-external-cli-subprocess",
                    f"canonical {role} CLI subprocess policy diverges", errors)
    require(contract.get("costPolicy", {}).get("maxTokens") is None and
            contract.get("costPolicy", {}).get("maxTokensUnavailableReasonRequired") is True,
            "canonical nullable maxTokens policy diverges", errors)
    require(contract.get("protocolVersion") == "2.7.0",
            "canonical protocol version diverges", errors)
    require(contract.get("builderFreeze") == {
        "promptSha256": BUILDER_PROMPT_SHA256,
        "smokePromptSha256": SMOKE_PROMPT_SHA256,
        "configSha256": BUILDER_CONFIG_SHA256,
        "rule": "each builder receives the exact raw prompt bytes and a byte-identical source-history-free neutral product projection; only opaque invocation ID and runtime coordinate paths differ",
        "inputProjection": {
            "allowlistPath": "experiment/builder-input-allowlist.json",
            "allowlistSha256": BUILDER_ALLOWLIST_SHA256,
            "manifestSchemaPath": "experiment/schemas/builder-input-manifest.schema.json",
            "manifestSchemaSha256": BUILDER_MANIFEST_SCHEMA_SHA256,
            "preparationScriptPath": "scripts/prepare-builder-input.mjs",
            "preparationScriptSha256": BUILDER_PREPARER_SHA256,
            "sourceRule": "private manifest binds the clean protocol source commit/tree; neither source nor manifest is builder input",
            "outputRule": "two fresh nonnested git-init repositories with identical one-root commit/tree, core.autocrlf=false, no remotes, and exact allowlisted bytes only",
        },
    }, "canonical builder prompt/config commitments diverge", errors)
    runtime = contract.get("cliRuntime", {})
    require(runtime.get("modelRoleCoverage") ==
            ["builder", "reviewer", "fixer", "tester", "evaluator"] and
            "every model-bearing role" in runtime.get("roleLaunchRule", ""),
            "canonical CLI runtime does not cover every model role", errors)
    role_runtime = runtime.get("roleRuntime", {})
    evaluation = contract.get("evaluation", {})
    require(runtime.get("launchCommand") == "pwsh -NoProfile -File" and
            runtime.get("powerShellHost") == {
                "path": PWSH_PATH, "version": PWSH_VERSION, "sha256": PWSH_SHA256,
            } and
            runtime.get("schemaSha256") == CLI_SCHEMA_SHA256 and
            runtime.get("runnerSha256") == CLI_RUNNER_SHA256 and
            runtime.get("canonicalPathHelperSha256") == CANONICAL_PATH_HELPER_SHA256 and
            runtime.get("binaryPath") == CLI_BINARY_PATH and
            runtime.get("binaryVersion") == CLI_VERSION and
            runtime.get("binarySha256") == CLI_BINARY_SHA256 and
            runtime.get("authStatus") == CLI_AUTH_STATUS and
            runtime.get("pinnedModel") == "gpt-5.4" and
            runtime.get("pinnedReasoning") == "xhigh" and
            runtime.get("invariantArgv") == list(CLI_INVARIANT_ARGV) and
            runtime.get("perInvocationArgv") == [
                "--add-dir", "<temp-root>", "--add-dir", "<cache-root>",
                "--add-dir", "<dependency-root>", "-C", "<workdir>",
                "-o", "<final-path>", "-"
            ] and
            runtime.get("candidateCommitScriptSha256") == COMMIT_HELPER_SHA256 and
            role_runtime.get("schemaSha256") == ROLE_SCHEMA_SHA256 and
            role_runtime.get("runnerSha256") == ROLE_RUNNER_SHA256 and
            role_runtime.get("evidenceSchemaSha256") == EVIDENCE_SCHEMA_SHA256 and
            role_runtime.get("promptTemplateSha256") == {
                role: MODEL_ROLE_PROMPT_SHA256[role]
                for role in ("reviewer", "fixer", "tester", "evaluator")
            } and
            role_runtime.get("artifactSchemaSha256") == ROLE_ARTIFACT_SCHEMA_SHA256 and
            evaluation.get("packageScriptSha256") == PACKAGER_SHA256 and
            evaluation.get("packageManifestSchemaSha256") == PACKAGE_SCHEMA_SHA256 and
            evaluation.get("packageMappingSchemaSha256") == MAPPING_SCHEMA_SHA256 and
            runtime.get("v4Evidence", {}).get("contractSha256") ==
            "d1a47087dc0bfcf85638e6c9faef4c7399c98626556747f1fda31e0a67e0645d",
            "canonical external CLI runtime contract diverges", errors)
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
        "packageLabel", "packageSha256", "evaluatorWorkerId", "runtimeInvocationId",
        "runtimeProcessId", "runtimeThreadId", "evaluationSequence", "revisionAllowed",
        "mappingGuess", "mappingGuessConfidence", "mappingGuessEvidence", "evaluatedAt", "sealedAt",
        "publicTests", "hiddenTests", "items", "sectionTotals", "uncappedTotal",
        "capConditions", "capsApplied", "finalTotal", "uncertainties", "evidenceHash",
    }
    if not exact_fields(value, fields, location, errors):
        return
    require(value.get("packageLabel") in {"X", "Y", "Z"}, f"{location}: invalid packageLabel", errors)
    require(valid_hash(value.get("packageSha256")), f"{location}: packageSha256 invalid", errors)
    require(isinstance(value.get("runtimeInvocationId"), str) and
            bool(INVOCATION_ID.fullmatch(value["runtimeInvocationId"])) and
            isinstance(value.get("runtimeProcessId"), int) and value["runtimeProcessId"] > 0 and
            nonempty(value.get("runtimeThreadId")), f"{location}: runtime identity invalid", errors)
    require(isinstance(value.get("evaluationSequence"), int) and 1 <= value["evaluationSequence"] <= 3 and
            value.get("revisionAllowed") is False and value.get("mappingGuess") in {"B0", "T0", "Tfinal", "unknown"} and
            isinstance(value.get("mappingGuessConfidence"), int) and
            0 <= value["mappingGuessConfidence"] <= 100 and
            nonempty(value.get("mappingGuessEvidence")), f"{location}: blinded sequence/guess invalid", errors)
    parse_time(value.get("sealedAt"), f"{location}.sealedAt", errors)
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


def lower_windows_path(value: str) -> str:
    return ntpath.normpath(value).casefold()


def nested_windows_path(left: str, right: str) -> bool:
    try:
        relative = ntpath.relpath(right, left)
    except (TypeError, ValueError):
        return False
    return relative in {"", "."} or (not relative.startswith("..") and not ntpath.isabs(relative))


def validate_neutral_builder_prompt(prompt_text: str) -> list[str]:
    required = (
        "The operator writes this entire file byte-for-byte to raw standard input for each fresh CLI execution.",
        "The CLI `-C` argument supplies the isolated checkout and is not model context.",
        "You are a neutral builder. Implement the Permissions Playground",
        "This repository is a source-history-free neutral product task projection",
        "No prefix, suffix, placeholder substitution, label, deadline timestamp, path wrapper, prompt-embedded runtime override, or added guidance is permitted.",
    )
    return [f"neutral builder runtime prose missing: {clause}"
            for clause in required if clause not in prompt_text]


def safe_projection_path(value: Any) -> bool:
    return (isinstance(value, str) and bool(value) and not value.startswith("/") and
            "\\" not in value and ".." not in value and
            not re.search(r"(^|/)(?:experiment|skills?|sealed-hidden-suite|evidence|role-artifacts?|\.git)(?:/|$)",
                          value, re.IGNORECASE))


def validate_builder_allowlist(value: Any) -> list[str]:
    errors: list[str] = []
    if not exact_fields(value, {"version", "files"}, "builderInputAllowlist", errors):
        return errors
    require(value.get("version") == "1.0.0", "builderInputAllowlist: version diverges", errors)
    files = value.get("files")
    require(isinstance(files, list) and bool(files), "builderInputAllowlist: files required", errors)
    sources: list[str] = []
    destinations: list[str] = []
    if isinstance(files, list):
        for index, item in enumerate(files):
            location = f"builderInputAllowlist.files[{index}]"
            if not exact_fields(item, {"source", "destination"}, location, errors):
                continue
            source, destination = item.get("source"), item.get("destination")
            require(isinstance(source, str) and bool(source) and not source.startswith("/") and
                    "\\" not in source and ".." not in source,
                    f"{location}: unsafe source", errors)
            require(safe_projection_path(destination), f"{location}: unsafe destination", errors)
            sources.append(str(source))
            destinations.append(str(destination))
    require(len(sources) == len(set(sources)) and len(destinations) == len(set(destinations)),
            "builderInputAllowlist: duplicate source or destination", errors)
    return errors


def validate_builder_input_manifest(value: Any) -> list[str]:
    errors: list[str] = []
    fields = {"version", "sourceCommit", "sourceTree", "allowlistSha256",
              "projectionSha256", "projectionCommit", "projectionTree", "files"}
    if not exact_fields(value, fields, "builderInputManifest", errors):
        return errors
    require(value.get("version") == "1.0.0" and
            valid_hash(value.get("sourceCommit"), HEX40) and
            valid_hash(value.get("sourceTree"), HEX40) and
            value.get("allowlistSha256") == BUILDER_ALLOWLIST_SHA256 and
            valid_hash(value.get("projectionCommit"), HEX40) and
            valid_hash(value.get("projectionTree"), HEX40),
            "builderInputManifest: version/source/projection binding invalid", errors)
    files = value.get("files")
    require(isinstance(files, list) and bool(files), "builderInputManifest: files required", errors)
    records: list[dict[str, Any]] = []
    if isinstance(files, list):
        for index, item in enumerate(files):
            location = f"builderInputManifest.files[{index}]"
            if not exact_fields(item, {"path", "sha256", "bytes"}, location, errors):
                continue
            require(safe_projection_path(item.get("path")) and valid_hash(item.get("sha256")) and
                    isinstance(item.get("bytes"), int) and not isinstance(item.get("bytes"), bool) and
                    item.get("bytes", -1) >= 0,
                    f"{location}: unsafe path/hash/size", errors)
            records.append(item)
    paths = [str(item.get("path")) for item in records]
    require(paths == sorted(paths, key=lambda item: item.encode("utf-8")) and
            len(paths) == len(set(paths)),
            "builderInputManifest: file records must be unique UTF-8 sorted", errors)
    material = "".join(f"{item.get('path')}\0{item.get('sha256')}\0{item.get('bytes')}\n"
                       for item in records).encode("utf-8")
    require(value.get("projectionSha256") == hashlib.sha256(material).hexdigest(),
            "builderInputManifest: aggregate projection hash mismatch", errors)
    return errors


CLI_CONTRACT_FIELDS = (
    "contractVersion", "cliPath", "cliVersion", "cliSha256", "authStatus",
    "lockPath", "lockSha256", "contractSchemaPath", "contractSchemaSha256",
    "canonicalPathHelperPath", "canonicalPathHelperSha256",
    "sourceCommonStartCommit", "sourceCommonStartTree", "commonStartCommit", "commonStartTree",
    "builderInputManifestPath", "builderInputManifestSha256",
    "builderInputManifestSchemaPath", "builderInputManifestSchemaSha256",
    "builderInputAllowlistPath", "builderInputAllowlistSha256",
    "builderInputPreparationScriptPath", "builderInputPreparationScriptSha256",
    "builderInputProjectionSha256", "promptPath", "promptSha256",
    "evidenceRoot", "deadlineSeconds", "invariantArgv", "smokeMode", "invocations",
)
CLI_INVOCATION_FIELDS = (
    "invocationId", "workdir", "finalPath", "stdoutPath", "stderrPath",
    "evidencePath", "postStatePath", "tempRoot", "cacheRoot", "dependencyRoot", "port",
)


def validate_cli_runtime_contract(contract: Any) -> list[str]:
    errors: list[str] = []
    if not exact_fields(contract, CLI_CONTRACT_FIELDS, "cliRuntimeContract", errors):
        return errors
    require(contract.get("contractVersion") == "1.0.0",
            "cliRuntimeContract: contractVersion diverges", errors)
    require(contract.get("cliPath") == CLI_BINARY_PATH and
            contract.get("cliVersion") == CLI_VERSION and
            contract.get("cliSha256") == CLI_BINARY_SHA256,
            "CLI binary path/version/hash commitment mismatch", errors)
    require(contract.get("authStatus") == CLI_AUTH_STATUS,
            "CLI ChatGPT auth attestation mismatch", errors)
    require(valid_hash(contract.get("lockSha256")) and
            contract.get("contractSchemaSha256") == CLI_SCHEMA_SHA256 and
            contract.get("canonicalPathHelperSha256") == CANONICAL_PATH_HELPER_SHA256 and
            valid_hash(contract.get("sourceCommonStartCommit"), HEX40) and contract.get("sourceCommonStartCommit") != "0" * 40 and
            valid_hash(contract.get("sourceCommonStartTree"), HEX40) and contract.get("sourceCommonStartTree") != "0" * 40 and
            valid_hash(contract.get("commonStartCommit"), HEX40) and contract.get("commonStartCommit") != "0" * 40 and
            valid_hash(contract.get("commonStartTree"), HEX40) and contract.get("commonStartTree") != "0" * 40,
            "CLI lock/schema/common-start binding mismatch", errors)
    require(contract.get("sourceCommonStartCommit") != contract.get("commonStartCommit") and
            contract.get("sourceCommonStartTree") != contract.get("commonStartTree"),
            "CLI source and projected common-start bindings must remain distinct", errors)
    require(contract.get("builderInputManifestSchemaSha256") == BUILDER_MANIFEST_SCHEMA_SHA256 and
            contract.get("builderInputAllowlistSha256") == BUILDER_ALLOWLIST_SHA256 and
            contract.get("builderInputPreparationScriptSha256") == BUILDER_PREPARER_SHA256 and
            valid_hash(contract.get("builderInputManifestSha256")) and
            valid_hash(contract.get("builderInputProjectionSha256")),
            "CLI builder input projection commitment mismatch", errors)
    for field in ("lockPath", "contractSchemaPath", "canonicalPathHelperPath", "evidenceRoot",
                  "builderInputManifestPath", "builderInputManifestSchemaPath",
                  "builderInputAllowlistPath", "builderInputPreparationScriptPath"):
        require(nonempty(contract.get(field)), f"CLI {field} required", errors)
    require(nonempty(contract.get("promptPath")), "CLI promptPath required", errors)
    expected_prompt = SMOKE_PROMPT_SHA256 if contract.get("smokeMode") else BUILDER_PROMPT_SHA256
    require(contract.get("promptSha256") == expected_prompt,
            "CLI raw stdin prompt commitment mismatch", errors)
    deadline = contract.get("deadlineSeconds")
    require(isinstance(deadline, int) and not isinstance(deadline, bool) and
            1 <= deadline <= 2400, "CLI external deadline invalid", errors)
    argv = contract.get("invariantArgv")
    require(argv == list(CLI_INVARIANT_ARGV),
            "CLI invariant argv or global-before-exec ordering mismatch", errors)
    if isinstance(argv, list):
        require("--ephemeral" in argv and "resume" not in argv,
                "CLI runtime must be ephemeral and never resumed", errors)
        require(argv[2:6] == ["-m", "gpt-5.4", "-c", 'model_reasoning_effort="xhigh"'],
                "CLI model/reasoning pins or ordering diverge", errors)
    require(isinstance(contract.get("smokeMode"), bool),
            "CLI smokeMode must be boolean", errors)
    invocations = contract.get("invocations")
    if not isinstance(invocations, list) or len(invocations) != 2:
        errors.append("CLI runtime requires exactly two invocations")
        return errors
    for index, invocation in enumerate(invocations):
        location = f"cliRuntimeContract.invocations[{index}]"
        if not exact_fields(invocation, CLI_INVOCATION_FIELDS, location, errors):
            continue
        require(isinstance(invocation.get("invocationId"), str) and
                bool(INVOCATION_ID.fullmatch(invocation["invocationId"])),
                f"{location}: invocationId invalid", errors)
        for field in CLI_INVOCATION_FIELDS[1:-1]:
            require(isinstance(invocation.get(field), str) and len(invocation[field]) >= 3,
                    f"{location}: {field} invalid", errors)
        require(isinstance(invocation.get("port"), int) and
                1024 <= invocation.get("port", 0) <= 65535,
                f"{location}: port invalid", errors)
    if all(isinstance(item, dict) for item in invocations):
        for field in CLI_INVOCATION_FIELDS:
            values = [str(item.get(field)).casefold() for item in invocations]
            require(len(set(values)) == 2, f"CLI invocations duplicate {field}", errors)
        workdirs = [lower_windows_path(item["workdir"]) for item in invocations]
        require(not nested_windows_path(workdirs[0], workdirs[1]) and
                not nested_windows_path(workdirs[1], workdirs[0]),
                "CLI workdirs must be distinct and nonnested", errors)
        root = lower_windows_path(str(contract.get("evidenceRoot", "")))
        outputs: list[str] = []
        runtime_roots: list[str] = []
        for index, invocation in enumerate(invocations):
            for field in ("finalPath", "stdoutPath", "stderrPath", "evidencePath", "postStatePath"):
                value = lower_windows_path(invocation[field])
                outputs.append(value)
                require(nested_windows_path(root, lower_windows_path(invocation[field])) and
                        not nested_windows_path(workdirs[index], lower_windows_path(invocation[field])),
                        f"CLI invocation {index} {field} escapes evidence isolation", errors)
            for field in ("tempRoot", "cacheRoot", "dependencyRoot"):
                value = lower_windows_path(invocation[field])
                runtime_roots.append(value)
                require(not nested_windows_path(root, value) and not nested_windows_path(value, root) and
                        all(not nested_windows_path(workdir, value) and
                            not nested_windows_path(value, workdir) for workdir in workdirs),
                        f"CLI invocation {index} {field} must be external and nonnested", errors)
        mutable = [root, *workdirs, *outputs, *runtime_roots]
        private_inputs = [lower_windows_path(str(contract[field])) for field in (
            "lockPath", "contractSchemaPath", "canonicalPathHelperPath", "builderInputManifestPath",
            "builderInputManifestSchemaPath", "builderInputAllowlistPath",
            "builderInputPreparationScriptPath", "promptPath")]
        require(all(not nested_windows_path(private, target) and
                    not nested_windows_path(target, private)
                    for private in private_inputs for target in mutable),
                "CLI private inputs must be external to every mutable path", errors)
        require(all(not nested_windows_path(left, right) and not nested_windows_path(right, left)
                    for index, left in enumerate(runtime_roots)
                    for right in runtime_roots[index + 1:]),
                "CLI runtime roots must be pairwise nonnested", errors)
        require(all(not nested_windows_path(left, right) and not nested_windows_path(right, left)
                    for index, left in enumerate(outputs)
                    for right in outputs[index + 1:]),
                "CLI authoritative outputs must be pairwise nonnested", errors)
    return errors


SUPERVISION_BASE_FIELDS = (
    "role", "invocationId", "contractSha256", "artifactSchemaSha256", "processId",
    "started", "startedAt", "startError", "stdinDelivered", "stdinError", "exitCode",
    "timedOut", "argv", "argvSha256", "promptSha256", "stdoutPath", "stdoutSha256",
    "stderrPath", "stderrSha256", "finalPath", "finalSha256", "finalSchemaValid",
    "artifactBindingValid", "threadIds", "turnCompleted", "rawJsonlValid",
    "inputCommit", "supervisorCommit", "supervisorCommitTree",
    "supervisorCommitScriptSha256", "supervisorCommitError",
    "unauthorizedToolOrWriteDetected", "unauthorizedToolOrWriteUnavailableReason",
    "sandboxMode", "inputDisposition", "isolationEnforcedBy", "usage",
    "usageUnavailableReason", "runtimeModel", "runtimeModelUnavailableReason",
    "runtimeProvider", "runtimeProviderUnavailableReason", "reasoningSetting",
    "reasoningSettingUnavailableReason", "metadataSource",
)


def parse_jsonl(raw: Any, location: str, errors: list[str]) -> list[dict[str, Any]]:
    if not isinstance(raw, str):
        errors.append(f"{location}: raw JSONL required")
        return []
    events: list[dict[str, Any]] = []
    for index, line in enumerate(line for line in raw.splitlines() if line.strip()):
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            errors.append(f"{location}: malformed JSONL line {index + 1}")
            continue
        if not isinstance(event, dict):
            errors.append(f"{location}: JSONL event must be an object")
        else:
            events.append(event)
    return events


def validate_supervision_result(result: Any, invocation: dict[str, Any], raw: Any,
                                location: str, role: str = "builder") -> list[str]:
    errors: list[str] = []
    expected_fields = (*SUPERVISION_BASE_FIELDS,
                       *(('postStatePath', 'postStateSha256') if role == 'builder' else
                         ('completedAt', 'completionObservedAt', 'absoluteDeadline')))
    if not exact_fields(result, expected_fields, location, errors):
        return errors
    expected_sandbox = "workspace-write" if role != "reviewer" else "read-only"
    expected_disposition = {
        "builder": "authorized-worktree-write", "reviewer": "read-only-snapshot",
        "fixer": "authorized-worktree-write", "tester": "discard-after-run",
        "evaluator": "discard-after-run",
    }[role]
    require(result.get("role") == role and result.get("invocationId") == invocation.get("invocationId"),
            f"{location}: role/invocation binding mismatch", errors)
    require(valid_hash(result.get("contractSha256")) and
            (role == "builder" and result.get("artifactSchemaSha256") is None or
             role != "builder" and result.get("artifactSchemaSha256") == ROLE_ARTIFACT_SCHEMA_SHA256[role]),
            f"{location}: contract/artifact schema hash invalid", errors)
    require(isinstance(result.get("processId"), int) and result["processId"] > 0,
            f"{location}: processId invalid", errors)
    require(result.get("started") is True and result.get("startError") is None and
            result.get("stdinDelivered") is True and result.get("stdinError") is None and
            result.get("exitCode") == 0 and result.get("timedOut") is False,
            f"{location}: process lifecycle invalid", errors)
    expected_argv = [*CLI_INVARIANT_ARGV[:-3], "--sandbox", expected_sandbox, "--json",
                     "--add-dir", invocation.get("tempRoot"),
                     "--add-dir", invocation.get("cacheRoot"),
                     "--add-dir", invocation.get("dependencyRoot"),
                     "-C", invocation.get("workdir"), "-o", invocation.get("finalPath"), "-"]
    require(result.get("argv") == expected_argv,
            f"{location}: argv ordering or pin mismatch", errors)
    if isinstance(result.get("argv"), list):
        require(result.get("argvSha256") == sha256_text("\0".join(result["argv"])),
                f"{location}: argv hash mismatch", errors)
    require((role == "builder" and result.get("promptSha256") == BUILDER_PROMPT_SHA256) or
            (role != "builder" and valid_hash(result.get("promptSha256")) and
             result.get("promptSha256") != "0" * 64),
            f"{location}: prompt hash invalid", errors)
    bound_paths = ("stdoutPath", "stderrPath", "finalPath",
                   *(('postStatePath',) if role == 'builder' else ()))
    for field in bound_paths:
        require(lower_windows_path(str(result.get(field))) ==
                lower_windows_path(str(invocation.get(field))),
                f"{location}: {field} binding mismatch", errors)
    events = parse_jsonl(raw, location, errors)
    if isinstance(raw, str):
        require(result.get("stdoutSha256") == sha256_text(raw),
                f"{location}: raw stdout hash mismatch", errors)
    require(valid_hash(result.get("stderrSha256")) and valid_hash(result.get("finalSha256")) and
            (role != "builder" or (valid_hash(result.get("postStateSha256")) and
                                   result.get("postStateSha256") != "0" * 64)),
            f"{location}: stderr/final hash invalid", errors)
    require(result.get("supervisorCommitScriptSha256") == COMMIT_HELPER_SHA256 and
            result.get("inputCommit") == invocation.get("inputCommit", invocation.get("commonStartCommit")) and
            ((role in {"builder", "fixer"} and valid_hash(result.get("supervisorCommit"), HEX40) and
              valid_hash(result.get("supervisorCommitTree"), HEX40) and
              result.get("supervisorCommitError") is None) or
             (role not in {"builder", "fixer"} and result.get("supervisorCommit") is None and
              result.get("supervisorCommitTree") is None and result.get("supervisorCommitError") is None)),
            f"{location}: supervisor commit binding invalid", errors)
    if role != "builder":
        started_at = parse_time(result.get("startedAt"), f"{location}.startedAt", errors)
        completed_at = parse_time(result.get("completedAt"), f"{location}.completedAt", errors)
        observed_at = parse_time(result.get("completionObservedAt"), f"{location}.completionObservedAt", errors)
        deadline_at = parse_time(result.get("absoluteDeadline"), f"{location}.absoluteDeadline", errors)
        if all(value is not None for value in (started_at, completed_at, observed_at, deadline_at)):
            require(started_at <= completed_at <= deadline_at,
                    f"{location}: process completion exceeds absolute deadline", errors)
            require(completed_at <= observed_at and
                    (observed_at - deadline_at).total_seconds() <= 2,
                    f"{location}: completion observation chronology invalid", errors)
    threads = [event.get("thread_id") for event in events if event.get("type") == "thread.started"]
    turns = [event for event in events if event.get("type") == "turn.completed"]
    require(result.get("threadIds") == threads and len(threads) == 1,
            f"{location}: exactly one reconciled thread.started required", errors)
    require(result.get("turnCompleted") is True and len(turns) == 1 and
            result.get("rawJsonlValid") is True,
            f"{location}: turn lifecycle or JSONL reconciliation invalid", errors)
    usage = turns[0].get("usage") if len(turns) == 1 else None
    require(result.get("usage") == usage,
            f"{location}: usage must equal trusted turn.completed usage", errors)
    require((usage is not None and result.get("usageUnavailableReason") is None) or
            (usage is None and nonempty(result.get("usageUnavailableReason"))),
            f"{location}: missing usage treatment", errors)
    require(result.get("sandboxMode") == expected_sandbox and
            result.get("inputDisposition") == expected_disposition and
            result.get("isolationEnforcedBy") == "audited-procedural-boundary-plus-cli-sandbox",
            f"{location}: procedural isolation policy mismatch", errors)
    require(result.get("unauthorizedToolOrWriteDetected") is not True and
            (result.get("unauthorizedToolOrWriteDetected") is False or
             nonempty(result.get("unauthorizedToolOrWriteUnavailableReason"))),
            f"{location}: unauthorized write/tool evidence invalid", errors)
    for field in ("runtimeModel", "runtimeProvider", "reasoningSetting"):
        reason = result.get(f"{field}UnavailableReason")
        require((result.get(field) is not None and reason is None) or
                (result.get(field) is None and nonempty(reason)),
                f"{location}: {field} requires trusted value or absence reason", errors)
    require(result.get("metadataSource") in {"trusted-jsonl", "unavailable"},
            f"{location}: metadata source invalid", errors)
    if result.get("runtimeModel") is not None:
        require(result.get("runtimeModel") == "gpt-5.4",
                f"{location}: trusted runtime model conflicts with pin", errors)
    if result.get("reasoningSetting") is not None:
        require(result.get("reasoningSetting") == "xhigh",
                f"{location}: trusted reasoning setting conflicts with pin", errors)
    if result.get("runtimeProvider") is not None:
        require("openai" in str(result.get("runtimeProvider")).casefold(),
                f"{location}: trusted runtime provider conflicts with pin", errors)
    return errors


def validate_builder_supervision(evidence: Any, contract: Any, stdout_by_id: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(evidence, dict) or set(evidence) != {"valid", "results"}:
        return ["cliRuntimeEvidence: exact valid/results object required"]
    require(evidence.get("valid") is True, "cliRuntimeEvidence: valid must be true", errors)
    results = evidence.get("results")
    invocations = contract.get("invocations", []) if isinstance(contract, dict) else []
    require(isinstance(results, list) and len(results) == 2,
            "cliRuntimeEvidence: exactly two results required", errors)
    require(isinstance(stdout_by_id, dict) and
            set(stdout_by_id) == {item.get("invocationId") for item in invocations if isinstance(item, dict)},
            "cliRuntimeStdoutByInvocation: exact invocation coverage required", errors)
    if isinstance(results, list) and len(invocations) == 2:
        for index, result in enumerate(results):
            raw = stdout_by_id.get(result.get("invocationId")) if isinstance(stdout_by_id, dict) and isinstance(result, dict) else None
            invocation = {**invocations[index], "inputCommit": contract.get("commonStartCommit")}
            errors.extend(validate_supervision_result(result, invocation, raw,
                                                     f"cliRuntimeEvidence.results[{index}]"))
        process_ids = [item.get("processId") for item in results if isinstance(item, dict)]
        thread_ids = [item.get("threadIds", [None])[0] for item in results
                      if isinstance(item, dict) and len(item.get("threadIds", [])) == 1]
        require(len(set(process_ids)) == 2, "builder supervision duplicates process IDs", errors)
        require(len(thread_ids) == 2 and len(set(thread_ids)) == 2,
                "builder supervision duplicates thread IDs", errors)
        require(len({item.get("promptSha256") for item in results if isinstance(item, dict)}) == 1,
                "builder supervision prompt bytes differ", errors)
    return errors


ROLE_POLICIES = {
    "reviewer": (900, "read-only", "read-only-snapshot"),
    "fixer": (1500, "workspace-write", "authorized-worktree-write"),
    "tester": (900, "workspace-write", "discard-after-run"),
    "evaluator": (1800, "workspace-write", "discard-after-run"),
}
ROLE_SUBSTITUTIONS = {
    "reviewer": {"CANDIDATE_LABEL", "CYCLE_NUMBER", "SNAPSHOT_COMMIT", "WALL_CLOCK_DEADLINE_ISO"},
    "fixer": {"CANDIDATE_LABEL", "CYCLE_NUMBER", "SNAPSHOT_COMMIT", "FINDINGS_PATH", "WALL_CLOCK_DEADLINE_ISO"},
    "tester": {"CANDIDATE_LABEL", "CYCLE_NUMBER", "SNAPSHOT_COMMIT", "WALL_CLOCK_DEADLINE_ISO"},
    "evaluator": {"PACKAGE_LABEL", "PACKAGE_PATH", "EVALUATION_SEQUENCE", "RUBRIC_PATH",
                  "EVALUATION_SCHEMA_PATH", "HIDDEN_SUITE_PATH", "HIDDEN_SUITE_SHA256",
                  "WALL_CLOCK_DEADLINE_ISO"},
}


def validate_role_runtime_contract(contract: Any) -> list[str]:
    errors: list[str] = []
    try:
        expected_fields = set(load_json(ROLE_SCHEMA_PATH)["required"])
    except (OSError, KeyError, json.JSONDecodeError):
        return ["bundled role schema required fields unreadable"]
    if not exact_fields(contract, expected_fields, "roleRuntimeContract", errors):
        return errors
    role = contract.get("role")
    require(role in ROLE_POLICIES, "roleRuntimeContract: unsupported model role", errors)
    if role not in ROLE_POLICIES:
        return errors
    maximum, sandbox, disposition = ROLE_POLICIES[role]
    require(contract.get("contractVersion") == "1.0.0" and
            contract.get("cliPath") == CLI_BINARY_PATH and
            contract.get("cliVersion") == CLI_VERSION and
            contract.get("cliSha256") == CLI_BINARY_SHA256 and
            contract.get("authStatus") == CLI_AUTH_STATUS,
            "roleRuntimeContract: CLI/auth commitment mismatch", errors)
    require(contract.get("contractSchemaSha256") == ROLE_SCHEMA_SHA256 and
            contract.get("canonicalPathHelperSha256") == CANONICAL_PATH_HELPER_SHA256 and
            contract.get("runnerSha256") == ROLE_RUNNER_SHA256 and
            contract.get("evidenceSchemaSha256") == EVIDENCE_SCHEMA_SHA256 and
            contract.get("promptTemplateSha256") == MODEL_ROLE_PROMPT_SHA256[role] and
            contract.get("artifactSchemaSha256") == ROLE_ARTIFACT_SCHEMA_SHA256[role],
            "roleRuntimeContract: frozen runner/prompt/evidence/artifact binding mismatch", errors)
    require(isinstance(contract.get("deadlineSeconds"), int) and
            1 <= contract.get("deadlineSeconds", 0) <= maximum and
            contract.get("sandboxMode") == sandbox and
            contract.get("inputDisposition") == disposition,
            "roleRuntimeContract: budget or isolation policy mismatch", errors)
    require(isinstance(contract.get("invocationId"), str) and
            bool(INVOCATION_ID.fullmatch(contract["invocationId"])),
            "roleRuntimeContract: invocationId invalid", errors)
    substitutions = contract.get("promptSubstitutions")
    require(isinstance(substitutions, dict) and set(substitutions) == ROLE_SUBSTITUTIONS[role],
            "roleRuntimeContract: substitution keys diverge", errors)
    if isinstance(substitutions, dict):
        require(all(nonempty(value) and "\n" not in value and "\r" not in value and "{{" not in value
                    for value in substitutions.values()),
                "roleRuntimeContract: substitutions must be bounded single-line literals", errors)
    require(valid_hash(contract.get("promptSha256")),
            "roleRuntimeContract: rendered prompt hash invalid", errors)
    deadline_text = substitutions.get("WALL_CLOCK_DEADLINE_ISO") if isinstance(substitutions, dict) else None
    deadline_value = parse_time(deadline_text, "roleRuntimeContract.WALL_CLOCK_DEADLINE_ISO", errors)
    require(deadline_value is not None and deadline_value.utcoffset() is not None and
            deadline_value.utcoffset().total_seconds() == 0,
            "roleRuntimeContract: absolute deadline must be strict UTC", errors)
    for field in ("lockPath", "contractSchemaPath", "canonicalPathHelperPath", "runnerPath", "evidenceSchemaPath",
                  "promptTemplatePath", "artifactSchemaPath", "promptPath", "workdir",
                  "evidenceRoot", "finalPath", "stdoutPath", "stderrPath", "evidencePath",
                  "tempRoot", "cacheRoot", "dependencyRoot"):
        require(nonempty(contract.get(field)), f"roleRuntimeContract: {field} required", errors)
    root = lower_windows_path(str(contract.get("evidenceRoot", "")))
    workdir = lower_windows_path(str(contract.get("workdir", "")))
    require(not nested_windows_path(root, workdir) and not nested_windows_path(workdir, root),
            "roleRuntimeContract: evidence and input must be separate and nonnested", errors)
    outputs = [lower_windows_path(str(contract.get(field, "")))
               for field in ("finalPath", "stdoutPath", "stderrPath", "evidencePath")]
    runtime_roots = [lower_windows_path(str(contract.get(field, "")))
                     for field in ("tempRoot", "cacheRoot", "dependencyRoot")]
    for field in ("finalPath", "stdoutPath", "stderrPath", "evidencePath"):
        require(nested_windows_path(root, lower_windows_path(str(contract.get(field, "")))),
                f"roleRuntimeContract: {field} escapes evidence root", errors)
    require(all(not nested_windows_path(root, value) and not nested_windows_path(value, root) and
                not nested_windows_path(workdir, value) and not nested_windows_path(value, workdir)
                for value in runtime_roots),
            "roleRuntimeContract: runtime roots must be external", errors)
    require(all(not nested_windows_path(left, right) and not nested_windows_path(right, left)
                for index, left in enumerate(runtime_roots)
                for right in runtime_roots[index + 1:]),
            "roleRuntimeContract: runtime roots must be pairwise nonnested", errors)
    private_paths = [lower_windows_path(str(contract[field])) for field in (
        "lockPath", "contractSchemaPath", "canonicalPathHelperPath", "runnerPath",
        "evidenceSchemaPath", "promptTemplatePath", "artifactSchemaPath", "promptPath")]
    private_paths.extend(lower_windows_path(str(contract[field])) for field in (
        "handoffPath", "packageManifestPath", "rubricPath", "hiddenSuitePath",
        "packageManifestSchemaPath", "packageScriptPath") if nonempty(contract.get(field)))
    mutable = [root, workdir, *outputs, *runtime_roots]
    require(all(not nested_windows_path(private, target) and
                not nested_windows_path(target, private)
                for private in private_paths for target in mutable),
            "roleRuntimeContract: private inputs overlap mutable paths", errors)
    if role == "evaluator":
        require(contract.get("candidateLabel") is None and contract.get("cycle") is None and
                isinstance(contract.get("evaluationSequence"), int) and 1 <= contract["evaluationSequence"] <= 3 and
                contract.get("inputCommit") is None and contract.get("inputTree") is None,
                "roleRuntimeContract: evaluator identity/history fields invalid", errors)
        require(contract.get("packageLabel") in {"X", "Y", "Z"} and
                valid_hash(contract.get("packageSha256")) and
                contract.get("packageManifestSchemaSha256") == PACKAGE_SCHEMA_SHA256 and
                contract.get("packageScriptSha256") == PACKAGER_SHA256 and
                contract.get("rubricSha256") == "f0f4b5b918a9a50183455bf237a90706dcac58ce3cf708996bdc9ceb3b0978ef" and
                contract.get("hiddenSuiteId") == HIDDEN_ID and
                contract.get("hiddenSuiteSha256") == HIDDEN_SHA256,
                "roleRuntimeContract: evaluator package/rubric/hidden bindings diverge", errors)
    else:
        require(isinstance(contract.get("candidateLabel"), str) and
                bool(re.fullmatch(r"candidate-[a-z0-9-]+", contract["candidateLabel"])) and
                isinstance(contract.get("cycle"), int) and 1 <= contract["cycle"] <= 5 and
                contract.get("evaluationSequence") is None and
                valid_hash(contract.get("inputCommit"), HEX40) and valid_hash(contract.get("inputTree"), HEX40),
                "roleRuntimeContract: candidate/cycle/input binding invalid", errors)
        for field in ("packageManifestPath", "packageManifestSha256", "packageLabel", "packageSha256",
                      "rubricPath", "rubricSha256", "hiddenSuiteId", "hiddenSuitePath",
                      "hiddenSuiteSha256", "packageManifestSchemaPath", "packageManifestSchemaSha256",
                      "packageScriptPath", "packageScriptSha256"):
            require(contract.get(field) is None,
                    f"roleRuntimeContract: {role} must not receive evaluator field {field}", errors)
    require((role == "fixer" and nonempty(contract.get("handoffPath")) and
             valid_hash(contract.get("handoffSha256"))) or
            (role != "fixer" and contract.get("handoffPath") is None and
             contract.get("handoffSha256") is None),
            "roleRuntimeContract: fixer handoff binding invalid", errors)
    return errors


def validate_role_supervision_evidence(result: Any, contract: Any, raw: Any) -> list[str]:
    errors = validate_role_runtime_contract(contract)
    if errors or not isinstance(contract, dict):
        return errors
    invocation = {field: contract.get(field) for field in CLI_INVOCATION_FIELDS}
    invocation["inputCommit"] = contract.get("inputCommit")
    errors.extend(validate_supervision_result(result, invocation, raw, "roleSupervisionEvidence",
                                             contract["role"]))
    if isinstance(result, dict):
        require(result.get("artifactSchemaSha256") == contract.get("artifactSchemaSha256") and
                result.get("finalSchemaValid") is True and result.get("artifactBindingValid") is True and
                valid_hash(result.get("finalSha256")),
                "roleSupervisionEvidence: final artifact schema/binding invalid", errors)
    return errors


def validate_blinded_mapping(mapping: Any) -> list[str]:
    errors: list[str] = []
    fields = {"mappingSeedSha256", "randomizedOrder", "frozenGateSetSha256", "provenance", "packages"}
    if not exact_fields(mapping, fields, "blindedMapping", errors):
        return errors
    require(valid_hash(mapping.get("mappingSeedSha256")) and
            valid_hash(mapping.get("frozenGateSetSha256")),
            "blindedMapping: seed/gate hash invalid", errors)
    order = mapping.get("randomizedOrder")
    require(isinstance(order, list) and len(order) == 3 and set(order) == {"X", "Y", "Z"},
            "blindedMapping: randomizedOrder must be an X/Y/Z permutation", errors)
    provenance = mapping.get("provenance")
    provenance_fields = {"candidateIds", "runIds", "evidencePaths", "roleArtifactNames"}
    if exact_fields(provenance, provenance_fields, "blindedMapping.provenance", errors):
        for field in provenance_fields:
            values = provenance.get(field)
            require(isinstance(values, list) and bool(values) and len(values) == len(set(values)) and
                    all(nonempty(item) for item in values),
                    f"blindedMapping.provenance.{field}: unique nonempty values required", errors)
    packages = mapping.get("packages")
    require(isinstance(packages, list) and len(packages) == 3,
            "blindedMapping: exactly three packages required", errors)
    if isinstance(packages, list):
        require([item.get("packageLabel") for item in packages if isinstance(item, dict)] == order,
                "blindedMapping: package order must equal randomizedOrder", errors)
        require({item.get("sourceRole") for item in packages if isinstance(item, dict)} == {"B0", "T0", "Tfinal"},
                "blindedMapping: source roles must be exact B0/T0/Tfinal set", errors)
        for index, package in enumerate(packages):
            location = f"blindedMapping.packages[{index}]"
            if not exact_fields(package, {"packageLabel", "sourceRole", "sourcePath", "sourceRef",
                                          "sourceCommit", "sourceTree"}, location, errors):
                continue
            require(nonempty(package.get("sourcePath")) and
                    isinstance(package.get("sourceRef"), str) and package["sourceRef"].startswith("refs/") and
                    valid_hash(package.get("sourceCommit"), HEX40) and
                    valid_hash(package.get("sourceTree"), HEX40),
                    f"{location}: source provenance invalid", errors)
    return errors


def validate_blinded_manifest(manifest: Any, order: list[str] | None = None) -> list[str]:
    errors: list[str] = []
    fields = {"manifestVersion", "mappingSeedSha256", "randomizedOrder", "frozenGateSetSha256",
              "packages", "sanitizationPolicySha256"}
    if not exact_fields(manifest, fields, "blindedPackageManifest", errors):
        return errors
    require(manifest.get("manifestVersion") == "1.0.0" and
            valid_hash(manifest.get("mappingSeedSha256")) and
            valid_hash(manifest.get("frozenGateSetSha256")) and
            valid_hash(manifest.get("sanitizationPolicySha256")),
            "blindedPackageManifest: version/hash commitments invalid", errors)
    randomized = manifest.get("randomizedOrder")
    require(isinstance(randomized, list) and len(randomized) == 3 and set(randomized) == {"X", "Y", "Z"} and
            (order is None or randomized == order),
            "blindedPackageManifest: randomized order invalid", errors)
    packages = manifest.get("packages")
    require(isinstance(packages, list) and len(packages) == 3,
            "blindedPackageManifest: exactly three packages required", errors)
    if isinstance(packages, list):
        require([item.get("packageLabel") for item in packages if isinstance(item, dict)] == randomized,
                "blindedPackageManifest: package order mismatch", errors)
        for index, package in enumerate(packages):
            location = f"blindedPackageManifest.packages[{index}]"
            if not exact_fields(package, {"packageLabel", "packageSha256", "fileCount", "historyFree",
                                          "lineageScanPassed", "timestampsNormalized"}, location, errors):
                continue
            require(valid_hash(package.get("packageSha256")) and package.get("packageSha256") != "0" * 64 and
                    isinstance(package.get("fileCount"), int) and package["fileCount"] > 0 and
                    package.get("historyFree") is True and package.get("lineageScanPassed") is True and
                    package.get("timestampsNormalized") is True,
                    f"{location}: package seal invalid", errors)
    forbidden = {"sourceRole", "sourceRef", "sourceCommit", "sourceTree", "sourcePath", "provenance"}
    require(not any(isinstance(item, dict) and forbidden.intersection(item) for item, _ in walk_values(manifest)),
            "blindedPackageManifest: evaluator-facing manifest leaks provenance", errors)
    return errors


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
    require(fixture.get("protocolVersion") == "2.7.0", "run: protocolVersion diverges", errors)
    if fixture.get("status") == "invalid":
        invalid_fields = {
            "fixtureVersion", "fixtureKind", "protocolVersion",
            "status", "activeInvalidation", "invalidAttempts", "evaluations", "outcome",
        }
        exact_fields(fixture, invalid_fields, "run", errors)
        require(fixture.get("fixtureKind") == "prospective-invalid-current",
                "run: invalid fixtureKind diverges", errors)
        return sorted(set(errors))
    top_fields = {
        "fixtureVersion", "fixtureKind", "protocolVersion", "canonicalContractSha256",
        "status", "activeInvalidation", "invalidAttempts",
        "bindings", "environment", "cliRuntimeContract", "cliRuntimeEvidence",
        "cliRuntimeStdoutByInvocation", "roleRuntimeEvidence", "workers", "builderFreezes", "assignment",
        "evaluationRandomization", "runs", "reviews", "fixes", "tests", "packages",
        "blindedPackageManifest", "evaluations", "outcome", "costs", "evidenceChain",
    }
    if not exact_fields(fixture, top_fields, "run", errors):
        return sorted(set(errors))
    require(fixture.get("fixtureKind") == "prospective-conformance", "run: fixtureKind diverges", errors)
    require(fixture.get("canonicalContractSha256") == CONTRACT_CANONICAL_SHA256,
            "run: canonical contract binding diverges", errors)

    cli_contract = fixture.get("cliRuntimeContract")
    errors.extend(validate_cli_runtime_contract(cli_contract))
    errors.extend(validate_builder_supervision(fixture.get("cliRuntimeEvidence"), cli_contract,
                                               fixture.get("cliRuntimeStdoutByInvocation")))

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
            fields = {"candidateLabel", "workerId", "promptSha256", "configSha256",
                      "runtimeInvocationId", "runtimeEvidenceSha256", "commit", "treeSha256", "sealedAt"}
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
            require(isinstance(freeze.get("runtimeInvocationId"), str) and
                    bool(INVOCATION_ID.fullmatch(freeze["runtimeInvocationId"])) and
                    valid_hash(freeze.get("runtimeEvidenceSha256")),
                    f"{location}: runtime identity/evidence binding invalid", errors)
            require(valid_hash(freeze.get("commit"), HEX40), f"{location}: commit invalid", errors)
            parsed = parse_time(freeze.get("sealedAt"), f"{location}.sealedAt", errors)
            if parsed:
                freeze_times.append(parsed)
        if all(isinstance(freezes.get(candidate), dict) for candidate in ("candidate-a", "candidate-b")):
            require(freezes["candidate-a"].get("promptSha256") == freezes["candidate-b"].get("promptSha256"),
                    "builder freezes: prompt bytes differ", errors)
            require(freezes["candidate-a"].get("configSha256") == freezes["candidate-b"].get("configSha256"),
                    "builder freezes: config bytes differ", errors)
            runtime_ids = {freezes[candidate].get("runtimeInvocationId")
                           for candidate in ("candidate-a", "candidate-b")}
            evidence_hashes = {freezes[candidate].get("runtimeEvidenceSha256")
                               for candidate in ("candidate-a", "candidate-b")}
            require(len(runtime_ids) == 2 and len(evidence_hashes) == 2,
                    "builder freezes: runtime identities/evidence must be distinct", errors)
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
                require(valid_hash(frozen_hashes.get(candidate)),
                        f"assignment: {candidate} frozen evidence hash invalid", errors)

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
        run_fields = {"candidateLabel", "assignedArm", "builderWorkerId",
                      "runtimeInvocationId", "runtimeEvidenceSha256", "initialSnapshot", "finalSnapshot",
                      "cycles", "stopReason", "convergence", "status"}
        if exact_fields(baseline, run_fields, "runs.candidate-a", errors):
            require(isinstance(freezes.get("candidate-a"), dict) and
                    baseline.get("runtimeInvocationId") == freezes["candidate-a"].get("runtimeInvocationId") and
                    baseline.get("runtimeEvidenceSha256") == freezes["candidate-a"].get("runtimeEvidenceSha256"),
                    "runs.candidate-a: runtime binding mismatch", errors)
            require(baseline.get("assignedArm") == "baseline", "baseline: assignedArm diverges", errors)
            require(baseline.get("cycles") == [], "baseline: must have zero cycles", errors)
            require(baseline.get("stopReason") == "baseline-zero-cycles",
                    "baseline: stopReason must be baseline-zero-cycles", errors)
            require(baseline.get("convergence") is None, "baseline: convergence must be null", errors)
            require(baseline.get("initialSnapshot") == baseline.get("finalSnapshot"),
                    "baseline: final snapshot must equal initial", errors)
        if exact_fields(treatment, run_fields, "runs.candidate-b", errors):
            require(isinstance(freezes.get("candidate-b"), dict) and
                    treatment.get("runtimeInvocationId") == freezes["candidate-b"].get("runtimeInvocationId") and
                    treatment.get("runtimeEvidenceSha256") == freezes["candidate-b"].get("runtimeEvidenceSha256"),
                    "runs.candidate-b: runtime binding mismatch", errors)
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
        review_fields = {"candidateLabel", "cycle", "snapshotCommit", "roleInstanceId", "workerId",
                         "runtimeInvocationId", "runtimeProcessId", "runtimeThreadId", "startedAt",
                         "completedAt", "checksRun", "evidenceExamined", "coverageGaps", "findings"}
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
            require(isinstance(results, list) and len(results) == 5, f"{location}: five component results required", errors)
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

    manifest = fixture.get("blindedPackageManifest")
    errors.extend(validate_blinded_manifest(
        manifest,
        fixture.get("evaluationRandomization", {}).get("order")
        if isinstance(fixture.get("evaluationRandomization"), dict) else None,
    ))
    if isinstance(manifest, dict) and isinstance(packages, list):
        manifest_by_label = {item.get("packageLabel"): item for item in manifest.get("packages", [])
                             if isinstance(item, dict)}
        seed_hex = str(randomization.get("seedHex", ""))
        expected_seed_hash = hashlib.sha256(bytes.fromhex(seed_hex)).hexdigest() if valid_hash(seed_hex) else None
        require(manifest.get("mappingSeedSha256") == expected_seed_hash and
                manifest.get("frozenGateSetSha256") ==
                load_json(CONTRACT_PATH).get("evaluation", {}).get("frozenGateSetSha256"),
                "blindedPackageManifest: seed/gate binding mismatch", errors)
        for package in packages:
            if isinstance(package, dict):
                sealed = manifest_by_label.get(package.get("packageLabel"), {})
                require(sealed.get("packageSha256") == canonical_hash(package),
                        f"blindedPackageManifest: {package.get('packageLabel')} package seal mismatch", errors)

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

    role_evidence = fixture.get("roleRuntimeEvidence")
    require(isinstance(role_evidence, list), "roleRuntimeEvidence: array required", errors)
    if isinstance(role_evidence, list):
        expected_artifacts = [*fixture.get("reviews", []), *fixture.get("fixes", []),
                              *fixture.get("tests", []), *fixture.get("evaluations", [])]
        identities: set[tuple[Any, Any, Any]] = set()
        for index, item in enumerate(role_evidence):
            location = f"roleRuntimeEvidence[{index}]"
            fields = {"role", "invocationId", "processId", "threadId", "startedAt", "completedAt", "lifecycleComplete",
                      "evidenceSha256", "usage"}
            if not exact_fields(item, fields, location, errors):
                continue
            require(item.get("role") in ROLE_POLICIES and
                    isinstance(item.get("invocationId"), str) and
                    bool(INVOCATION_ID.fullmatch(item["invocationId"])) and
                    isinstance(item.get("processId"), int) and item["processId"] > 0 and
                    nonempty(item.get("threadId")) and item.get("lifecycleComplete") is True and
                    valid_hash(item.get("evidenceSha256")) and isinstance(item.get("usage"), dict),
                    f"{location}: runtime lifecycle evidence invalid", errors)
            started = parse_time(item.get("startedAt"), f"{location}.startedAt", errors)
            completed = parse_time(item.get("completedAt"), f"{location}.completedAt", errors)
            if started and completed:
                require(started <= completed, f"{location}: runtime chronology invalid", errors)
            identity = (item.get("invocationId"), item.get("processId"), item.get("threadId"))
            require(identity not in identities, f"{location}: duplicate runtime identity", errors)
            identities.add(identity)
            matches = [artifact for artifact in expected_artifacts if isinstance(artifact, dict) and
                       artifact.get("runtimeInvocationId") == item.get("invocationId") and
                       artifact.get("runtimeProcessId") == item.get("processId") and
                       artifact.get("runtimeThreadId") == item.get("threadId")]
            require(len(matches) == 1, f"{location}: role artifact binding missing or ambiguous", errors)
        require(len(role_evidence) == len(expected_artifacts),
                "roleRuntimeEvidence: must cover every model-role artifact exactly once", errors)

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
