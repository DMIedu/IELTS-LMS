# Phase 1 reviewed backend candidate
This file consolidates the four backend sources without the test-only workbook guards.
It is provided for review, not immediate deployment. It contains no credentials.
Use either this single Code.gs or the four standalone source files, never both.

Test evidence: 24 editor security checks, 7 native sync checks with restored
original data/formulas, PBKDF2/HMAC correctness and 600000 rounds in 2718 ms,
standalone browser student/teacher login-session-logout checks.

These checks do not validate actual LMS pages or concurrency. The original
production Apps Script manifest/properties/triggers and deployment settings/source
version are not fully preserved/verified. No production frontend/backend release
has been performed by Codex.

Before rollout, test actual login.html, student-panel.html, teacher-panel.html,
practice submissions and video tutorial bootstrap against the test endpoint.
Confirm session/logout behavior across real pages and concurrency behavior.
Preserve production configuration/deployment version privately. Decide a bounded
legacy password migration or reset plan. Legacy login is disabled by default,
so deploying without a cutover plan would block existing plaintext accounts.
The owner must redeploy Apps Script and coordinate frontend publication; neither
is authorized merely by completing tests. Keep the test helpers out of production.
