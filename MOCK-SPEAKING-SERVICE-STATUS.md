# Disabled private audio-service connection

Only feature/academic-lab-mock, draft PR 6. No real service, decoder or AI model has run. This is a transport and response-validation draft, not working AI marking.

## Owner pilot

previewMockSpeakingAssessment(attemptID) is a manual owner-only pilot, with no public dispatcher endpoint or candidate/teacher-page button. Active/effective owner identity must match, and the owner must also pass the existing active teacher-account check. The immutable private paper must have reviewed Speaking timing and all three recording receipts must exist.

Each recording passes the existing private permission, file identity and byte fingerprint checks before an external request could be sent. The configured HTTPS endpoint must match a separately pinned host; credentials, alternate ports, query strings, IP/local host literals and redirects are rejected. Bearer credential and endpoint come only from owner properties; no property was configured or secret read natively. Google documents redirect control in [UrlFetchApp](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app).

A service request contains opaque attempt/receipt identities, byte hashes, three audio payloads, pinned private Speaking prompts and provider/version identity. It excludes candidate emails and Drive file IDs. The retry key binds the same attempt, paper and recordings to that provider/version. The gateway must implement idempotency; sending this key alone cannot guarantee avoidance of repeat charges.

Non-200, redirected, thrown, oversized and invalid-JSON responses fail with generic errors, without exposing service response bodies/tokens. The response must match the request identity and configured provider/version.

## Quality and review holds

The service must actually decode each container and perform speech detection, returning matching SHA-256, receipt identity, decoded seconds, speech seconds, silence fraction and clipping fraction. Validation rejects missing/duplicate parts, mismatched identities, unverified decoding/detection, impossible or unbounded metrics.

Draft review thresholds: decoded/reported duration difference over 5 seconds; less than 5 seconds detected speech in Parts 1/3 or 10 seconds in Part 2; silence fraction at least 95%; clipping fraction at least 10%. These are provisional lab thresholds, not IELTS scoring rules or validated sound-quality measures. A hold discards any proposed assessment, flags teacher review and releases nothing. Silence/amplitude alone does not establish intelligibility, speech correctness or pronunciation.

A passing response goes through the previous four-criterion audio-evidence validator and remains a teacher-review draft. Provider declarations, speech detection and audio observations are service claims; schema and hash binding do not prove valid decoding or score accuracy. No feedback/score is saved, no review is auto-approved and existing result sheets are untouched.

## Not configured or accepted

DMI_MOCK_ASSESSMENT_ENABLED remains absent/false alongside existing runner/capture/timed gates. No native setup, deployment/publication, external candidate processing, account/secret/property changes, real recordings or bands.

A real privately hosted decoder/scoring gateway implementing this contract is still required; the adapter is not compatible with an arbitrary model API URL. No gateway hosting, service account, API key, provider model or consent/processing configuration exists. Owner service setup, actual quality verification, calibration against independent teacher ratings, private draft persistence and teacher UI integration remain pending. Both paper adapters are still unreviewed/non-installable; complete mock/lab acceptance remains pending.

Verification: https://github.com/DMIedu/IELTS-LMS/actions/runs/38020683135 at 8bbeecfef7feed323e5aad69fe53e0372992b549 passed 32 service adapter checks plus all previous suites. Synthetic three-part audio containers, fake private Drive and fake service responses only; realProviderCalls=0, bandsReleased=0. The fixture now gives each recording an immutable file identity, allowing multi-file integrity verification. Exact module is present in the draft bundle; native service/decoder/quality and visual acceptance remain unverified.
