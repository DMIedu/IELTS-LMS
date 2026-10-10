# Private audio processing core and transport draft

Draft PR 6 on feature/academic-lab-mock only. No service account, credentials, host, public/private service deployment or Apps Script setup occurred. No real candidate audio, AI scoring, result persistence or release.

## Actual decoding and measurements

private-audio-service/processor.py validates all three part/receipt identities, bounded container/MIME/base64 and SHA-256 bytes before decoding. FFmpeg receives only an in-memory pipe, a forced supported demuxer and pipe-only protocol whitelist; no nested file/network protocols. Decode processes have a 25-second timeout and a maximum-duration sentinel. Truncated, damaged, too short, overlong and failed decodes are rejected. No temporary audio files are created.

Audio is decoded to 16 kHz mono signed 16-bit PCM. Duration is measured from samples; quiet sections use a provisional -50 dBFS RMS threshold; clipping counts samples near full scale. WebRTC VAD mode 2 examines 20 ms frames for likely voice activity. These are signal/activity checks, not intelligibility or pronunciation assessment. False voice detection and codec padding require native validation.

Implementation follows [FFmpeg pipe/protocol documentation](https://ffmpeg.org/ffmpeg-protocols.html) and [WebRTC VAD frame requirements](https://github.com/wiseman/py-webrtcvad). webrtcvad 2.0.10 and setuptools 70.3.0 are pinned for this draft; production dependency/security acceptance is still pending.

The worker holds insufficient voice activity, mostly quiet clips and clipping before calling any assessor. Duration mismatch against uploaded reported seconds remains checked by the existing Apps Script adapter. Measured container padding is preserved, not replaced with client-reported duration.

The assessor boundary receives verified original container bytes and actual decoded WAV samples for all three parts, pinned private prompts and matching recording identities. A gated Google Gemini native-audio adapter is now included. Without explicit assessor enablement, a valid private key and a pinned model, good-quality audio fails ASSESSOR_NOT_CONFIGURED instead of inventing feedback or scores. Synthetic scorer fixtures are used only in tests. Any future report still requires the Apps Script four-criterion audio-evidence validator and teacher review.

## Disabled transport and packaging

service.py provides a WSGI callable only; importing it does not start a server. It requires explicit worker enablement and a strong separately configured bearer token. POST and exact route/content type, body limit and request identity are checked. Processing is serialised per worker; concurrent requests receive BUSY. Errors contain generic codes and never raw audio/prompts/provider messages.

A bounded per-process cache retains up to 32 successful response envelopes plus payload hashes; exact retry replays, changed payload on the same identity conflicts. Replay eligibility expires after 300 seconds. Expired entries are removed on a later request or process exit, not by a strict background deletion timer. Audio bytes and prompts are not cached. Future feedback metadata would remain private in memory. Cache is not durable/across workers/restarts; it does not guarantee exactly-once provider billing.

Docker packaging runs as a non-root user, with the worker disabled by default. The default container is a stdin processing worker, not a listening HTTP server. Real hosting needs a configured WSGI server, HTTPS/authenticated ingress, request/timeout/resource limits, processing/retention policy and persistent provider idempotency design. No image is published or running outside ephemeral checks.

## Remaining

Gemini account/key/pinned audio-capable model configuration and evaluation; native recording/codec/quality acceptance; privately hosted authenticated service; trusted draft persistence and teacher UI; calibration with independent teacher ratings; retention/hold policy. Full private paper/audio review, measured Listening clips and complete mock/lab pilot remain pending. All native runner/capture/timed/assessment gates stay absent/false and automation stays paused.

## Gated Gemini draft integration

gemini_assessor.py sends all three verified original audio containers, labelled by part, with reviewed private prompts to Google's fixed generateContent host. Original compression preserves the full recording without increasing the inline request beyond a conservative 19 MB bound. Oversized requests fail; there are no Files API uploads or remotely stored file resources in this implementation. MP4 audio uses the documented M4A MIME mapping, pending native acceptance.

The key stays in server configuration and an HTTP header, never in prompts or returned reports. Model identity must match the owner-pinned request. Redirects are refused; HTTP/timeout/parse failures are generic. Safety-blocked/truncated output is rejected. Four bounded criteria and timestamps must cover all parts; unrequested model fields are removed. Report identities come from verified recordings, not model-generated identifiers. Output stays draft and passes the existing Apps Script teacher-review validator.

Google documents audio input and structured JSON responses in its [Generate Content audio guide](https://ai.google.dev/gemini-api/docs/generate-content/audio). This older API remains a draft integration target; actual current model/account compatibility is unverified. No model is selected by default. Native audio input does not establish valid IELTS pronunciation or band scoring: independent teacher calibration is mandatory before release.

DMI_AUDIO_WORKER_ENABLED and DMI_AUDIO_ASSESSOR_ENABLED default false. Native Apps Script gates also remain absent/false. Provider request/response tests stub the HTTP transport; no actual Google API call, billing, key lookup or external candidate processing occurred. Provider data processing/retention terms, account setup, spending/idempotency controls and approved private hosting remain owner setup work.

## Verification

https://github.com/DMIedu/IELTS-LMS/actions/runs/38022220327 at 9a1ecc152072a8960481bf7dabc47a42390574cc passed 19 actual decoder/quality tests, 10 in-process authenticated transport tests, 12 Gemini HTTP-stub tests and 2 container tests (43 new Python test cases), plus all existing mock and login suites. WebM, Ogg and fragmented AAC/MP4 fixtures were generated in CI, actually decoded and checked; synthetic silence was also processed inside an ephemeral network-disabled/read-only container. No real candidate recording, real Google API call or score release. The container image was built only locally in CI and was not published. Browser screenshots remain uninspected locally because computer access is unavailable.
