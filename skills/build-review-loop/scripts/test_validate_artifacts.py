#!/usr/bin/env python3
"""Full standard-library tests for the schema-version-2 artifact validator."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import validate_artifacts


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def add_event(events: list[dict[str, object]], kind: str, payload: object) -> None:
    event: dict[str, object] = {
        "sequence": len(events) + 1,
        "kind": kind,
        "payload": payload,
        "previous_event_hash": events[-1]["event_hash"] if events else None,
    }
    event["event_hash"] = hashlib.sha256(validate_artifacts.canonical(event)).hexdigest()
    events.append(event)


def finding(number: int = 1) -> dict[str, object]:
    return {
        "id": f"F-{number}",
        "severity": "medium",
        "title": "Acceptance defect",
        "evidence": "src/example.py:1",
        "impact": "Breaks a required case",
        "required_change": "Handle the required case",
        "acceptance_check": "The frozen public gate passes",
    }


class ArtifactValidatorTests(unittest.TestCase):
    seed = "c" * 64
    candidates = ["candidate-a", "candidate-b"]
    base = "a" * 40
    tree = "d" * 40
    prompt_hash = "b" * 64
    config_hash = "e" * 64
    public_gates = ["python -m unittest"]
    hidden_suites = ["hidden-regression-v1"]

    def assignment(self) -> tuple[list[str], str, str]:
        return validate_artifacts.candidate_assignment(self.seed, self.candidates)

    def role_policy(self) -> dict[str, object]:
        policies = {
            role: {
                "max_tokens": 1000,
                "timeout_seconds": 600,
                "environment_sha256": hashlib.sha256(f"env-{role}".encode()).hexdigest(),
                "model_settings_sha256": hashlib.sha256(f"model-{role}".encode()).hexdigest(),
            }
            for role in validate_artifacts.ROLES
        }
        policies["git_worker"]["max_tokens_unavailable_reason"] = None
        return policies

    def public_results(self) -> list[dict[str, object]]:
        return [{"command": self.public_gates[0], "exit_code": 0, "output_digest": "public-pass"}]

    def hidden_results(self) -> list[dict[str, object]]:
        return [{"suite": self.hidden_suites[0], "exit_code": 0, "output_digest": "hidden-pass"}]

    def score(self, total_offset: int = 0) -> dict[str, object]:
        values = {
            "functional_correctness": 40 + total_offset,
            "robustness_security": 12,
            "accessibility_usability": 12,
            "test_effectiveness": 8,
            "maintainability_documentation": 8,
        }
        return {
            "dimensions": {
                name: {"weight": weight, "score": values[name], "evidence": f"Evidence for {name}"}
                for name, weight in validate_artifacts.RUBRIC.items()
            },
            "total": sum(values.values()),
        }

    def write_cycle(self, root: Path, cycle: int, input_snapshot: str, output_snapshot: str,
                    empty: bool = False) -> None:
        cycle_root = root / "arms" / "treatment" / "cycles" / f"{cycle:02d}"
        findings = [] if empty else [finding(cycle)]
        write_json(cycle_root / "review.json", {
            "cycle": cycle,
            "reviewer_instance_id": f"reviewer-{cycle}",
            "context": "current_snapshot_only",
            "snapshot": input_snapshot,
            "findings": findings,
            "token_cost": None,
        })
        if empty:
            return
        write_json(cycle_root / "fix.json", {
            "cycle": cycle,
            "fixer_instance_id": f"fixer-{cycle}",
            "context": "current_findings_only",
            "input_snapshot": input_snapshot,
            "output_snapshot": output_snapshot,
            "addressed_finding_ids": [f"F-{cycle}"],
            "changed_paths": ["src/example.py"],
            "token_cost": 10,
        })
        write_json(cycle_root / "public-gates.json", {
            "cycle": cycle,
            "tester_instance_id": f"tester-{cycle}",
            "snapshot": output_snapshot,
            "results": self.public_results(),
            "token_cost": None,
        })

    def make_valid_run(self, root: Path) -> None:
        ordered, baseline_id, treatment_id = self.assignment()
        assignment = {
            "method": "sha256-baseline-treatment-v2",
            "seed_hex": self.seed,
            "seed_generated_after_both_freezes": True,
            "sorted_candidate_ids": ordered,
            "baseline": baseline_id,
            "treatment": treatment_id,
            "event_sequence": 3,
        }
        write_json(root / "run.json", {
            "schema_version": 2,
            "experimental": True,
            "portability_claim": False,
            "valid": True,
            "invalidation": None,
            "common_start": {"commit": self.base, "tree": self.tree},
            "builder_prompt_sha256": self.prompt_hash,
            "builder_config_sha256": self.config_hash,
            "delegation": {
                "root_role": "orchestration_only",
                "implementation": True,
                "review": True,
                "fix": True,
                "test": True,
                "evaluation": True,
                "git": True,
            },
            "role_policy": self.role_policy(),
            "public_gates": self.public_gates,
            "hidden_suites": self.hidden_suites,
            "max_treatment_cycles": 5,
            "assignment": assignment,
        })

        snapshots: dict[str, str] = {}
        events: list[dict[str, object]] = []
        for index, candidate in enumerate(ordered, 1):
            snapshot = f"{candidate}-initial"
            snapshots[candidate] = snapshot
            add_event(events, "builder_frozen", {"candidate_id": candidate, "snapshot": snapshot})
            write_json(root / "builders" / f"builder-{index}" / "attestation.json", {
                "candidate_id": candidate,
                "builder_instance_id": f"builder-{index}",
                "skill_exposed": False,
                "common_start": {"commit": self.base, "tree": self.tree},
                "builder_prompt_sha256": self.prompt_hash,
                "builder_config_sha256": self.config_hash,
                "initial_snapshot": snapshot,
                "frozen": True,
                "freeze_event_sequence": index,
                "token_cost": None,
            })
        add_event(events, "assignment", {"baseline": baseline_id, "treatment": treatment_id, "seed_hex": self.seed})
        (root / "evidence.jsonl").write_text(
            "".join(json.dumps(event, sort_keys=True) + "\n" for event in events), encoding="utf-8"
        )

        baseline_snapshot = snapshots[baseline_id]
        treatment_initial = snapshots[treatment_id]
        treatment_final = f"{treatment_id}-fixed"
        write_json(root / "arms" / "baseline" / "arm.json", {
            "role": "baseline",
            "candidate_id": baseline_id,
            "initial_snapshot": baseline_snapshot,
            "final_snapshot": baseline_snapshot,
            "cycle_count": 0,
            "stop_reason": "baseline_frozen",
            "convergence_verified": None,
            "token_cost": None,
        })
        write_json(root / "arms" / "treatment" / "arm.json", {
            "role": "treatment",
            "candidate_id": treatment_id,
            "initial_snapshot": treatment_initial,
            "final_snapshot": treatment_final,
            "cycle_count": 2,
            "stop_reason": "zero_findings",
            "convergence_verified": True,
            "token_cost": 25,
        })
        self.write_cycle(root, 1, treatment_initial, treatment_final)
        self.write_cycle(root, 2, treatment_final, treatment_final, empty=True)

        packages = {
            "X": {"source": "baseline_final", "snapshot": baseline_snapshot},
            "Y": {"source": "treatment_initial", "snapshot": treatment_initial},
            "Z": {"source": "treatment_final", "snapshot": treatment_final},
        }
        write_json(root / "evaluation" / "package-map.json", {
            "sealed_from_evaluator": True,
            "randomization_method": "system_csprng_shuffle_v1",
            "randomization_record_sha256": hashlib.sha256(b"test-only-csprng-record").hexdigest(),
            "packages": packages,
        })
        scores = {"X": self.score(0), "Y": self.score(-2), "Z": self.score(3)}
        write_json(root / "evaluation" / "blind.json", {
            "evaluator_instance_id": "evaluator-1",
            "blind_labels": ["X", "Y", "Z"],
            "history_free": True,
            "excluded_context": ["identities", "assignment", "mapping", "history", "costs"],
            "suite_results": {
                label: {"public": self.public_results(), "hidden": self.hidden_results()}
                for label in ("X", "Y", "Z")
            },
            "scores": scores,
            "token_cost": None,
        })
        totals = {
            "baseline_final": scores["X"]["total"],
            "treatment_initial": scores["Y"]["total"],
            "treatment_final": scores["Z"]["total"],
        }
        write_json(root / "evaluation" / "unblinded.json", {
            "unblinder_instance_id": "unblinder-1",
            "scores_unchanged": True,
            "package_mapping": {label: package["source"] for label, package in packages.items()},
            "totals": totals,
            "primary_delta": totals["treatment_final"] - totals["baseline_final"],
            "secondary_delta": totals["treatment_final"] - totals["treatment_initial"],
            "token_cost": None,
        })

    def errors(self, root: Path) -> list[str]:
        return validate_artifacts.validate(root)

    def test_valid_treatment_convergence_and_baseline_zero_cycles(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            self.assertEqual([], self.errors(root))
            baseline = json.loads((root / "arms" / "baseline" / "arm.json").read_text(encoding="utf-8"))
            self.assertEqual((0, "baseline_frozen", None),
                             (baseline["cycle_count"], baseline["stop_reason"], baseline["convergence_verified"]))

    def test_valid_treatment_max_cycle_fix_and_test_is_unverified(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            cycle_two = root / "arms" / "treatment" / "cycles" / "02"
            (cycle_two / "review.json").unlink()
            treatment = json.loads((root / "arms" / "treatment" / "arm.json").read_text(encoding="utf-8"))
            current = treatment["final_snapshot"]
            for cycle in range(2, 6):
                output = f"treatment-fixed-{cycle}"
                self.write_cycle(root, cycle, current, output)
                current = output
            treatment.update({
                "final_snapshot": current,
                "cycle_count": 5,
                "stop_reason": "max_cycles",
                "convergence_verified": False,
            })
            write_json(root / "arms" / "treatment" / "arm.json", treatment)
            package_map_path = root / "evaluation" / "package-map.json"
            package_map = json.loads(package_map_path.read_text(encoding="utf-8"))
            for package in package_map["packages"].values():
                if package["source"] == "treatment_final":
                    package["snapshot"] = current
            write_json(package_map_path, package_map)
            self.assertEqual([], self.errors(root))

    def test_assignment_algorithm_and_direct_mapping_are_verifiable(self) -> None:
        ordered, baseline, treatment = self.assignment()
        self.assertEqual(sorted(self.candidates, key=lambda item: item.encode("utf-8")), ordered)
        self.assertNotEqual(baseline, treatment)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            run_path = root / "run.json"
            run = json.loads(run_path.read_text(encoding="utf-8"))
            run["assignment"]["baseline"], run["assignment"]["treatment"] = (
                run["assignment"]["treatment"], run["assignment"]["baseline"]
            )
            write_json(run_path, run)
            self.assertTrue(any("assignment algorithm" in error for error in self.errors(root)))

    def test_three_snapshot_blind_evaluation_and_deltas(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            self.assertEqual([], self.errors(root))
            package_map = json.loads((root / "evaluation" / "package-map.json").read_text(encoding="utf-8"))
            self.assertEqual(validate_artifacts.SEMANTIC_SNAPSHOTS,
                             {package["source"] for package in package_map["packages"].values()})
            unblinded = json.loads((root / "evaluation" / "unblinded.json").read_text(encoding="utf-8"))
            self.assertEqual(3, unblinded["primary_delta"])
            self.assertEqual(5, unblinded["secondary_delta"])

    def test_rejects_baseline_cycle(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            (root / "arms" / "baseline" / "cycles").mkdir()
            self.assertTrue(any("cycles directory is forbidden" in error for error in self.errors(root)))

    def test_rejects_assignment_before_second_freeze(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            attestation_path = root / "builders" / "builder-2" / "attestation.json"
            attestation = json.loads(attestation_path.read_text(encoding="utf-8"))
            attestation["freeze_event_sequence"] = 3
            write_json(attestation_path, attestation)
            self.assertTrue(any("freeze must precede assignment" in error for error in self.errors(root)))

    def test_rejects_missing_hidden_suite_execution(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            blind_path = root / "evaluation" / "blind.json"
            blind = json.loads(blind_path.read_text(encoding="utf-8"))
            blind["suite_results"]["Y"]["hidden"] = []
            write_json(blind_path, blind)
            self.assertTrue(any("hidden suite required" in error for error in self.errors(root)))

    def test_rejects_duplicate_semantic_evaluation_package(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            map_path = root / "evaluation" / "package-map.json"
            mapping = json.loads(map_path.read_text(encoding="utf-8"))
            mapping["packages"]["Z"] = dict(mapping["packages"]["Y"])
            write_json(map_path, mapping)
            self.assertTrue(any("must be bijective" in error for error in self.errors(root)))

    def test_rejects_wrong_rubric_weight(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            blind_path = root / "evaluation" / "blind.json"
            blind = json.loads(blind_path.read_text(encoding="utf-8"))
            blind["scores"]["X"]["dimensions"]["functional_correctness"]["weight"] = 49
            write_json(blind_path, blind)
            self.assertTrue(any("weight must be 50" in error for error in self.errors(root)))

    def test_rejects_estimated_token_cost(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            arm_path = root / "arms" / "treatment" / "arm.json"
            arm = json.loads(arm_path.read_text(encoding="utf-8"))
            arm["token_cost"] = "~100"
            write_json(arm_path, arm)
            self.assertTrue(any("token_cost" in error for error in self.errors(root)))

    def test_accepts_null_role_cap_with_unavailable_reason(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            run_path = root / "run.json"
            run = json.loads(run_path.read_text(encoding="utf-8"))
            run["role_policy"]["builder"]["max_tokens"] = None
            run["role_policy"]["builder"]["max_tokens_unavailable_reason"] = "platform cannot enforce an exact cap"
            write_json(run_path, run)
            self.assertEqual([], self.errors(root))

    def test_rejects_null_role_cap_without_reason(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            run_path = root / "run.json"
            run = json.loads(run_path.read_text(encoding="utf-8"))
            run["role_policy"]["reviewer"]["max_tokens"] = None
            write_json(run_path, run)
            self.assertTrue(any("unavailable_reason required" in error for error in self.errors(root)))

    def test_rejects_unavailable_reason_with_exact_role_cap(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            run_path = root / "run.json"
            run = json.loads(run_path.read_text(encoding="utf-8"))
            run["role_policy"]["tester"]["max_tokens_unavailable_reason"] = "estimated instead"
            write_json(run_path, run)
            self.assertTrue(any("must be null or absent" in error for error in self.errors(root)))

    def test_rejects_invalid_finding_severity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            path = root / "arms" / "treatment" / "cycles" / "01" / "review.json"
            review = json.loads(path.read_text(encoding="utf-8"))
            review["findings"][0]["severity"] = "urgent"
            write_json(path, review)
            self.assertTrue(any("invalid severity" in error for error in self.errors(root)))

    def test_rejects_evidence_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            path = root / "evidence.jsonl"
            path.write_text(path.read_text(encoding="utf-8").replace("builder_frozen", "builder_changed", 1), encoding="utf-8")
            self.assertTrue(any("event_hash mismatch" in error for error in self.errors(root)))

    def test_malformed_worker_id_reports_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            path = root / "arms" / "treatment" / "cycles" / "01" / "review.json"
            review = json.loads(path.read_text(encoding="utf-8"))
            review["reviewer_instance_id"] = {"not": "hashable"}
            write_json(path, review)
            self.assertTrue(any("worker instance ID required" in error for error in self.errors(root)))


if __name__ == "__main__":
    unittest.main()
