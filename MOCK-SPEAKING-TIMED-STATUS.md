# Timed Speaking recording draft

Automatic capture and upload recovery are connected to the verified POST dispatcher and exact consolidated draft bundle on feature/academic-lab-mock, draft PR 6. All three gates remain absent/false. No deployment or native setup occurred.

## Server timing and private prompts

The reviewed immutable private paper supplies speakingTiming.part1 (4–12 prompt/seconds objects, total 240–300 seconds), a plain-text cue, and part3 (4–8 objects, total 240–300 seconds). Each question is 15–90 seconds; text is bounded. Part 2 has 60 seconds of preparation followed by 120 seconds of recording. Total 11–13 minutes. This fixed schedule follows the timing ranges in the [IELTS Speaking format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking); it is not an interactive examiner.

The server stores the original start, pinned paper digest and distinct opaque recording identities once. Only the current prompt and current recording window are returned. Future prompts/identities remain private. Refresh, client clock values and repeated starts cannot reset time. New recording starts are allowed within the first 15 seconds of the part; a later join receives no recording identity and requires teacher assistance.

## Automatic recording and recovery

- Consent and a live supported microphone are required before start. Form flags accept only true or literal 'true'. These are client declarations, not trusted evidence of audio quality.
- Part 1 and Part 3 each use one continuous recording across question changes. Part 2 records only the long turn; preparation creates no recorder.
- The page uses elapsed server time with a local monotonic clock to stop at each part deadline. New capture waits for a fresh current-stage server response; a missed start is flagged.
- Three clips can remain pending independently in page memory. A failed earlier upload does not stop later stage capture. Uploads acknowledge in part order; exact uncertain retries reuse identical identity and bytes.
- Acknowledged clips release their raw page-memory data. Refresh restores safe receipt metadata. Refresh/closing before acknowledgement loses pending raw audio; the page warns while audio is pending.
- Microphone errors/disconnection flag a failed recording rather than uploading it as valid. The microphone is released after recording finishes.

## Upload contract

Timed uploads bind to the pinned attempt's part-specific recording identity and begin after that part closes, within 15 minutes of its deadline. Wrong identity, premature/new late uploads, duplicate replacement and oversized/format-mismatched bodies are rejected. Exact already-acknowledged retries and a matching owner-private orphan file recover beyond the grace period without creating another file. Changed retry payloads cannot reuse the same request identity.

Owner-private Drive permission checks and 4 MB limits remain in effect. Magic/MIME and bounded reported duration are validation only; actual audio decoding, content/duration verification and genuine assessment are still pending. The browser can report metadata; this is not cryptographic proof of when speech was recorded. Background-tab or device suspension can delay browser events, so real microphone/clock behavior needs native lab acceptance.

## Gates and remaining work

Keep DMI_MOCK_RUNNER_ENABLED, DMI_MOCK_SPEAKING_ENABLED and DMI_MOCK_SPEAKING_TIMED_ENABLED absent/false. Both papers remain unreviewed/non-installable; no private paper installation, property/folder configuration, account/secret changes, bands or existing results changed.

Timed rehearsal attempts created before recording identities existed fail closed for teacher review; the draft does not reset their original clock.

Still required: private teacher audio playback/review and retention/deletion policy; genuine audio assessment provider/evaluation; actual microphone/headphone and native Drive acceptance; independent paper/audio review and measured Listening clips; objective marking/release; lab pilot. No AI assessment is generated.

Verification: https://github.com/DMIedu/IELTS-LMS/actions/runs/38015442059 at f9b8cb4860b5f8790b57673ce0a48f7d0b75bc0e. Passed 43 server timing/upload checks and 19 timed recording browser checks, plus all existing mock/login checks (32 capture-upload and 15 manual-recording browser checks included). Browser fixtures use real Chromium MediaRecorder with synthetic audio and shortened fake windows, and backend fixtures use fake private storage; no real candidates/Drive uploads. CI screenshots were not visually inspected locally because computer access remains unavailable.
