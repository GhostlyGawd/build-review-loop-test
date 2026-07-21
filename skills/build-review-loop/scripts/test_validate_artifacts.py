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
from unittest import mock
from pathlib import Path

import validate_artifacts as validator


class ProtocolV2ValidatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.golden = validator.load_json(validator.GOLDEN_PATH)
        self.invalid = validator.load_json(validator.INVALID_PATH)
        self.envelopes = copy.deepcopy(self.golden["assignmentEnvelopes"])
        self.attestations = copy.deepcopy(self.golden["assignmentEnvelopeAttestations"])

    def errors(self, value: object, mode: str = "execution",
               expect_golden: bool = False) -> list[str]:
        return validator.validate_document(value, mode, expect_golden)

    def assert_error(self, value: object, fragment: str) -> None:
        errors = self.errors(value)
        self.assertTrue(any(fragment in error for error in errors), errors)

    def test_bundled_contract_and_fixtures_raw_and_canonical_hashes(self) -> None:
        self.assertEqual([], validator.validate_bundles())
        contract = validator.load_json(validator.CONTRACT_PATH)
        self.assertEqual(validator.CONTRACT_CANONICAL_SHA256, validator.canonical_hash(contract))
        self.assertEqual(validator.GOLDEN_CANONICAL_SHA256, validator.canonical_hash(self.golden))
        self.assertEqual(validator.INVALID_CANONICAL_SHA256, validator.canonical_hash(self.invalid))
        self.assertEqual(validator.CONTRACT_RAW_SHA256,
                         hashlib.sha256(validator.CONTRACT_PATH.read_bytes()).hexdigest())
        self.assertEqual(validator.GOLDEN_RAW_SHA256,
                         hashlib.sha256(validator.GOLDEN_PATH.read_bytes()).hexdigest())
        self.assertEqual(validator.INVALID_RAW_SHA256,
                         hashlib.sha256(validator.INVALID_PATH.read_bytes()).hexdigest())
        self.assertEqual(validator.ENVELOPE_SCHEMA_SHA256,
                         hashlib.sha256(validator.ENVELOPE_SCHEMA_PATH.read_bytes()).hexdigest())
        self.assertEqual(validator.BUILDER_PROMPT_SHA256,
                         hashlib.sha256(validator.NEUTRAL_PROMPT_PATH.read_bytes()).hexdigest())
        self.assertEqual(validator.BUILDER_CONFIG_SHA256,
                         hashlib.sha256(validator.BUILDER_CONFIG_PATH.read_bytes()).hexdigest())

    def test_exact_golden_and_invalid_envelope_pairs_validate(self) -> None:
        self.assertEqual([], validator.validate_assignment_envelope_pair(
            self.golden["assignmentEnvelopes"],
            self.golden["assignmentEnvelopeAttestations"],
        ))
        self.assertEqual([], validator.validate_assignment_envelope_pair(
            self.invalid["assignmentEnvelopes"],
            self.invalid["assignmentEnvelopeAttestations"],
        ))

    def test_envelope_cli_accepts_protocol_fixture(self) -> None:
        result = subprocess.run(
            [sys.executable, str(Path(validator.__file__)),
             str(validator.GOLDEN_PATH), "--mode", "envelope"],
            check=False, capture_output=True, text=True,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("envelope pair is canonically valid", result.stdout)

    def test_real_envelope_pair_file_helper_accepts_direct_safe_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "builder_one.json"
            second = Path(directory) / "builder_two.json"
            first.write_text(json.dumps(self.envelopes[0]), encoding="utf-8")
            second.write_text(json.dumps(self.envelopes[1]), encoding="utf-8")
            with mock.patch.object(validator, "COORDINATION_DIRECTORY", directory):
                self.assertEqual([], validator.validate_envelope_pair_files(first, second))

    def test_direct_assignment_paths_require_safe_task_leaves(self) -> None:
        safe = [
            validator.COORDINATION_DIRECTORY + r"\builder_one.json",
            validator.COORDINATION_DIRECTORY + r"\builder_two.json",
        ]
        self.assertEqual([], validator.validate_assignment_envelope_pair(
            self.envelopes, self.attestations, safe
        ))
        bad_cases = [
            [r"C:\other\builder_one.json", safe[1]],
            [validator.COORDINATION_DIRECTORY + r"\Builder-One.json", safe[1]],
            [validator.COORDINATION_DIRECTORY + r"\builder_one.txt", safe[1]],
        ]
        for paths in bad_cases:
            with self.subTest(paths=paths):
                errors = validator.validate_assignment_envelope_pair(
                    self.envelopes, self.attestations, paths
                )
                self.assertTrue(any("task-leaf path convention" in error for error in errors), errors)

    def test_rejects_envelope_semantic_extension_fields(self) -> None:
        self.envelopes[0]["arm"] = "treatment"
        errors = validator.validate_assignment_envelope_pair(self.envelopes, self.attestations)
        self.assertTrue(any("fields must be exactly" in error for error in errors), errors)

    def test_rejects_invalid_envelope_schema_and_opaque_ids(self) -> None:
        cases = [
            ("schemaVersion", "2.0.0", "schemaVersion diverges"),
            ("opaqueWorkerKey", "UPPER", "opaqueWorkerKey must be 24"),
            ("opaqueCandidateId", "short", "opaqueCandidateId must be 24"),
        ]
        for field, replacement, fragment in cases:
            with self.subTest(field=field):
                envelopes = copy.deepcopy(self.envelopes)
                envelopes[0][field] = replacement
                errors = validator.validate_assignment_envelope_pair(envelopes, self.attestations)
                self.assertTrue(any(fragment in error for error in errors), errors)

    def test_rejects_envelope_prompt_config_and_schema_commitment_drift(self) -> None:
        cases = [
            ("promptSha256", "prompt commitment mismatch"),
            ("configSha256", "config commitment mismatch"),
            ("envelopeSchemaSha256", "schema commitment mismatch"),
        ]
        for field, fragment in cases:
            with self.subTest(field=field):
                envelopes = copy.deepcopy(self.envelopes)
                envelopes[0][field] = "f" * 64
                errors = validator.validate_assignment_envelope_pair(envelopes, self.attestations)
                self.assertTrue(any(fragment in error for error in errors), errors)

    def test_rejects_envelope_lock_commitment_drift(self) -> None:
        for constant, fragment in (
            ("LOCK_PROMPT_SHA256", "prompt commitment mismatch"),
            ("LOCK_CONFIG_SHA256", "config commitment mismatch"),
            ("LOCK_ENVELOPE_SCHEMA_SHA256", "schema commitment mismatch"),
        ):
            with self.subTest(constant=constant), mock.patch.object(validator, constant, "f" * 64):
                errors = validator.validate_assignment_envelope_pair(self.envelopes, self.attestations)
                self.assertTrue(any(fragment in error for error in errors), errors)

    def test_rejects_envelope_common_start_mismatch(self) -> None:
        for field in ("commonStartCommit", "commonStartTree"):
            with self.subTest(field=field):
                envelopes = copy.deepcopy(self.envelopes)
                envelopes[1][field] = "f" * 40
                errors = validator.validate_assignment_envelope_pair(envelopes, self.attestations)
                self.assertTrue(any(f"pair mismatch at {field}" in error for error in errors), errors)

    def test_rejects_unsafe_or_noncanonical_envelope_worktree_paths(self) -> None:
        cases = [
            r"C:\outside-workspace",
            validator.COORDINATION_DIRECTORY,
            validator.COORDINATION_DIRECTORY + r"\nested",
            validator.ASSIGNMENT_WORKSPACE_ROOT + r"\folder\..\worktree",
        ]
        for replacement in cases:
            with self.subTest(path=replacement):
                envelopes = copy.deepcopy(self.envelopes)
                envelopes[0]["absoluteWorktreePath"] = replacement
                errors = validator.validate_assignment_envelope_pair(envelopes, self.attestations)
                self.assertTrue(any("safe canonical absolute path" in error for error in errors), errors)

    def test_rejects_shared_or_nested_envelope_worktree_paths(self) -> None:
        for replacement in (
            self.envelopes[0]["absoluteWorktreePath"],
            self.envelopes[0]["absoluteWorktreePath"] + r"\nested",
        ):
            with self.subTest(path=replacement):
                envelopes = copy.deepcopy(self.envelopes)
                envelopes[1]["absoluteWorktreePath"] = replacement
                errors = validator.validate_assignment_envelope_pair(envelopes, self.attestations)
                self.assertTrue(any("distinct and nonnested" in error for error in errors), errors)

    def test_rejects_duplicate_envelope_ids_and_branches(self) -> None:
        for field, fragment in (
            ("opaqueWorkerKey", "duplicates opaqueWorkerKey"),
            ("opaqueCandidateId", "duplicates opaqueCandidateId"),
            ("buildBranch", "branches must all be distinct"),
            ("baseBranch", "branches must all be distinct"),
        ):
            with self.subTest(field=field):
                envelopes = copy.deepcopy(self.envelopes)
                envelopes[1][field] = envelopes[0][field]
                errors = validator.validate_assignment_envelope_pair(envelopes, self.attestations)
                self.assertTrue(any(fragment in error for error in errors), errors)

    def test_rejects_invalid_branch_syntax(self) -> None:
        envelopes = copy.deepcopy(self.envelopes)
        envelopes[0]["buildBranch"] = "UPPER BRANCH"
        errors = validator.validate_assignment_envelope_pair(envelopes, self.attestations)
        self.assertTrue(any("buildBranch invalid" in error for error in errors), errors)

    def test_rejects_missing_malformed_or_duplicate_attestations(self) -> None:
        cases = []
        cases.append((self.attestations[:1], "two separate attestations"))
        extra = copy.deepcopy(self.attestations)
        extra[0]["extra"] = True
        cases.append((extra, "fields must be exactly"))
        wrong = copy.deepcopy(self.attestations)
        wrong[0]["envelopeSha256"] = "f" * 64
        cases.append((wrong, "attestation hash mismatch"))
        duplicate = [copy.deepcopy(self.attestations[0]), copy.deepcopy(self.attestations[0])]
        cases.append((duplicate, "attested more than once"))
        for attestations, fragment in cases:
            with self.subTest(fragment=fragment):
                errors = validator.validate_assignment_envelope_pair(self.envelopes, attestations)
                self.assertTrue(any(fragment in error for error in errors), errors)

    def test_rejects_unattested_freeze_or_run_envelope_binding_drift(self) -> None:
        value = copy.deepcopy(self.golden)
        value["builderFreezes"]["candidate-a"]["assignmentEnvelopeSha256"] = "f" * 64
        self.assert_error(value, "assignment envelopes must be separately attested")
        value = copy.deepcopy(self.golden)
        value["runs"]["candidate-a"]["assignmentEnvelopeSha256"] = "f" * 64
        self.assert_error(value, "run/envelope binding mismatch")
        value = copy.deepcopy(self.golden)
        value["runs"]["candidate-a"]["assignmentEnvelopeSchemaSha256"] = "f" * 64
        self.assert_error(value, "assignment envelope schema binding mismatch")

    def test_neutral_prompt_marks_sibling_listing_or_read_as_invalidation(self) -> None:
        prompt = validator.NEUTRAL_PROMPT_PATH.read_text(encoding="utf-8")
        self.assertEqual([], validator.validate_neutral_builder_prompt(prompt))
        changed = prompt.replace(
            "Listing the directory or reading a sibling assignment is an experiment invalidation.",
            "Sibling access is discouraged.",
        )
        errors = validator.validate_neutral_builder_prompt(changed)
        self.assertTrue(any("assignment prose missing" in error for error in errors), errors)

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

    def test_exact_invalid_current_validates_in_execution_mode(self) -> None:
        self.assertEqual([], validator.validate_path(validator.INVALID_PATH, "execution"))

    def test_exact_invalid_current_validates_through_cli(self) -> None:
        result = subprocess.run(
            [sys.executable, str(Path(validator.__file__)),
             str(validator.INVALID_PATH), "--mode", "execution"],
            check=False, capture_output=True, text=True,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_template_mode_cli_smoke(self) -> None:
        result = subprocess.run(
            [sys.executable, str(Path(validator.__file__)),
             str(validator.INVALID_PATH), "--mode", "template"],
            check=False, capture_output=True, text=True,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_valid_fixture_preserves_invalid_attempt_history(self) -> None:
        self.assertEqual("rehearsal-001", self.golden["invalidAttempts"][0]["attemptId"])
        self.assertEqual([], self.errors(self.golden))

    def test_rejects_prompt_drift_even_when_builders_match_each_other(self) -> None:
        value = copy.deepcopy(self.golden)
        for freeze in value["builderFreezes"].values():
            freeze["promptSha256"] = "f" * 64
        self.assert_error(value, "prompt commitment drift from canonical contract and lock")

    def test_rejects_config_drift_even_when_builders_match_each_other(self) -> None:
        value = copy.deepcopy(self.golden)
        for freeze in value["builderFreezes"].values():
            freeze["configSha256"] = "f" * 64
        self.assert_error(value, "config commitment drift from canonical contract and lock")

    def test_rejects_prompt_drift_from_lock_commitment(self) -> None:
        with mock.patch.object(validator, "LOCK_PROMPT_SHA256", "f" * 64):
            self.assert_error(self.golden, "prompt commitment drift from canonical contract and lock")

    def test_rejects_config_drift_from_lock_commitment(self) -> None:
        with mock.patch.object(validator, "LOCK_CONFIG_SHA256", "f" * 64):
            self.assert_error(self.golden, "config commitment drift from canonical contract and lock")

    def test_rejects_arbitrary_completed_status(self) -> None:
        value = copy.deepcopy(self.golden)
        value["status"] = "complete"
        self.assert_error(value, "completed status must be valid or invalid")

    def test_rejects_valid_status_with_active_invalidation(self) -> None:
        value = copy.deepcopy(self.golden)
        value["activeInvalidation"] = copy.deepcopy(self.invalid["activeInvalidation"])
        self.assert_error(value, "valid status requires activeInvalidation null")

    def test_rejects_valid_status_without_outcome(self) -> None:
        value = copy.deepcopy(self.golden)
        value["outcome"] = None
        self.assert_error(value, "valid status requires a scored outcome")

    def test_rejects_invalid_status_without_active_invalidation(self) -> None:
        value = copy.deepcopy(self.invalid)
        value["activeInvalidation"] = None
        self.assert_error(value, "activeInvalidation: must be an object")

    def test_rejects_invalid_status_with_outcome(self) -> None:
        value = copy.deepcopy(self.invalid)
        value["outcome"] = {"score": 100}
        errors = self.errors(value)
        self.assertTrue(any("invalid status requires outcome null" in error for error in errors), errors)
        self.assertTrue(any("active invalidation forbids a scored outcome" in error for error in errors), errors)

    def test_rejects_invalid_status_with_evaluations(self) -> None:
        value = copy.deepcopy(self.invalid)
        value["evaluations"] = []
        self.assert_error(value, "invalid status requires evaluations null")

    def test_rejects_malformed_active_invalidation_evidence(self) -> None:
        value = copy.deepcopy(self.invalid)
        value["activeInvalidation"]["evidenceSha256"] = "0" * 64
        self.assert_error(value, "activeInvalidation.evidenceSha256: nonzero SHA-256 required")

    def test_rejects_malformed_preserved_invalid_attempt(self) -> None:
        value = copy.deepcopy(self.golden)
        value["invalidAttempts"][0]["reason"] = ""
        self.assert_error(value, "invalidAttempts[0].reason: nonempty string required")

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
