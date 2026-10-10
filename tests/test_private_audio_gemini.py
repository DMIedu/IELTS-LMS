"""Stub HTTP responses only: zero provider calls or real recordings."""
import base64
import copy
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parents[1] / "private-audio-service"))
from gemini_assessor import GeminiAssessor, NoRedirect, configured_assessor
from processor import ProcessingError

class GeminiChecks(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.criteria = {key: {"band": 6, "feedback": "Synthetic feedback", "evidence": [
            {"part": part, "source": "audio", "startSeconds": 0, "endSeconds": 1, "observation": "Synthetic observation"}
            for part in (1, 2, 3)]} for key in ("fluencyCoherence", "lexicalResource", "grammar", "pronunciation")}
        self.body = {"attemptID": "synthetic-attempt", "provider": "google-gemini", "modelVersion": "gemini-fixture-test",
                     "speakingPlan": [{"prompt": "Synthetic question"}]}
        self.prepared = [{"part": part, "sourceBytes": b"synthetic-audio-" + str(part).encode(), "mime": "audio/webm"}
                         for part in (1, 2, 3)]
        self.decoded = [{"part": part, "receiptID": "synthetic-" + str(part), "audioSHA256": str(part) * 64,
                         "decodedSeconds": 30} for part in (1, 2, 3)]
        self.finish = "STOP"
        def transport(url, headers, payload):
            self.calls.append((url, headers, json.loads(payload)))
            return {"candidates": [{"finishReason": self.finish, "content": {"parts": [{"text": json.dumps(self.criteria)}]}}]}
        self.assessor = GeminiAssessor("synthetic-key-" * 4, "gemini-fixture-test", transport)

    def fails(self, call, code):
        with self.assertRaises(ProcessingError) as raised:
            call()
        self.assertEqual(raised.exception.code, code)

    def test_disabled_without_account_or_key(self):
        with patch.dict(os.environ, {"DMI_AUDIO_ASSESSOR_ENABLED": "false"}):
            self.assertIsNone(configured_assessor())

    def test_explicit_configuration_required(self):
        self.fails(lambda: GeminiAssessor("", "gemini-fixture-test"), "ASSESSOR_NOT_CONFIGURED")
        self.fails(lambda: GeminiAssessor("synthetic-key-" * 4, "../other"), "ASSESSOR_NOT_CONFIGURED")

    def test_model_identity_pinned_before_audio_egress(self):
        self.fails(lambda: self.assessor({**self.body, "modelVersion": "other"}, self.prepared, self.decoded),
                   "ASSESSOR_MODEL_MISMATCH")
        self.assertEqual(self.calls, [])

    def test_three_actual_audio_payloads_not_transcript_proxy(self):
        report = self.assessor(self.body, self.prepared, self.decoded)
        url, headers, body = self.calls[0]
        self.assertEqual(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-fixture-test:generateContent")
        self.assertIn("x-goog-api-key", headers)
        parts = body["contents"][0]["parts"]
        audio = [p["inline_data"] for p in parts if "inline_data" in p]
        self.assertEqual([base64.b64decode(r["data"]) for r in audio], [r["sourceBytes"] for r in self.prepared])
        self.assertNotIn(headers["x-goog-api-key"], json.dumps(body))
        self.assertEqual(report["status"], "draft")
        self.assertEqual(len(report["recordings"]), 3)
        self.assertEqual(report["criteria"]["pronunciation"]["band"], 6)

    def test_provider_mp4_mime_mapping(self):
        self.prepared[0]["mime"] = "audio/mp4"
        self.assessor(self.body, self.prepared, self.decoded)
        self.assertEqual(self.calls[0][2]["contents"][0]["parts"][3]["inline_data"]["mime_type"], "audio/m4a")

    def test_safety_block_or_truncation_rejected(self):
        self.finish = "MAX_TOKENS"
        self.fails(lambda: self.assessor(self.body, self.prepared, self.decoded), "ASSESSMENT_INVALID")

    def test_missing_criterion_and_transcript_evidence_rejected(self):
        original = copy.deepcopy(self.criteria)
        del self.criteria["pronunciation"]
        self.fails(lambda: self.assessor(self.body, self.prepared, self.decoded), "ASSESSMENT_INVALID")
        self.criteria = original
        self.criteria["pronunciation"]["evidence"][0]["source"] = "transcript"
        self.fails(lambda: self.assessor(self.body, self.prepared, self.decoded), "ASSESSMENT_INVALID")

    def test_impossible_timestamps_or_bands_rejected(self):
        self.criteria["grammar"]["evidence"][0]["endSeconds"] = 999
        self.fails(lambda: self.assessor(self.body, self.prepared, self.decoded), "ASSESSMENT_INVALID")
        self.criteria["grammar"]["evidence"][0]["endSeconds"] = 1
        self.criteria["grammar"]["band"] = True
        self.fails(lambda: self.assessor(self.body, self.prepared, self.decoded), "ASSESSMENT_INVALID")

    def test_oversized_request_never_sent(self):
        self.prepared[0]["sourceBytes"] = bytes(15000000)
        self.fails(lambda: self.assessor(self.body, self.prepared, self.decoded), "ASSESSOR_REQUEST_TOO_LARGE")
        self.assertEqual(self.calls, [])

    def test_redirect_handler_refuses_follow(self):
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://other.example.com"))

if __name__ == "__main__":
    unittest.main()
