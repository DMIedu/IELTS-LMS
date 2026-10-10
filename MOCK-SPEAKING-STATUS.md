# Speaking capture draft status

Speaking capture remains disabled on feature/academic-lab-mock, draft PR 6. No native storage setup, deployment, property/account/secret change, result release or runner enablement occurred.

The manual capture page supports consent, Part 1 → 2 → 3 upload order, microphone failure handling, fixed pending clip identity, exact retries and safe receipt refresh. The timed Speaking page now records parts automatically against server-owned windows and retains independent pending clips during upload failures. See MOCK-SPEAKING-TIMED-STATUS.md for exact timing and grace rules.

Raw audio stays in page memory until acknowledgement; closing or refreshing early loses pending audio. After acknowledgement, safe receipt metadata restores from the server. Exact retry recovers uncertain responses and matching orphan files without duplicate files. Teacher API lists pending receipt metadata only; private audio playback is not implemented.

Storage remains gated by DMI_MOCK_SPEAKING_ENABLED and a later owner-private DMI_MOCK_SPEAKING_FOLDER_ID. The additive MockSpeakingUploads setup function has not run in any native project. Folder/new or recovered files must be owner-private with a complete permission list containing only the effective owner's user permission. Sharing, groups, pagination or permission lookup failure fail closed. See [Google Drive permissions list](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions/list). Native OAuth/API availability and Drive inheritance behavior remain unverified.

Accepts bounded WebM/Opus, Ogg/Opus or MP4 containers with MIME/magic checks, at most 4 MB, and reported duration limits. Actual decoding/duration/content validation and genuine audio assessment remain pending. Receipts expose no audio data, file IDs or direct links; no bands/provider calls/Marks or ExamResults writes.

Still required: private teacher audio playback and review, retention/deletion policy, genuine provider evaluation, native storage/microphone/headphone acceptance, full content/audio review and lab pilot. All runner/capture/timed gates remain absent/false.

Latest verification: https://github.com/DMIedu/IELTS-LMS/actions/runs/38015442059: 43 timed server checks, 19 timed recording browser checks and existing synthetic checks passed. No real recordings or Drive writes; screenshots not visually inspected locally.
