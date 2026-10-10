# Speaking capture draft status

This is a disabled capture rehearsal on feature/academic-lab-mock, draft PR 6. It is not a complete timed Speaking test or AI assessment. No native setup, folder creation, property change, deployment or runner enablement was performed.

## Implemented

- Student-only microphone capture with consent, fixed Part 1 → 2 → 3 upload order and stops on capture errors. DMI and supplied British Council registration badge appear in the draft header.
- Recording stays in page memory until acknowledged. Closing or refreshing before upload loses that unsaved recording; acknowledged server receipts restore after refresh.
- A lost upload response retains the exact request and audio for retry. Acknowledged parts cannot be overwritten; an orphan file from an interrupted metadata save can be recovered without another file.
- Assigned-candidate access checks and the written-test deadline gate run on the server. Teacher receipt listing returns pending metadata only; it does not yet provide private audio playback.
- Accepts WebM/Opus, Ogg/Opus and MP4 containers with MIME/magic checks, a 4 MB body limit and bounded client-reported duration. These checks do not decode audio or establish genuine duration/content.
- No bands, provider calls or existing Marks/ExamResults writes.

## Disabled storage contract

DMI_MOCK_SPEAKING_ENABLED remains absent/false. A future native setup needs an owner-controlled private DMI_MOCK_SPEAKING_FOLDER_ID and the additive MockSpeakingUploads metadata tab. initializeMockSpeaking exists as a draft; it was not run in a live or test Apps Script project.

The folder and new/recovered files must be owned by the effective deployment owner, show private DriveApp sharing, and have a complete Drive API permissions list containing exactly one user owner. Group/domain/public permissions, pagination and lookup failure are rejected. This requires working Drive API access and the appropriate OAuth permission during later native acceptance. See the [Google Drive permissions list API](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions/list).

Candidate/teacher receipts expose no Drive IDs, audio data or direct recording links. Actual Drive storage behavior and permission inheritance have only synthetic coverage so far.

## Remaining before use

Timed private prompts and server-owned Speaking deadlines; microphone/headphone preflight; genuine audio assessment provider and evaluation; private teacher playback/review; retention/deletion policy; native Apps Script storage acceptance and lab pilot. No automatic band or pronunciation proxy is supplied. Both private papers still need full content/audio review and measured Listening clips.

Local computer access remains unavailable, so screenshots have not been visually inspected. Tests use synthetic microphone audio and fake private storage, with no real candidate recordings.

Latest functional verification: https://github.com/DMIedu/IELTS-LMS/actions/runs/38013443911 at 729b6eb807efb88067ed43c72acd0fd8c7461765. Passed 32 Speaking upload checks and 15 Speaking browser checks, plus 95 attempt/review, 14 Listening, 82 entry backend, 36 entry browser, 18 runner, 10 review, 17 chart and 13 login transport checks. Synthetic storage/audio only; no native acceptance or provider assessment.

## Timed prompt continuation

The server timing module now connects through the verified POST dispatcher, session action list and exact consolidated draft bundle. The timing page remains a microphone-preflight prompt rehearsal and does not record audio. The manual capture rehearsal is separate; automatic recording/upload timing integration is unfinished. See MOCK-SPEAKING-TIMED-STATUS.md for the private schema, disabled gates and passed 30 server/12 timed browser checks.
