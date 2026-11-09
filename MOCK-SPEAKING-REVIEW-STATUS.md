# Private Speaking teacher review draft

Implemented only on feature/academic-lab-mock, draft PR 6. All runner/capture/timed gates remain absent/false. No native setup, deployment, account/secret changes, real candidate audio access or result release occurred.

Teachers can open Speaking review from the written attempt, inspect receipt history and explicitly load a recording. All three review endpoints require verified POST teacher authentication. Playback binds the attempt, part and receipt to exactly one owner-private file; stored size, filename, file identity, permissions and byte fingerprint are checked. Lists expose no audio, file IDs or public links. Audio is returned only to the authenticated playback request.

The browser uses a temporary local Blob URL and releases it on close, part change, playback end/error, page exit or account change. Account changes hide the private view and block late responses. Raw audio and notes are not put in browser storage.

Teacher notes append revisioned history without overwriting previous reviews. Exact uncertain-save retries do not duplicate notes; changed payloads and stale revisions fail. Formula-like text is escaped. A private FeedbackDigest preserves retry identity even if Sheets normalises its escape prefix. No AI assessment, bands, Marks or ExamResults writes.

Setup adds RecordingID metadata to existing upload headers and FeedbackDigest to review headers, preserving existing rows. MockSpeakingReviews is additive. No native initialization has run. Legacy receipt fingerprint compatibility is covered by synthetic checks.

Validation: https://github.com/DMIedu/IELTS-LMS/actions/runs/38017917166 at 66d867481744e56341f5755565cbc46e043fea2c passed 32 review server checks and 16 review browser checks, plus all prior suites. Browser audio comes from synthetic Chromium MediaRecorder; backend storage is fake. Screenshots were generated but not visually inspected locally because computer access is unavailable.

Remaining: owner retention/deletion policy, native permission/API/playback acceptance, actual audio decoding/duration verification, genuine audio assessment integration and evaluation, independent paper/audio review, objective marking and teacher-approved release, lab pilot.
