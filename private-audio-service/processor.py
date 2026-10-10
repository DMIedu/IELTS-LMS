"""Private audio-processing core draft. No hosting, provider or result release."""
import array
import base64
import hashlib
import io
import json
import math
import os
import re
import subprocess
import sys
import wave
import webrtcvad

RATE = 16000
MAX_AUDIO = 4194304
MAX_BODY = 18 * 1024 * 1024

class ProcessingError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)

def reject(code="INVALID_AUDIO"):
    raise ProcessingError(code)

def unpack_audio(recording):
    if not isinstance(recording, dict) or type(recording.get("part")) is not int or recording["part"] not in (1, 2, 3):
        reject("INVALID_REQUEST")
    mime = recording.get("mime")
    kinds = {"audio/webm": "matroska", "audio/webm;codecs=opus": "matroska",
             "audio/ogg": "ogg", "audio/ogg;codecs=opus": "ogg", "audio/mp4": "mov"}
    if not isinstance(mime, str) or mime not in kinds:
        reject()
    encoded = recording.get("audioBase64")
    if not isinstance(encoded, str) or len(encoded) > 5600000:
        reject()
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError):
        reject()
    if not 64 <= len(raw) <= MAX_AUDIO:
        reject()
    valid = (kinds[mime] == "matroska" and raw[:4] == bytes([26, 69, 223, 163])
             or kinds[mime] == "ogg" and raw[:4] == b"OggS"
             or kinds[mime] == "mov" and raw[4:8] == b"ftyp")
    if not valid or not isinstance(recording.get("receiptID"), str) or not recording["receiptID"] or len(recording["receiptID"]) > 100:
        reject()
    if recording.get("audioSHA256") != hashlib.sha256(raw).hexdigest():
        reject("AUDIO_IDENTITY_MISMATCH")
    return raw, kinds[mime]

def decode_audio(recording):
    raw, demuxer = unpack_audio(recording)
    maximum = 125 if recording["part"] == 2 else 360
    # Pipe-only input blocks nested file/network references. A one-second sentinel
    # detects overlong streams instead of accepting a truncated maximum-length clip.
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-threads", "1",
               "-protocol_whitelist", "pipe", "-f", demuxer, "-i", "pipe:0",
               "-map", "0:a:0", "-vn", "-t", str(maximum + 1), "-ac", "1",
               "-ar", str(RATE), "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"]
    try:
        result = subprocess.run(command, input=raw, capture_output=True, timeout=25, check=False)
    except (OSError, subprocess.TimeoutExpired):
        reject("DECODE_FAILED")
    pcm = result.stdout
    if result.returncode or len(pcm) % 2 or not RATE * 2 <= len(pcm) <= maximum * RATE * 2:
        reject("DECODE_FAILED")
    return pcm

