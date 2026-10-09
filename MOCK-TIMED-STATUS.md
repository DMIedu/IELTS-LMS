# Timed mock development status

Both mocks remain disabled drafts. No live/test deployment, paper installation, account changes or runner enablement occurred.

## Implemented draft foundation
- Teacher-selected Mock 01 (original DMI) or Mock 02 (pinned existing-paper sources), verified student login and hashed temporary entry codes.
- One written attempt per candidate/sitting; pinned immutable reviewed paper and server deadlines for Listening duration plus two-minute review, 60-minute Reading and 60-minute Writing.
- Current-section content allowlist excludes keys and future sections. A changed paper blocks candidate delivery while preserving acknowledged work.
- Candidate answer draft with server-clock countdown, eight-second autosave, refresh recovery of acknowledged answers and exact pending-save retry. Unsaved text stays in page memory; it is not durable offline storage. Submitted sections lock without unlocking the next section early.
- Teacher-only acknowledged-answer review and append-only Writing criterion/feedback history. Closed Writing and matching paper required before marking; stale reviews rejected. No Marks/ExamResults writes or result release.
- Bounded private grouped bar chart data for Writing, safely rendered in candidate and teacher screens with an exact-values table.

## Private content adaptation — 9 October 2026
Mock 01 now has an owner-only integrated Listening/Reading/Writing JSON adapter with 40/40/2 questions. Passage text, heading list, Listening plan rows, question order, printed units and accepted key variants were preserved. All 80 objective IDs/key alignments and all 36 positive Reading evidence spans were checked. Four NOT GIVEN rationales remain in the private teacher source. Both Writing tasks and the original chart are retained.

Compact PaperJSON is 42,190 characters, within a single-sheet-cell limit. It is not installable: Reviewed=false, AudioReviewed=false and listeningSeconds=null until the completed recording is assembled and measured. Evidence stays in the linked private teacher source rather than duplicated into the runner cell. Actual questions, keys and data are outside this public repository.

Private original Listening scripts and partial voiceover drafts exist, but dialogue tracks are not assembled into a final master; no human listening review or measured timing is confirmed. Private Writing teacher guidance and Speaking candidate/interviewer prompts exist. Content has not been independently reviewed/calibrated or visually checked in a native lab pilot.

## Owner setup, later
Use the consolidated Code.gs only; do not add modules separately. Run initializeMockTests and initializeMockAttempts on the test copy when native access returns. The latter adds MockPapers, MockAttempts and MockReviews idempotently. No setup was run by these background tasks. Keep DMI_MOCK_RUNNER_ENABLED absent/false.

## Still required
Mock 02 private content adaptation; full Listening recording assembly/duration/playback and recovery; real Speaking recording/private storage and audio-based assessment provider; objective marking and teacher-approved release; independent content/audio/layout review; native Apps Script acceptance and timed lab pilot. The isolated draft candidate/review routes are not linked from live entry.

## Verification
Synthetic entry/attempt/review and native Chromium checks passed on chart implementation commit e27f9c03b85a789192791f9406dd1ffa4e6ca7c6: https://github.com/DMIedu/IELTS-LMS/actions/runs/37980522213
Private adapter JSON was read back and matched the constructed draft, with disabled flags preserved. Native Apps Script acceptance remains pending.
