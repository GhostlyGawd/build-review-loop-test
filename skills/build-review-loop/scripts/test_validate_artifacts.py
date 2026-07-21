#!/usr/bin/env python3
"""Golden-first tests for the public protocol-v2 validator."""

from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import validate_artifacts as validator


class ProtocolV2ValidatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.golden = validator.load_json(validator.GOLDEN_PATH)

    def errors(self, value: object, mode: str = "execution",
               expect_golden: bool = False) -> list[str]:
        return validator.validate_document(value, mode, expect_golden)

    def assert_error(self, value: object, fragment: str) -> None:
        errors = self.errors(value)
        self.assertTrue(any(fragment in error for error in errors), errors)

    def test_bundled_contract_and_golden_raw_and_canonical_hashes(self) -> None:
        self.assertEqual([], validator.validate_bundles())
        contract = validator.load_json(validator.CONTRACT_PATH)
        self.assertEqual(validator.CONTRACT_CANONICAL_SHA256, validator.canonical_hash(contract))
        self.assertEqual(validator.GOLDEN_CANONICAL_SHA256, validator.canonical_hash(self.golden))
        self.assertEqual(validator.CONTRACT_RAW_SHA256,
                         hashlib.sha256(validator.CONTRACT_PATH.read_bytes()).hexdigest())
        self.assertEqual(validator.GOLDEN_RAW_SHA256,
                         hashlib.sha256(validator.GOLDEN_PATH.read_bytes()).hexdigest())

    def test_exact_golden_validates_in_execution_mode(self) -> None:
        self.assertEqual([], validator.validate_path(
            validator.GOLDEN_PATH, "execution", expect_golden=True
        ))

    def test_exact_golden_validates_through_cli(self) -> None:
        result = subprocess.run(
            [sys.executable, str(Path(validator.__file__)),
             str(validator.GOLDEN_PATH), "--mode", "execution", "--expect-golden"],
            check=False, capture_output=True, text=True,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("canonically valid", result.stdout)

    def test_canonical_json_uses_utf8_key_order_and_domain(self) -> None:
        value = {"é": 2, "z": 1}
        self.assertEqual('{"z":1,"é":2}', validator.canonical_json(value))
        expected = hashlib.sha256(
            validator.CANONICAL_DOMAIN + b'{"z":1,"\xc3\xa9":2}'
        ).hexdigest()
        self.assertEqual(expected, validator.canonical_hash(value))
        self.assertEqual(
            self.golden["assignment"]["frozenInitialEvidenceHashes"]["candidate-a"],
            validator.canonical_hash(self.golden["builderFreezes"]["candidate-a"]),
        )

    def test_assignment_bytes_recompute_exactly(self) -> None:
        assignment = self.golden["assignment"]
        digest, draw, mapping = validator.candidate_assignment(
            assignment["seedHex"], ["candidate-a", "candidate-b"]
        )
        self.assertEqual(assignment["digestSha256"], digest)
        self.assertEqual(assignment["draw"], draw)
        self.assertEqual(assignment["mapping"], mapping)

    def test_evaluation_rank_hash_bytes_recompute_exactly(self) -> None:
        randomization = self.golden["evaluationRandomization"]
        digest, ranks, mapping = validator.evaluation_randomization(randomization["seedHex"])
        self.assertEqual(randomization["digestSha256"], digest)
        self.assertEqual(randomization["rankDigests"], ranks)
        self.assertEqual(randomization["mapping"], mapping)

    def test_rejects_legacy_finding_shape(self) -> None:
        value = copy.deepcopy(self.golden)
        value["reviews"][0]["findings"] = [{
            "id": "cycle-1-reviewer-01", "severity": "high", "title": "legacy",
            "evidence": ["path:1"], "impact": "impact",
            "required_change": "change", "acceptance_check": "check",
        }]
        value["runs"]["candidate-b"]["cycles"][0]["reviewFindingCount"] = 1
        self.assert_error(value, "fields must be exactly actual,duplicateOf,evidence,expected,id,rubricItems,severity,title,verification")

    def test_rejects_extra_finding_field(self) -> None:
        value = copy.deepcopy(self.golden)
        finding = {
            "id": "cycle-1-reviewer-01", "severity": "low", "title": "defect",
            "evidence": ["path:1"], "expected": "expected", "actual": "actual",
            "rubricItems": ["A1"], "verification": "verify", "duplicateOf": None,
            "impact": "not public",
        }
        value["reviews"][0]["findings"] = [finding]
        self.assert_error(value, "fields must be exactly actual,duplicateOf,evidence,expected,id,rubricItems,severity,title,verification")

    def test_rejects_nonpublic_fixer_disposition_shape(self) -> None:
        value = copy.deepcopy(self.golden)
        finding = {
            "id": "cycle-1-reviewer-01", "severity": "low", "title": "defect",
            "evidence": ["path:1"], "expected": "expected", "actual": "actual",
            "rubricItems": ["A1"], "verification": "verify", "duplicateOf": None,
        }
        value["reviews"][0]["findings"] = [finding]
        value["fixes"] = [{
            "candidateLabel": "candidate-b", "cycle": 1,
            "roleInstanceId": "cycle-1-fixer", "workerId": "worker-04-fixer-31a9",
            "startCommit": "55f7cc9ac06d2734f4137c935397a5a1742cb1c9",
            "finalCommit": "0d977cbeeb1df357e500f254108535ba025577d7",
            "startedAt": "2026-07-20T01:10:00Z", "completedAt": "2026-07-20T01:15:00Z",
            "dispositions": [{
                "findingId": "cycle-1-reviewer-01", "decision": "accepted",
                "rationale": "fixed", "evidence": ["path:1"], "legacy": True,
            }],
            "changedFiles": ["src/file"], "checks": [], "remainingDefects": [],
            "deviations": [],
        }]
        self.assert_error(value, "fields must be exactly decision,evidence,findingId,rationale")

    def test_rejects_nonpublic_tester_component_shape(self) -> None:
        value = copy.deepcopy(self.golden)
        results = [
            {"command": command, "exitCode": 0} for command in validator.PUBLIC_GATES
        ]
        results[0]["output"] = "legacy"
        value["tests"] = [{
            "candidateLabel": "candidate-b", "cycle": 1,
            "roleInstanceId": "cycle-1-tester", "workerId": "worker-05-tester-c472",
            "snapshotCommit": "55f7cc9ac06d2734f4137c935397a5a1742cb1c9",
            "startedAt": "2026-07-20T01:15:00Z", "completedAt": "2026-07-20T01:20:00Z",
            "command": "npm run check", "exitCode": 0, "componentResults": results,
            "rawOutputSha256": "f" * 64, "workingTreeClean": True,
        }]
        self.assert_error(value, "fields must be exactly command,exitCode")

    def test_rejects_old_baseline_stop_reason(self) -> None:
        value = copy.deepcopy(self.golden)
        value["runs"]["candidate-a"]["stopReason"] = "baseline_frozen"
        self.assert_error(value, "baseline-zero-cycles")

    def test_rejects_assignment_digest_mismatch(self) -> None:
        value = copy.deepcopy(self.golden)
        value["assignment"]["digestSha256"] = "f" * 64
        self.assert_error(value, "assignment: digest bytes diverge")

    def test_rejects_rank_digest_mismatch(self) -> None:
        value = copy.deepcopy(self.golden)
        value["evaluationRandomization"]["rankDigests"]["T0"] = "f" * 64
        self.assert_error(value, "rank-hash bytes diverge")

    def test_rejects_noncanonical_xyz_mapping(self) -> None:
        value = copy.deepcopy(self.golden)
        mapping = value["evaluationRandomization"]["mapping"]
        mapping["X"], mapping["Y"] = mapping["Y"], mapping["X"]
        self.assert_error(value, "X/Y/Z mapping diverges")

    def test_rejects_evidence_sequence_starting_at_one(self) -> None:
        value = copy.deepcopy(self.golden)
        value["evidenceChain"][0]["sequence"] = 1
        self.assert_error(value, "sequence must start at 0")

    def test_rejects_evidence_predecessor_mismatch(self) -> None:
        value = copy.deepcopy(self.golden)
        value["evidenceChain"][1]["previousSha256"] = "f" * 64
        self.assert_error(value, "previousSha256 mismatch")

    def test_rejects_noncanonical_evidence_artifact_hash(self) -> None:
        value = copy.deepcopy(self.golden)
        value["evidenceChain"][3]["artifactSha256"] = "f" * 64
        self.assert_error(value, "domain-separated canonical artifact hash mismatch")

    def test_rejects_missing_evaluation_artifact(self) -> None:
        value = copy.deepcopy(self.golden)
        value["evaluations"].pop()
        self.assert_error(value, "exactly three artifacts required")

    def test_rejects_missing_rubric_item(self) -> None:
        value = copy.deepcopy(self.golden)
        value["evaluations"][0]["items"].pop()
        self.assert_error(value, "exactly 20 rubric items required")

    def test_rejects_wrong_rubric_item_id_order(self) -> None:
        value = copy.deepcopy(self.golden)
        value["evaluations"][0]["items"][0]["id"] = "A2"
        self.assert_error(value, "rubric IDs must appear once in canonical order")

    def test_rejects_nonanchor_score(self) -> None:
        value = copy.deepcopy(self.golden)
        value["evaluations"][0]["items"][0]["score"] = 5
        self.assert_error(value, "score is not a written anchor")

    def test_rejects_wrong_item_maximum(self) -> None:
        value = copy.deepcopy(self.golden)
        value["evaluations"][0]["items"][0]["maximum"] = 7
        self.assert_error(value, "maximum diverges")

    def test_rejects_wrong_section_subtotal(self) -> None:
        value = copy.deepcopy(self.golden)
        value["evaluations"][0]["sectionTotals"]["functional"] = 49
        self.assert_error(value, "functional subtotal arithmetic is incorrect")

    def test_rejects_unapplied_section_cap(self) -> None:
        value = copy.deepcopy(self.golden)
        evaluation = value["evaluations"][0]
        evaluation["capConditions"]["buildFailedOrCannotRender"] = True
        evaluation["capsApplied"] = ["functional-section-10"]
        self.assert_error(value, "functional build/render cap not applied")

    def test_rejects_missing_public_results(self) -> None:
        value = copy.deepcopy(self.golden)
        del value["evaluations"][0]["publicTests"]
        self.assert_error(value, "fields must be exactly")

    def test_rejects_missing_hidden_results(self) -> None:
        value = copy.deepcopy(self.golden)
        del value["evaluations"][0]["hiddenTests"]
        self.assert_error(value, "fields must be exactly")

    def test_rejects_evaluator_public_command_drift(self) -> None:
        value = copy.deepcopy(self.golden)
        value["evaluations"][0]["publicTests"]["command"] = "npm test"
        self.assert_error(value, "command diverges from commitment")

    def test_rejects_all_wrong_role_wall_budgets(self) -> None:
        for index, cost in enumerate(self.golden["costs"]):
            with self.subTest(role=cost["role"]):
                value = copy.deepcopy(self.golden)
                value["costs"][index]["wallSecondsMaximum"] += 1
                self.assert_error(value, "wall budget diverges")

    def test_rejects_positive_or_estimated_max_tokens(self) -> None:
        value = copy.deepcopy(self.golden)
        value["costs"][0]["maxTokens"] = 2400
        self.assert_error(value, "maxTokens must be null with reason")

    def test_rejects_null_max_tokens_without_reason(self) -> None:
        value = copy.deepcopy(self.golden)
        value["costs"][0]["maxTokensUnavailableReason"] = ""
        self.assert_error(value, "maxTokens must be null with reason")

    def test_rejects_estimated_unavailable_telemetry(self) -> None:
        value = copy.deepcopy(self.golden)
        value["costs"][0]["totalTokens"] = 123
        self.assert_error(value, "unavailable telemetry must remain null")

    def test_rejects_public_gate_binding_drift(self) -> None:
        value = copy.deepcopy(self.golden)
        value["bindings"]["publicGates"][0] = "npm run format"
        self.assert_error(value, "immutable public gates diverge")

    def test_rejects_hidden_commitment_drift(self) -> None:
        value = copy.deepcopy(self.golden)
        value["bindings"]["hiddenSuiteSha256"] = "f" * 64
        self.assert_error(value, "hidden-suite commitment diverges")

    def test_rejects_duplicate_worker_ids(self) -> None:
        value = copy.deepcopy(self.golden)
        value["workers"][1]["workerId"] = value["workers"][0]["workerId"]
        self.assert_error(value, "duplicate worker IDs")

    def test_template_mode_allows_sentinels_but_execution_rejects_them(self) -> None:
        value = copy.deepcopy(self.golden)
        value["bindings"]["commonStartCommit"] = "0" * 40
        value["environment"]["npm"] = "required-at-run"
        self.assertEqual([], self.errors(value, mode="template"))
        errors = self.errors(value, mode="execution")
        self.assertTrue(any("zero hash/seed" in error for error in errors), errors)
        self.assertTrue(any("template sentinel" in error for error in errors), errors)

    def test_rejects_mutation_when_golden_hash_is_required(self) -> None:
        value = copy.deepcopy(self.golden)
        value["environment"]["npm"] = "11.11.1"
        errors = self.errors(value, expect_golden=True)
        self.assertTrue(any("does not match frozen golden" in error for error in errors), errors)

    def test_rejects_non_history_free_package(self) -> None:
        value = copy.deepcopy(self.golden)
        value["packages"][0]["historyFree"] = False
        self.assert_error(value, "package must be history-free")

    def test_rejects_wrong_outcome_delta(self) -> None:
        value = copy.deepcopy(self.golden)
        value["outcome"]["primaryTfinalMinusB0"] = 0
        self.assert_error(value, "primary Tfinal-B0 arithmetic incorrect")

    def test_cli_rejects_template_sentinel_in_execution_mode(self) -> None:
        value = copy.deepcopy(self.golden)
        value["bindings"]["lockFileSha256"] = "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "artifact.json"
            path.write_text(json.dumps(value), encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(Path(validator.__file__)), str(path),
                 "--mode", "execution"], check=False, capture_output=True, text=True,
            )
        self.assertNotEqual(0, result.returncode)
        self.assertIn("zero hash/seed", result.stdout)


if __name__ == "__main__":
    unittest.main()