def quality_metrics(pcm, vad_factory=webrtcvad.Vad):
    if len(pcm) < RATE * 2 or len(pcm) % 2:
        reject("DECODE_FAILED")
    samples = array.array("h", pcm)
    if sys.byteorder != "little":
        samples.byteswap()
    vad = vad_factory(2)
    frame_samples = RATE // 50
    frame_bytes = frame_samples * 2
    speech_frames = 0
    quiet_frames = 0
    frames = len(pcm) // frame_bytes
    for offset in range(0, frames * frame_bytes, frame_bytes):
        frame = pcm[offset:offset + frame_bytes]
        values = samples[offset // 2:offset // 2 + frame_samples]
        # -50 dBFS quiet threshold is provisional. VAD activity is separate.
        rms = math.sqrt(sum(v * v for v in values) / frame_samples) / 32768
        quiet_frames += rms < 10 ** (-50 / 20)
        speech_frames += bool(vad.is_speech(frame, RATE))
    return {"decodedSeconds": len(samples) / RATE,
            "speechSeconds": speech_frames * 0.02,
            "silenceRatio": quiet_frames / frames,
            "clippingRatio": sum(abs(v) >= 32760 for v in samples) / len(samples),
            "decodingVerified": True, "speechDetectionVerified": True}

def quality_holds(decoded):
    holds = []
    for item in decoded:
        if item["speechSeconds"] < (10 if item["part"] == 2 else 5) or item["silenceRatio"] >= 0.95:
            holds.append({"part": item["part"], "code": "INSUFFICIENT_SPEECH"})
        if item["clippingRatio"] >= 0.1:
            holds.append({"part": item["part"], "code": "CLIPPING"})
    return holds

def validate_envelope(body):
    if not isinstance(body, dict) or type(body.get("schemaVersion")) is not int or body["schemaVersion"] != 1:
        reject("INVALID_REQUEST")
    if not isinstance(body.get("requestID"), str) or not re.fullmatch("[a-f0-9]{64}", body["requestID"]):
        reject("INVALID_REQUEST")
    for key in ("attemptID", "provider", "modelVersion"):
        if not isinstance(body.get(key), str) or not body[key].strip() or len(body[key]) > 100:
            reject("INVALID_REQUEST")
    plan = body.get("speakingPlan")
    if not isinstance(plan, list) or not 1 <= len(plan) <= 24 or len(json.dumps(plan)) > 40000:
        reject("INVALID_REQUEST")
    clips = body.get("recordings")
    if not isinstance(clips, list) or len(clips) != 3 or any(not isinstance(r, dict) for r in clips):
        reject("INVALID_REQUEST")
    if sorted(r.get("part", 0) for r in clips if type(r.get("part")) is int) != [1, 2, 3]:
        reject("INVALID_REQUEST")
    if any(not isinstance(r.get("receiptID"), str) or not r["receiptID"] for r in clips) or len({r["receiptID"] for r in clips}) != 3:
        reject("INVALID_REQUEST")
    return clips

def wav_bytes(pcm):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(pcm)
    return output.getvalue()

def process_request(body, assessor=None, decoder=decode_audio, metrics=quality_metrics):
    clips = validate_envelope(body)
    decoded = []
    prepared = []
    # Decode all three before any assessor invocation; all audio remains in memory.
    for clip in sorted(clips, key=lambda r: r["part"]):
        source, _ = unpack_audio(clip)
        pcm = decoder(clip)
        details = metrics(pcm)
        decoded.append({"part": clip["part"], "receiptID": clip["receiptID"],
                        "audioSHA256": clip["audioSHA256"], **details})
        prepared.append({"part": clip["part"], "receiptID": clip["receiptID"],
                         "audioSHA256": clip["audioSHA256"], "wavBytes": wav_bytes(pcm),
                         "sourceBytes": source, "mime": clip["mime"]})
    response = {"requestID": body["requestID"], "decoded": decoded, "assessment": None}
    if quality_holds(decoded):
        return response
    if assessor is None:
        reject("ASSESSOR_NOT_CONFIGURED")
    # An eventual private audio-capable assessor receives actual WAV bytes, not
    # merely a transcript. Production provider integration is deliberately absent.
    report = assessor(body, prepared, decoded)
    if not isinstance(report, dict) or report.get("attemptID") != body["attemptID"] or report.get("provider") != body["provider"] or report.get("modelVersion") != body["modelVersion"] or report.get("status") != "draft" or report.get("audioEvaluated") is not True:
        reject("ASSESSMENT_INVALID")
    response["assessment"] = report
    if len(json.dumps(response, allow_nan=False)) > 262144:
        reject("ASSESSMENT_INVALID")
    return response

def main():
    if os.environ.get("DMI_AUDIO_WORKER_ENABLED") != "true":
        reject("WORKER_DISABLED")
    raw = sys.stdin.buffer.read(MAX_BODY + 1)
    if len(raw) > MAX_BODY:
        reject("REQUEST_TOO_LARGE")
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeError):
        reject("INVALID_REQUEST")
    from gemini_assessor import configured_assessor
    result = process_request(body, assessor=configured_assessor())
    sys.stdout.write(json.dumps(result, allow_nan=False))

if __name__ == "__main__":
    sys.modules["processor"] = sys.modules[__name__]
    try:
        main()
    except Exception as error:
        # Never log uploaded audio, prompts, FFmpeg errors or provider responses.
        code = error.code if isinstance(error, ProcessingError) else "PROCESSING_FAILED"
        sys.stdout.write(json.dumps({"ok": False, "code": code}))
        sys.exit(1)
