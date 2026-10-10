"""Generated audio and synthetic scorer only; no candidate content or service."""
import base64
import copy
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
import unittest
from unittest.mock import patch
import wave

spec = importlib.util.spec_from_file_location("processor", Path(__file__).parents[1] / "private-audio-service" / "processor.py")
processor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(processor)

def generate(kind, seconds=1.2, silence=False):
    codec, output = {"webm": ("libopus", "webm"), "ogg": ("libopus", "ogg"), "mp4": ("aac", "mp4")}[kind]
    source = "anullsrc=r=16000:cl=mono" if silence else "sine=frequency=440:sample_rate=16000"
    args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", source, "-t", str(seconds), "-c:a", codec]
    if kind == "mp4":
        args += ["-movflags", "frag_keyframe+empty_moov"]
    return subprocess.run(args + ["-f", output, "pipe:1"], capture_output=True, check=True, timeout=30).stdout

def clip(raw, part=1, kind="webm"):
    return {"part": part, "receiptID": "synthetic-" + str(part), "audioSHA256": hashlib.sha256(raw).hexdigest(),
            "mime": "audio/" + kind, "audioBase64": base64.b64encode(raw).decode("ascii")}

def body(raw):
    return {"schemaVersion": 1, "requestID": "a" * 64, "attemptID": "synthetic-attempt",
            "provider": "synthetic", "modelVersion": "fixture-v1", "speakingPlan": [{"part": 1, "prompt": "Synthetic question"}],
            "recordings": [clip(raw, part) for part in (1, 2, 3)]}

class DecoderChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tone = generate("webm")
        cls.silent = generate("webm", silence=True)

    def fails(self, call, code):
        with self.assertRaises(processor.ProcessingError) as raised:
            call()
        self.assertEqual(raised.exception.code, code)

    def test_real_webm_ogg_and_mp4_decoding(self):
        for kind in ("webm", "ogg", "mp4"):
            with self.subTest(kind=kind):
                pcm = processor.decode_audio(clip(generate(kind), kind=kind))
                self.assertLess(abs(len(pcm) / 32000 - 1.2), 0.05)
                self.assertGreater(len(pcm), 32000)

    def test_real_silence_voice_activity(self):
        metrics = processor.quality_metrics(processor.decode_audio(clip(self.silent)))
        self.assertEqual(metrics["speechSeconds"], 0)
        self.assertEqual(metrics["silenceRatio"], 1)
        self.assertEqual(metrics["clippingRatio"], 0)
        self.assertTrue(metrics["decodingVerified"] and metrics["speechDetectionVerified"])

    def test_real_non_silent_samples(self):
        metrics = processor.quality_metrics(processor.decode_audio(clip(self.tone)))
        self.assertLess(metrics["silenceRatio"], 0.1)
        self.assertTrue(0 <= metrics["speechSeconds"] <= metrics["decodedSeconds"])
        self.assertEqual(metrics["clippingRatio"], 0)

    def test_real_clipped_pcm(self):
        pcm = struct.pack("<h", 32767) * 16000
        metrics = processor.quality_metrics(pcm)
        self.assertEqual(metrics["clippingRatio"], 1)
        self.assertEqual(metrics["silenceRatio"], 0)

    def test_overlong_and_short_audio_fail_closed(self):
        self.fails(lambda: processor.decode_audio(clip(generate("webm", 126, True), part=2)), "DECODE_FAILED")
        self.fails(lambda: processor.decode_audio(clip(generate("webm", 0.1))), "DECODE_FAILED")

    def test_fake_header_is_not_audio(self):
        raw = bytes([26, 69, 223, 163]) + bytes(124)
        self.fails(lambda: processor.decode_audio(clip(raw)), "DECODE_FAILED")

    def test_container_mismatch(self):
        wrong = clip(self.tone)
        wrong["mime"] = "audio/ogg"
        self.fails(lambda: processor.decode_audio(wrong), "INVALID_AUDIO")

    def test_changed_byte_hash(self):
        wrong = clip(self.tone)
        wrong["audioSHA256"] = "b" * 64
        self.fails(lambda: processor.decode_audio(wrong), "AUDIO_IDENTITY_MISMATCH")

    def test_bad_base64_and_oversized_audio(self):
        wrong = clip(self.tone)
        wrong["audioBase64"] = "not valid base64"
        self.fails(lambda: processor.decode_audio(wrong), "INVALID_AUDIO")
        wrong["audioBase64"] = "A" * 5600001
        self.fails(lambda: processor.decode_audio(wrong), "INVALID_AUDIO")

    def test_duplicate_and_missing_parts(self):
        bad = body(self.tone)
        bad["recordings"][2]["part"] = 1
        self.fails(lambda: processor.process_request(bad), "INVALID_REQUEST")
        bad["recordings"].pop()
        self.fails(lambda: processor.process_request(bad), "INVALID_REQUEST")

    def test_duplicate_receipts(self):
        bad = body(self.tone)
        bad["recordings"][2]["receiptID"] = "synthetic-1"
        self.fails(lambda: processor.process_request(bad), "INVALID_REQUEST")

    def test_bounded_metadata(self):
        for key, value in (("schemaVersion", True), ("requestID", "bad"), ("provider", ""), ("speakingPlan", [])):
            bad = body(self.tone)
            bad[key] = value
            with self.subTest(key=key):
                self.fails(lambda: processor.process_request(bad), "INVALID_REQUEST")

    def test_real_silence_holds_without_assessor(self):
        calls = []
        result = processor.process_request(body(self.silent), assessor=lambda *args: calls.append(args))
        self.assertIsNone(result["assessment"])
        self.assertEqual(calls, [])
        self.assertEqual(len(processor.quality_holds(result["decoded"])), 3)
        self.assertNotIn("audioBase64", json.dumps(result))
        self.assertNotIn("wavBytes", json.dumps(result))

    def test_quality_thresholds(self):
        good = {"part": 1, "speechSeconds": 20, "silenceRatio": 0.1, "clippingRatio": 0}
        self.assertEqual(processor.quality_holds([good]), [])
        self.assertEqual(processor.quality_holds([{**good, "speechSeconds": 0}])[0]["code"], "INSUFFICIENT_SPEECH")
        self.assertEqual(processor.quality_holds([{**good, "silenceRatio": 0.95}])[0]["code"], "INSUFFICIENT_SPEECH")
        self.assertEqual(processor.quality_holds([{**good, "clippingRatio": 0.1}])[0]["code"], "CLIPPING")

    def test_wave_samples_are_available_to_scorer_only(self):
        source = body(self.tone)
        snapshot = json.dumps(source)
        pcm = struct.pack("<h", 1000) * (16000 * 30)
        metrics = lambda raw: {"decodedSeconds": 30, "speechSeconds": 20, "silenceRatio": 0.1, "clippingRatio": 0,
                               "decodingVerified": True, "speechDetectionVerified": True}
        received = []
        def assessor(request, audio, decoded):
            received.extend(audio)
            return {"attemptID": request["attemptID"], "provider": request["provider"], "modelVersion": request["modelVersion"],
                    "status": "draft", "audioEvaluated": True}
        result = processor.process_request(source, assessor=assessor, decoder=lambda r: pcm, metrics=metrics)
        self.assertEqual(result["assessment"]["status"], "draft")
        self.assertEqual(len(received), 3)
        for r in received:
            with wave.open(io.BytesIO(r["wavBytes"]), "rb") as wav:
                self.assertEqual((wav.getnchannels(), wav.getframerate(), wav.getsampwidth()), (1, 16000, 2))
                self.assertEqual(wav.getnframes(), 16000 * 30)
        self.assertEqual(json.dumps(source), snapshot)
        self.assertNotIn("wavBytes", json.dumps(result))

    def test_good_quality_does_not_fabricate_ai(self):
        pcm = bytes(16000 * 30 * 2)
        metrics = lambda raw: {"decodedSeconds": 30, "speechSeconds": 20, "silenceRatio": 0.1, "clippingRatio": 0,
                               "decodingVerified": True, "speechDetectionVerified": True}
        self.fails(lambda: processor.process_request(body(self.tone), decoder=lambda r: pcm, metrics=metrics), "ASSESSOR_NOT_CONFIGURED")
        self.fails(lambda: processor.process_request(body(self.tone), decoder=lambda r: pcm, metrics=metrics,
                     assessor=lambda *args: {"status": "released"}), "ASSESSMENT_INVALID")

    def test_decoder_command_has_no_file_or_network_protocols(self):
        with patch.object(processor.subprocess, "run") as runner:
            runner.return_value = type("Result", (), {"returncode": 0, "stdout": bytes(32000)})()
            processor.decode_audio(clip(self.tone))
            args, options = runner.call_args
            command = args[0]
            self.assertEqual(command[command.index("-protocol_whitelist") + 1], "pipe")
            self.assertEqual(command[command.index("-i") + 1], "pipe:0")
            self.assertEqual(options["timeout"], 25)
            self.assertNotIn("shell", options)

    def test_decoder_timeout_fails_without_raw_errors(self):
        with patch.object(processor.subprocess, "run", side_effect=subprocess.TimeoutExpired("synthetic", 25)):
            self.fails(lambda: processor.decode_audio(clip(self.tone)), "DECODE_FAILED")

    def test_worker_disabled_by_default(self):
        environment = {k: v for k, v in os.environ.items() if k != "DMI_AUDIO_WORKER_ENABLED"}
        result = subprocess.run([sys.executable, str(Path(processor.__file__))], input=b"{}", capture_output=True, env=environment, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["code"], "WORKER_DISABLED")

if __name__ == "__main__":
    unittest.main()
