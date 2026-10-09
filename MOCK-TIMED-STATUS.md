# Timed mock development status

The secure entry screens remain a rehearsal. The timed candidate screen is not enabled.

## Added server lifecycle
- One written attempt per verified candidate and sitting; duplicate start resumes it.
- Private reviewed paper/version loaded from MockPapers, with only current-section question fields returned. Answer keys never appear in candidate responses.
- Server deadlines: Listening recording duration plus two minutes review, then 60 minutes Reading and 60 minutes Writing. Early submission locks answers and waits for the scheduled next section.
- Refresh retains deadlines. Expiry closes each section using its last acknowledged answers. No late draft is silently accepted.
- Revision checks prevent a stale browser tab overwriting a newer draft. Retrying the same most-recent save request is idempotent.
- Closing the entry window stops new starts but does not cancel an existing attempt.
- Written answers stay in MockAttempts. Existing practice ExamResults and Marks are untouched. No band estimate is generated.

## Owner setup, later
Replace the consolidated Code.gs only; do not add MockAttempts.gs separately.
Run initializeMockAttempts after initializeMockTests. This creates two empty tabs, idempotently, and enables no paper.
Keep DMI_MOCK_RUNNER_ENABLED absent/false. Do not enable it until the candidate audio/answer interface and reviewed paper are complete.
MockPapers requires a single immutable version per PaperID; changing a pinned paper stops candidate content delivery while preserving saved answers. A later authoring workflow will manage versions.

## Still required before a lab mock
Original complete paper and keys; paced Listening recordings and playback recovery;
candidate timer/answer UI with offline reconciliation; actual recorded Speaking and private storage;
AI audio assessment integration; teacher marking/release; native test deployment and a lab pilot.
The four-skill mock is not ready for production.

Synthetic lifecycle tests run in tests/mock-attempt.test.js alongside the existing entry/login/native browser checks.

## Listening authoring milestone — 9 October 2026
The owner now has separate private candidate and teacher documents for original DMI Listening 01: four parts and 40 questions, complete scripts, accepted answers, evidence spans and recording cues. Both branding assets are included. All 40 evidence spans and within-part answer order were checked against the saved teacher text.

Two monologue draft voiceovers returned ready previews; four speaker-only dialogue tracks were queued at creation. These are production drafts, not a complete assembled or listened-to master recording. Exact duration/evidence timestamps and headphone/pilot review remain pending. The private scripts and answer keys are deliberately excluded from this public repository. Reviewed=false and AudioReviewed=false; keep the timed runner disabled.

## Reading authoring milestone — 9 October 2026
Separate owner-only candidate and teacher documents now contain the original DMI Reading 01 draft: three passages (2,394 words) and 40 questions for a 60-minute section. Tasks include information identification, sentence completion, paragraph headings, information matching, writer views, multiple choice and summary completion. Both supplied branding assets are included.

The saved candidate copy was checked against all three question sections and contains no answer key. The saved teacher copy has 40 keyed entries: 36 exact evidence spans plus four explicit NOT GIVEN rationales. Completion questions in Passage 1 follow passage order. Text/key verification is complete; independent teacher review, visual layout inspection, calibration and timed lab acceptance are pending. Original passages and answer keys remain outside this public repository. Reviewed=false; do not enable the timed runner yet.
