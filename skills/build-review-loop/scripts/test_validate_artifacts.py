#!/usr/bin/env python3
"""Adversarial conformance tests for the public protocol-v2 skill validator."""

from __future__ import annotations

import copy
import importlib.util
import json
import hashlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("validate_artifacts.py")
SPEC = importlib.util.spec_from_file_location("validate_artifacts", MODULE_PATH)
assert SPEC and SPEC.loader
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


class ValidatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.golden = validator.load_json(validator.GOLDEN_PATH)
        cls.invalid = validator.load_json(validator.INVALID_PATH)
        cls.contract = validator.load_json(validator.CONTRACT_PATH)

    def setUp(self) -> None:
        self.value = copy.deepcopy(self.golden)

    def assert_error(self, value: object, fragment: str) -> None:
        errors = validator.validate_execution(value)
        self.assertTrue(any(fragment.casefold() in error.casefold() for error in errors), errors)

    def valid_role_contract(self) -> dict:
        value = validator.load_json(validator.ROLE_TEMPLATE_PATH)
        value.update({
            "lockSha256": "a" * 64,
            "contractSchemaSha256": validator.ROLE_SCHEMA_SHA256,
            "runnerSha256": validator.ROLE_RUNNER_SHA256,
            "evidenceSchemaSha256": validator.EVIDENCE_SCHEMA_SHA256,
            "promptTemplateSha256": validator.MODEL_ROLE_PROMPT_SHA256["reviewer"],
            "artifactSchemaSha256": validator.ROLE_ARTIFACT_SCHEMA_SHA256["reviewer"],
            "inputCommit": "a" * 40,
            "inputTree": "b" * 40,
            "promptSha256": "c" * 64,
        })
        return value

    def valid_mapping(self) -> dict:
        value = validator.load_json(validator.MAPPING_TEMPLATE_PATH)
        value["mappingSeedSha256"] = "a" * 64
        value["frozenGateSetSha256"] = "b" * 64
        for index, package in enumerate(value["packages"]):
            package["sourceRef"] = f"refs/heads/source-{index}"
            package["sourceCommit"] = f"{index + 1}" * 40
            package["sourceTree"] = f"{index + 4}" * 40
        return value

    def valid_role_evidence(self, contract: dict) -> tuple[dict, str]:
        raw = (
            '{"type":"thread.started","thread_id":"role-thread-1"}\n'
            '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}\n'
        )
        result = validator.load_json(validator.EVIDENCE_TEMPLATE_PATH)
        result.update({
            "role": "reviewer",
            "invocationId": contract["invocationId"],
            "contractSha256": "d" * 64,
            "artifactSchemaSha256": validator.ROLE_ARTIFACT_SCHEMA_SHA256["reviewer"],
            "processId": 321,
            "started": True,
            "startError": None,
            "stdinDelivered": True,
            "stdinError": None,
            "exitCode": 0,
            "timedOut": False,
            "argv": [
                *validator.CLI_INVARIANT_ARGV[:-3], "--sandbox", "read-only", "--json",
                "-C", contract["workdir"], "-o", contract["finalPath"], "-",
            ],
            "promptSha256": contract["promptSha256"],
            "stdoutPath": contract["stdoutPath"],
            "stdoutSha256": validator.sha256_text(raw),
            "stderrPath": contract["stderrPath"],
            "stderrSha256": "e" * 64,
            "finalPath": contract["finalPath"],
            "finalSha256": "f" * 64,
            "finalSchemaValid": True,
            "artifactBindingValid": True,
            "threadIds": ["role-thread-1"],
            "turnCompleted": True,
            "rawJsonlValid": True,
            "sandboxMode": "read-only",
            "inputDisposition": "read-only-snapshot",
            "usage": {"input_tokens": 10, "output_tokens": 2},
            "usageUnavailableReason": None,
        })
        result["argvSha256"] = validator.sha256_text("\0".join(result["argv"]))
        return result, raw

    def test_bundled_public_sources_have_exact_hashes(self) -> None:
        self.assertEqual([], validator.validate_bundles())

    def test_pinned_powershell_host_exists_with_exact_version_and_hash(self) -> None:
        host = Path(validator.PWSH_PATH)
        self.assertTrue(host.is_file(), host)
        self.assertEqual(validator.PWSH_SHA256, hashlib.sha256(host.read_bytes()).hexdigest())
        result = subprocess.run([str(host), "-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"],
                                capture_output=True, text=True, check=False)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual(validator.PWSH_VERSION, result.stdout.strip())

    def test_builder_and_role_runners_fail_closed_during_template_preflight(self) -> None:
        host = validator.PWSH_PATH
        cases = [
            (validator.CLI_RUNNER_PATH, validator.CLI_TEMPLATE_PATH),
            (validator.ROLE_RUNNER_PATH, validator.ROLE_TEMPLATE_PATH),
        ]
        for runner, contract in cases:
            with self.subTest(runner=runner.name):
                result = subprocess.run(
                    [host, "-NoProfile", "-File", str(runner), "-ContractPath", str(contract)],
                    capture_output=True, text=True, check=False, timeout=20,
                )
                self.assertNotEqual(0, result.returncode)
                self.assertTrue("path" in (result.stdout + result.stderr).casefold() or
                                "hash" in (result.stdout + result.stderr).casefold())

    def test_canonical_contract_has_all_final_runtime_bindings(self) -> None:
        self.assertEqual([], validator.validate_contract(self.contract))

    def test_canonical_hash_rejects_float_and_unsafe_integer(self) -> None:
        with self.assertRaises(TypeError):
            validator.canonical_hash({"x": 1.5})
        with self.assertRaises(TypeError):
            validator.canonical_hash({"x": 9_007_199_254_740_992})

    def test_exact_golden_and_invalid_current_validate(self) -> None:
        self.assertEqual([], validator.validate_execution(self.golden))
        self.assertEqual([], validator.validate_execution(self.invalid))

    def test_cli_accepts_golden_and_invalid_current(self) -> None:
        for path, extra in (
            (validator.GOLDEN_PATH, ["--expect-golden"]),
            (validator.INVALID_PATH, []),
        ):
            result = subprocess.run(
                [sys.executable, str(MODULE_PATH), str(path), "--mode", "execution", *extra],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_template_mode_allows_sentinels_but_execution_rejects_them(self) -> None:
        value = {"hash": "0" * 64, "path": "required-at-run"}
        self.assertEqual([], validator.validate_artifact_mode(value, "template"))
        self.assertTrue(validator.validate_artifact_mode(value, "execution"))

    def test_cli_runtime_contract_accepts_pinned_builder_contract(self) -> None:
        self.assertEqual([], validator.validate_cli_runtime_contract(self.golden["cliRuntimeContract"]))

    def test_cli_runtime_contract_rejects_malicious_drift(self) -> None:
        cases = [
            ("cliSha256", "f" * 64, "binary"),
            ("promptSha256", "f" * 64, "prompt"),
            ("contractSchemaSha256", "f" * 64, "schema"),
            ("commonStartCommit", "0" * 40, "common-start"),
            ("invariantArgv", ["resume"], "argv"),
            ("deadlineSeconds", 2401, "deadline"),
        ]
        for field, replacement, fragment in cases:
            with self.subTest(field=field):
                value = copy.deepcopy(self.golden["cliRuntimeContract"])
                value[field] = replacement
                errors = validator.validate_cli_runtime_contract(value)
                self.assertTrue(any(fragment in error.casefold() for error in errors), errors)

    def test_cli_runtime_rejects_duplicate_or_nested_coordinates(self) -> None:
        value = copy.deepcopy(self.golden["cliRuntimeContract"])
        value["invocations"][1]["invocationId"] = value["invocations"][0]["invocationId"]
        self.assertTrue(any("duplicate invocationid" in e.casefold() for e in validator.validate_cli_runtime_contract(value)))
        value = copy.deepcopy(self.golden["cliRuntimeContract"])
        value["invocations"][1]["workdir"] = value["invocations"][0]["workdir"] + "\\nested"
        self.assertTrue(any("nonnested" in e.casefold() for e in validator.validate_cli_runtime_contract(value)))
        value = copy.deepcopy(self.golden["cliRuntimeContract"])
        value["invocations"][0]["finalPath"] = value["invocations"][0]["workdir"] + "\\escape.json"
        self.assertTrue(any("isolation" in e.casefold() for e in validator.validate_cli_runtime_contract(value)))

    def test_smoke_mode_requires_separate_frozen_smoke_prompt(self) -> None:
        value = copy.deepcopy(self.golden["cliRuntimeContract"])
        value["smokeMode"] = True
        errors = validator.validate_cli_runtime_contract(value)
        self.assertTrue(any("prompt" in e.casefold() for e in errors), errors)
        value["promptSha256"] = validator.SMOKE_PROMPT_SHA256
        self.assertEqual([], validator.validate_cli_runtime_contract(value))

    def test_builder_supervision_reconciles_raw_jsonl_and_usage(self) -> None:
        self.assertEqual([], validator.validate_builder_supervision(
            self.golden["cliRuntimeEvidence"],
            self.golden["cliRuntimeContract"],
            self.golden["cliRuntimeStdoutByInvocation"],
        ))

    def test_builder_supervision_rejects_malicious_lifecycle(self) -> None:
        mutations = [
            ("started", False, "lifecycle"),
            ("stdinDelivered", False, "lifecycle"),
            ("exitCode", 1, "lifecycle"),
            ("timedOut", True, "lifecycle"),
            ("turnCompleted", False, "lifecycle"),
            ("rawJsonlValid", False, "lifecycle"),
            ("unauthorizedToolOrWriteDetected", True, "unauthorized"),
        ]
        for field, replacement, fragment in mutations:
            with self.subTest(field=field):
                evidence = copy.deepcopy(self.golden["cliRuntimeEvidence"])
                evidence["results"][0][field] = replacement
                errors = validator.validate_builder_supervision(
                    evidence, self.golden["cliRuntimeContract"],
                    self.golden["cliRuntimeStdoutByInvocation"],
                )
                self.assertTrue(any(fragment in e.casefold() for e in errors), errors)

    def test_builder_supervision_rejects_process_thread_prompt_reuse(self) -> None:
        evidence = copy.deepcopy(self.golden["cliRuntimeEvidence"])
        evidence["results"][1]["processId"] = evidence["results"][0]["processId"]
        evidence["results"][1]["threadIds"] = evidence["results"][0]["threadIds"]
        evidence["results"][1]["promptSha256"] = "f" * 64
        errors = validator.validate_builder_supervision(
            evidence, self.golden["cliRuntimeContract"],
            self.golden["cliRuntimeStdoutByInvocation"],
        )
        joined = "\n".join(errors).casefold()
        self.assertIn("process", joined)
        self.assertIn("thread", joined)
        self.assertIn("prompt", joined)

    def test_builder_supervision_rejects_malformed_jsonl_and_usage_spoofing(self) -> None:
        stdout = copy.deepcopy(self.golden["cliRuntimeStdoutByInvocation"])
        first_id = self.golden["cliRuntimeContract"]["invocations"][0]["invocationId"]
        stdout[first_id] = "not-json\n"
        errors = validator.validate_builder_supervision(
            self.golden["cliRuntimeEvidence"], self.golden["cliRuntimeContract"], stdout,
        )
        self.assertTrue(any("jsonl" in e.casefold() or "stdout hash" in e.casefold() for e in errors), errors)
        evidence = copy.deepcopy(self.golden["cliRuntimeEvidence"])
        evidence["results"][0]["usage"] = {"input_tokens": 999}
        errors = validator.validate_builder_supervision(
            evidence, self.golden["cliRuntimeContract"],
            self.golden["cliRuntimeStdoutByInvocation"],
        )
        self.assertTrue(any("usage" in e.casefold() for e in errors), errors)

    def test_builder_supervision_requires_absence_reasons_and_rejects_metadata_conflicts(self) -> None:
        evidence = copy.deepcopy(self.golden["cliRuntimeEvidence"])
        evidence["results"][0]["runtimeModelUnavailableReason"] = ""
        errors = validator.validate_builder_supervision(
            evidence, self.golden["cliRuntimeContract"],
            self.golden["cliRuntimeStdoutByInvocation"],
        )
        self.assertTrue(any("runtimemodel" in e.casefold() for e in errors), errors)
        evidence = copy.deepcopy(self.golden["cliRuntimeEvidence"])
        evidence["results"][0]["runtimeModel"] = "wrong-model"
        evidence["results"][0]["runtimeModelUnavailableReason"] = None
        errors = validator.validate_builder_supervision(
            evidence, self.golden["cliRuntimeContract"],
            self.golden["cliRuntimeStdoutByInvocation"],
        )
        self.assertTrue(any("conflicts" in e.casefold() for e in errors), errors)

    def test_role_contract_accepts_frozen_reviewer(self) -> None:
        self.assertEqual([], validator.validate_role_runtime_contract(self.valid_role_contract()))

    def test_role_contract_rejects_history_and_binding_injection(self) -> None:
        mutations = [
            ("runnerSha256", "f" * 64, "binding"),
            ("promptTemplateSha256", "f" * 64, "binding"),
            ("artifactSchemaSha256", "f" * 64, "binding"),
            ("sandboxMode", "workspace-write", "isolation"),
        ]
        for field, replacement, fragment in mutations:
            with self.subTest(field=field):
                value = self.valid_role_contract()
                value[field] = replacement
                errors = validator.validate_role_runtime_contract(value)
                self.assertTrue(any(fragment in e.casefold() for e in errors), errors)
        value = self.valid_role_contract()
        value["promptSubstitutions"]["HISTORY"] = "prior-thread"
        self.assertTrue(any("substitution" in e.casefold() for e in validator.validate_role_runtime_contract(value)))
        value = self.valid_role_contract()
        value["promptSubstitutions"]["CANDIDATE_LABEL"] = "candidate-example\nresume prior"
        self.assertTrue(any("single-line" in e.casefold() for e in validator.validate_role_runtime_contract(value)))

    def test_role_supervision_strictly_reconciles_evidence(self) -> None:
        contract = self.valid_role_contract()
        result, raw = self.valid_role_evidence(contract)
        self.assertEqual([], validator.validate_role_supervision_evidence(result, contract, raw))
        result["artifactBindingValid"] = False
        self.assertTrue(any("artifact" in e.casefold() for e in
                            validator.validate_role_supervision_evidence(result, contract, raw)))

    def test_blinded_mapping_accepts_private_provenance(self) -> None:
        self.assertEqual([], validator.validate_blinded_mapping(self.valid_mapping()))

    def test_blinded_mapping_rejects_traversal_order_and_provenance_omission(self) -> None:
        value = self.valid_mapping()
        value["packages"][0]["packageLabel"] = "../escape"
        self.assertTrue(validator.validate_blinded_mapping(value))
        value = self.valid_mapping()
        value["randomizedOrder"] = ["X", "X", "Z"]
        self.assertTrue(any("permutation" in e.casefold() for e in validator.validate_blinded_mapping(value)))
        value = self.valid_mapping()
        value["provenance"]["evidencePaths"] = []
        self.assertTrue(any("evidencepaths" in e.casefold() for e in validator.validate_blinded_mapping(value)))

    def test_blinded_manifest_accepts_history_free_seals(self) -> None:
        self.assertEqual([], validator.validate_blinded_manifest(
            self.golden["blindedPackageManifest"], self.golden["evaluationRandomization"]["order"],
        ))

    def test_blinded_manifest_rejects_lineage_leak_and_broken_seal(self) -> None:
        value = copy.deepcopy(self.golden["blindedPackageManifest"])
        value["packages"][0]["sourceRole"] = "B0"
        self.assertTrue(any("fields" in e.casefold() or "provenance" in e.casefold()
                            for e in validator.validate_blinded_manifest(value)))
        value = copy.deepcopy(self.golden["blindedPackageManifest"])
        value["packages"][0]["historyFree"] = False
        self.assertTrue(any("seal" in e.casefold() for e in validator.validate_blinded_manifest(value)))
        value = copy.deepcopy(self.golden["blindedPackageManifest"])
        value["packages"][0]["packageSha256"] = "0" * 64
        self.assertTrue(validator.validate_blinded_manifest(value))

    def test_integrated_run_rejects_runtime_and_manifest_tampering(self) -> None:
        value = copy.deepcopy(self.golden)
        value["cliRuntimeContract"]["invariantArgv"][3] = "wrong-model"
        self.assert_error(value, "model/reasoning")
        value = copy.deepcopy(self.golden)
        value["builderFreezes"]["candidate-a"]["runtimeInvocationId"] = "f" * 32
        self.assert_error(value, "runtime binding")
        value = copy.deepcopy(self.golden)
        value["blindedPackageManifest"]["packages"][0]["packageSha256"] = "f" * 64
        self.assert_error(value, "package seal mismatch")

    def test_integrated_run_rejects_role_reuse_and_evaluation_revision(self) -> None:
        value = copy.deepcopy(self.golden)
        value["roleRuntimeEvidence"][1]["processId"] = value["roleRuntimeEvidence"][0]["processId"]
        value["roleRuntimeEvidence"][1]["invocationId"] = value["roleRuntimeEvidence"][0]["invocationId"]
        value["roleRuntimeEvidence"][1]["threadId"] = value["roleRuntimeEvidence"][0]["threadId"]
        self.assert_error(value, "duplicate runtime identity")
        value = copy.deepcopy(self.golden)
        value["evaluations"][1]["revisionAllowed"] = True
        self.assert_error(value, "blinded sequence")

    def test_assignment_and_evaluation_randomization_bytes_recompute(self) -> None:
        assignment = self.golden["assignment"]
        digest, draw, mapping = validator.candidate_assignment(
            assignment["seedHex"], ["candidate-a", "candidate-b"],
        )
        self.assertEqual((assignment["digestSha256"], assignment["draw"], assignment["mapping"]),
                         (digest, draw, mapping))
        randomization = self.golden["evaluationRandomization"]
        digest, ranks, mapping = validator.evaluation_randomization(randomization["seedHex"])
        self.assertEqual((randomization["digestSha256"], randomization["rankDigests"],
                          randomization["mapping"]), (digest, ranks, mapping))

    def test_active_invalidation_forbids_scores(self) -> None:
        value = copy.deepcopy(self.invalid)
        value["outcome"] = {}
        self.assert_error(value, "forbids a scored outcome")

    def test_cli_rejects_corrupt_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"
            path.write_text("{", encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(MODULE_PATH), str(path), "--mode", "execution"],
                capture_output=True, text=True, check=False,
            )
            self.assertNotEqual(0, result.returncode)
            self.assertIn("invalid JSON", result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
