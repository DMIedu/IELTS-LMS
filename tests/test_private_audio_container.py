"""Ephemeral network-disabled containers with generated audio only."""
import json
from pathlib import Path
import subprocess
import unittest
from test_private_audio_processor import generate, body

class ContainerChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(__file__).parents[1]
        subprocess.run(["docker", "build", "--quiet", "-t", "dmi-audio-check", str(cls.root / "private-audio-service")],
                       capture_output=True, check=True, timeout=240)

    def run_worker(self, request=b"{}", enabled=False):
        args = ["docker", "run", "--rm", "-i", "--network", "none", "--read-only",
                "--memory", "256m", "--cpus", "1"]
        if enabled:
            args += ["-e", "DMI_AUDIO_WORKER_ENABLED=true"]
        return subprocess.run(args + ["dmi-audio-check"], input=request, capture_output=True, timeout=90)

    def test_container_disabled_without_configuration(self):
        result = self.run_worker()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["code"], "WORKER_DISABLED")

    def test_generated_silence_decodes_without_provider_or_network(self):
        request = body(generate("webm", silence=True))
        result = self.run_worker(json.dumps(request).encode(), enabled=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace")[-200:])
        response = json.loads(result.stdout)
        self.assertEqual(len(response["decoded"]), 3)
        self.assertTrue(all(r["speechSeconds"] == 0 and r["silenceRatio"] == 1 for r in response["decoded"]))
        self.assertIsNone(response["assessment"])
        self.assertNotIn("audioBase64", result.stdout.decode())

if __name__ == "__main__":
    unittest.main()
