#!/usr/bin/env python3
"""Tests for validate_artifacts.py using only the standard library."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import validate_artifacts


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def add_event(events: list[dict[str, object]], kind: str, payload: object) -> None:
    event: dict[str, object] = {
        "sequence": len(events) + 1,
        "kind": kind,
        "payload": payload,
        "previous_event_hash": events[-1]["event_hash"] if events else None,
    }
    event["event_hash"] = hashlib.sha256(validate_artifacts.canonical(event)).hexdigest()
    events.append(event)


class ArtifactValidatorTests(unittest.TestCase):
    def make_valid_run(self, root: Path) -> None:
        base = "a" * 40
        gates = ["python -m unittest"]
        candidates = ["candidate-a", "candidate-b"]
        seed_hex = "c" * 64
        material = bytes.fromhex(seed_hex) + b"\0" + candidates[0].encode() + b"\0" + candidates[1].encode()
        x_index = hashlib.sha256(material).digest()[0] & 1
        assignment = {"X": candidates[x_index], "Y": candidates[1 - x_index]}
        write_json(root / "run.json", {
            "schema_version": 1,
            "experimental": True,
            "portability_claim": False,
            "base_commit": base,
            "builder_prompt_sha256": "b" * 64,
            "assignment": {
                "performed_after_both_freezes": True,
                "method": "sha256-seed-parity-v1",
                "seed_hex": seed_hex,
                **assignment,
            },
            "public_gates": gates,
            "max_cycles": 5,
        })
        for label, candidate in assignment.items():
            arm_root = root / "arms" / label
            write_json(arm_root / "arm.json", {
                "label": label,
                "candidate_id": candidate,
                "base_commit": base,
                "builder_prompt_sha256": "b" * 64,
                "initial_frozen_before_assignment": True,
                "initial_snapshot": f"{label}-initial",
                "final_snapshot": f"{label}-fixed",
                "stop_reason": "zero_findings",
                "convergence_verified": True,
                "token_cost": None,
            })
            write_json(arm_root / "cycles" / "01" / "review.json", {
                "cycle": 1,
                "reviewer_instance_id": f"reviewer-{label}-1",
                "context": "current_snapshot_only",
                "snapshot": f"{label}-initial",
                "token_cost": None,
                "findings": [{
                    "id": "F-1", "severity": "medium", "title": "Defect",
                    "evidence": "src/example.py:1", "impact": "Breaks an acceptance case",
                    "required_change": "Handle the case", "acceptance_check": "Gate passes",
                }],
            })
            write_json(arm_root / "cycles" / "01" / "fix.json", {
                "cycle": 1,
                "fixer_instance_id": f"fixer-{label}-1",
                "context": "current_findings_only",
                "input_snapshot": f"{label}-initial",
                "output_snapshot": f"{label}-fixed",
                "addressed_finding_ids": ["F-1"],
                "changed_paths": ["src/example.py"],
                "token_cost": 12,
            })
            write_json(arm_root / "cycles" / "01" / "public-gates.json", {
                "cycle": 1,
                "snapshot": f"{label}-fixed",
                "tester_instance_id": f"tester-{label}-1",
                "token_cost": None,
                "results": [{"command": gates[0], "exit_code": 0, "output_digest": "passed"}],
            })
            write_json(arm_root / "cycles" / "02" / "review.json", {
                "cycle": 2,
                "reviewer_instance_id": f"reviewer-{label}-2",
                "context": "current_snapshot_only",
                "snapshot": f"{label}-fixed",
                "token_cost": 7,
                "findings": [],
            })
        write_json(root / "evaluation" / "blind.json", {
            "evaluator_instance_id": "evaluator-1",
            "blind_labels": ["X", "Y"],
            "excluded_context": ["identities", "assignment", "history", "costs"],
            "winner": "tie",
            "rubric": [{"dimension": "correctness", "X": 1, "Y": 1}],
            "evidence": ["Both snapshots pass the frozen gate"],
            "token_cost": None,
        })
        events: list[dict[str, object]] = []
        add_event(events, "run_frozen", {"base_commit": base})
        add_event(events, "evaluation_complete", {"winner": "tie"})
        (root / "evidence.jsonl").write_text("".join(json.dumps(e, sort_keys=True) + "\n" for e in events), encoding="utf-8")

    def validate(self, root: Path) -> tuple[int, list[str]]:
        errors: list[str] = []
        run = validate_artifacts.validate_run(root, errors)
        workers: set[str] = set()
        validate_artifacts.validate_arm(root, "X", run, workers, errors)
        validate_artifacts.validate_arm(root, "Y", run, workers, errors)
        validate_artifacts.validate_evaluation(root, workers, errors)
        validate_artifacts.validate_evidence(root, errors)
        return (0 if not errors else 1), sorted(errors)

    def test_valid_run(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            self.assertEqual((0, []), self.validate(root))

    def test_rejects_estimated_token_cost(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            arm_path = root / "arms" / "X" / "arm.json"
            arm = json.loads(arm_path.read_text(encoding="utf-8"))
            arm["token_cost"] = "~100"
            write_json(arm_path, arm)
            status, errors = self.validate(root)
            self.assertEqual(1, status)
            self.assertTrue(any("token_cost" in error for error in errors))

    def test_rejects_evidence_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            events = (root / "evidence.jsonl").read_text(encoding="utf-8").replace("run_frozen", "run_changed", 1)
            (root / "evidence.jsonl").write_text(events, encoding="utf-8")
            status, errors = self.validate(root)
            self.assertEqual(1, status)
            self.assertTrue(any("event_hash mismatch" in error for error in errors))

    def test_malformed_worker_id_reports_error_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            review_path = root / "arms" / "X" / "cycles" / "01" / "review.json"
            review = json.loads(review_path.read_text(encoding="utf-8"))
            review["reviewer_instance_id"] = {"not": "hashable"}
            write_json(review_path, review)
            status, errors = self.validate(root)
            self.assertEqual(1, status)
            self.assertTrue(any("reviewer_instance_id required" in error for error in errors))

    def test_cycle_five_fix_remains_unverified(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_valid_run(root)
            arm_root = root / "arms" / "X"
            for cycle in range(2, 6):
                previous = "X-fixed" if cycle == 2 else f"X-fixed-{cycle - 1}"
                output = f"X-fixed-{cycle}"
                write_json(arm_root / "cycles" / f"{cycle:02d}" / "review.json", {
                    "cycle": cycle, "reviewer_instance_id": f"max-reviewer-{cycle}",
                    "context": "current_snapshot_only", "snapshot": previous,
                    "token_cost": None,
                    "findings": [{"id": f"F-{cycle}", "severity": "low", "title": "Defect",
                        "evidence": "file:1", "impact": "Impact", "required_change": "Fix it",
                        "acceptance_check": "Check it"}],
                })
                write_json(arm_root / "cycles" / f"{cycle:02d}" / "fix.json", {
                    "cycle": cycle, "fixer_instance_id": f"max-fixer-{cycle}",
                    "context": "current_findings_only", "input_snapshot": previous,
                    "output_snapshot": output, "addressed_finding_ids": [f"F-{cycle}"],
                    "changed_paths": ["file"], "token_cost": None,
                })
                write_json(arm_root / "cycles" / f"{cycle:02d}" / "public-gates.json", {
                    "cycle": cycle, "snapshot": output, "tester_instance_id": f"max-tester-{cycle}",
                    "token_cost": None,
                    "results": [{"command": "python -m unittest", "exit_code": 0, "output_digest": "passed"}],
                })
            arm = json.loads((arm_root / "arm.json").read_text(encoding="utf-8"))
            arm.update({"final_snapshot": "X-fixed-5", "stop_reason": "max_cycles", "convergence_verified": False})
            write_json(arm_root / "arm.json", arm)
            status, errors = self.validate(root)
            self.assertEqual((0, []), (status, errors))


if __name__ == "__main__":
    unittest.main()
