# Retention and audio-assessment contract drafts

Draft PR 6 on feature/academic-lab-mock only. No deletion, AI provider calls, merge/deployment, runner enablement, credentials or result changes.

## Owner retention preview

previewMockSpeakingRetention(days) is an owner-only manual dry run, not a web endpoint or scheduled job. Both active and effective account emails must match the deployment owner; unknown active identity fails closed. The caller must explicitly supply an integer 7–365 days. This range is a draft implementation bound, not an approved retention policy. Nothing is saved as policy and no default is applied.

Preview compares upload timestamps against a fixed server cutoff, lists old receipts, and separately holds malformed/future timestamps, duplicate receipt/file/attempt-part identities, missing files and filename/file-ID/description conflicts. Folder and candidate-file permission checks fail closed if sharing or permission uncertainty exists. It never reads audio bytes or returns Drive IDs, raw audio or public links.

Matching receipt review notes are counted; absence flags holdForAssessment. Presence of a note does not establish assessment completion or deletion approval. Every candidate remains deletionApproved=false. No files, receipts, notes, accounts or result sheets are altered. Owner retention choice, appeals/legal holds, audit/tombstone design and explicit deletion acceptance remain pending.

## Assessment response contract

MockSpeakingAssessment.gs validates a proposed private provider response only. It is inactive: no dispatcher endpoint, provider request, generated score, persistence or release path.

The caller must supply exactly three server-verified decoded recordings with matching attempt, part, receipt and SHA-256 byte identity. Submitted provider metadata must match these identities and durations. Missing/duplicate parts, unverified decoding, changed audio identity and transcript-only responses fail.

All four criteria are required: fluency/coherence, lexical resource, grammar, pronunciation. The schema requires bounded integer criterion estimates, bounded feedback and timestamped audio observations covering all three parts. Output remains draft with teacherReviewRequired=true and releaseApproved=false; there is no overall band or result write.

These four criteria follow the [official IELTS Speaking assessment criteria](https://ielts.org/cdn/Guides/ielts-speaking-key-assessment-criteria.pdf). This is a DMI practice assessment contract, not an official IELTS examination or certified examiner score.

The provider's audioEvaluated flag and evidence are claims, not proof of valid assessment. Shape/binding checks cannot establish scoring accuracy. Actual trusted audio decoding, speech sufficiency/silence detection, an audio-capable service configuration, private external processing approval, calibration against independent teacher ratings and native acceptance are still required. No model/service was chosen and no secret was read or configured.

## Verification

Synthetic private-folder retention and synthetic response fixtures only. All runner/capture/timed gates stay absent/false. Native Apps Script, real microphones/Drive recordings and visual screenshot acceptance remain pending.

Passed 27 retention preview checks and 27 assessment contract checks, plus all existing mock/login suites: https://github.com/DMIedu/IELTS-LMS/actions/runs/38018614061 at 9307ea0613a197e6d269ba1dbfc5f1480edaacb0. Synthetic fixtures only; providerCalls=0, deletions=0, bandsReleased=0. Exact draft modules are included in the consolidated bundle.
