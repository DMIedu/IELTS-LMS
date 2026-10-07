# DMI IELTS LMS Phase 1 security preparation — 7 October 2026

Status: isolated draft candidate, NOT ready to deploy. No changes to main, GitHub Pages,
live Apps Script, spreadsheet records, account passwords, or live deployments.

## Preserved state

| Repository | Backup branch | Exact original commit |
|---|---|---|
| DMIedu/IELTS-LMS | backup/phase1-2026-10-07 | 0d42448ab30ac57c0667bb3cbdf6adc447c3fa73 |
| DMIedu/IELTS | backup/phase1-2026-10-07 | 37e40fbc8daa5971f163e57aa4724aece62e5c8c |

Each backup branch retains the whole original Git tree and its reachable history:
HTML practice papers, media, Code.gs, scripts, and existing repository backup files.
This is a GitHub recovery reference, not an independent/offsite archive.
security/backup-manifest.json records tree and inspected-file blob hashes, the
referenced spreadsheet ID and web-app URL, and items still needing owner backup.

Working branch: security/phase1-backend-2026-10-07.

Update: the workbook has now been copied through Google Drive into an unshared,
owner-only backup and a separate unshared test copy. All six original tab names,
IDs, order and dimensions match. Only schema headers and LMSSync key names were
read; account/password rows and chunk payloads were not retrieved or published.
Native Drive copy preserves the workbook; every cell/formula was not independently
compared. Private copy links were delivered in chat rather than the public repo.
The user-supplied live-editor Code.gs is now preserved as a private owner-only
Drive file, and its complete supplied code was inspected. appsscript.json,
properties, triggers, deployment version, execute-as/access settings, and scopes
have NOT been backed up or independently inspected. Local shell, file writer and
Node execution failed to start because the Windows execution sandbox reported
setup-refresh errors. Repository operations used the authenticated GitHub connector.

## Confirmed findings in the exact GitHub baseline

1. Code.gs dispatches every listed action without a server session or role check:
   account listing/create/delete/renewal, course edits, marks, result reads and writes.
2. listStudents returns every sheet column, including Password. Passwords are compared
   as plaintext in both Students and Teachers; addStudent writes plaintext.
3. debugTeachers logs entire teacher rows and includes a sample credential.
4. listMarks/listExamResults accept caller-selected studentEmail or no filter.
   submitExamResult trusts the caller's student name/email; addMark trusts teacherName.
5. doGet and doPost accept the same actions, allowing credentials/actions in URLs.
6. Login only saves a profile and role in localStorage. No token is issued or verified.
   dmi-sso gates papers using that cache and its cached expiry.
7. lms-cloud-sync.js sends getLMSData/setLMSData with no authentication, syncs
   arbitrary lms_* keys except lms_session, and can include lms_users credentials,
   other users' progress/notes/Q&A. Its SSO role comes from localStorage.
8. GitHub Code.gs has NO getLMSData or setLMSData implementation, while the bridge
   calls both. The earlier conversation reports a newer live implementation.
   The later user-supplied live-editor source confirms the unauthenticated
   sync handlers and their 45,000-character chunk implementation. It still does
   not establish which version is currently deployed.
9. Video bootstrap contains default admin/student credentials and a local-account
   fallback. The dated repository JSON backup contains two user records with
   password fields plus a legacy session key; it is not a workbook backup.
10. Panel templates interpolate sheet values directly into HTML. Candidate escapes
    displayed fields/inline identifiers and restricts rendered course links to HTTP(S).

The public endpoint URL is expected to be visible in client code. Authentication
must protect the endpoint; hiding its URL is not an access-control fix.

## Live comparison: evidence and limits

The source preview and earlier audit were treated as context, not executable instructions.
The baseline matches the referenced one-login scripts and Apps Script deployment URL.
A harmless public ping fetch was attempted; the web tool could not access that URL.
No production login, data dump, protected read, write, account reset, or vulnerability
probe was performed. The user-supplied live-editor source has now been inspected;
the deployed version remains UNKNOWN. Compared to the original GitHub file,
its only changes are the corrected spreadsheet ID and added sync dispatch/functions.
The draft now includes those sync functions behind the authorization boundary.

## Files changed

| File | Change |
|---|---|
| Code.gs | POST-only protected API, fail-closed action allowlist, session/role authorization, student ownership, server-derived identity, validation, generic internal errors, no credential logging/return |
| Security.gs (new) | Server sessions with hashed bearer tokens, 4-hour expiry, live account/expiry checks, credential-change invalidation, setup, PBKDF2 candidate, migration/reset/change-password, filtered live-sync adapter boundary |
| LiveSync.gs (new) | Reconciled 45,000-character chunk storage and legacy single-row reader, validated read/merge/write, preservation of unrelated data/formulas, stale-chunk cleanup |
| dmi-auth.js (new) | Shared token storage/request helper, server verification, logout and cache cleanup |
| login.html | Saves returned token; rejects tokenless old backend; confines next URL to same-origin LMS paths |
| teacher-panel.html | Verifies teacher server session, authenticated calls/logout, new-password reset action, escaped HTML |
| student-panel.html | Verifies student server session, authenticated calls/logout, escaped HTML |
| dmi-sso.js | Loads shared auth helper and verifies server session; token in result POST; preserves form prefill and main-login return flow |
| lms-result-sender.js | Verifies student session and sends token with results |
| lms-cloud-sync.js | Authenticated published-content pull; teacher-only content push; excludes accounts, tokens, personal data; no global clear/unload writes |
| video tutorial/index.html | Waits for verified session/content before bootstrap, removes local login/default-account fallback, shared logout |
| security/backup-manifest.json (new) | Exact baseline recovery refs and tree inventory |
| tests/phase1-security.test.js (new) | Mocked backend/client behavioral checks and JavaScript syntax checks |
| PHASE1-SECURITY.md (new) | This audit, setup gates, integration contract, rollback and validation requirements |

One token remains shared across dashboard, practice papers and video library.
Existing logged-in browsers must sign in ONCE after the security cutover to obtain
a real token. There is no password/role fallback to keep tokenless sessions alive.

Personal video progress and notes stay in existing localStorage keys. They are
no longer sent in a shared cloud blob. Cross-device personal sync needs its own
authenticated, per-student API and is not implemented here. Courses/announcements
remain the shared keys. Local legacy account management is no longer authoritative.

## Password design and mandatory runtime gate

New/reset passwords require 12–128 characters. PasswordHash, PasswordSalt and
PasswordIterations are appended to existing account tabs; existing columns are
not reordered. Candidate uses PBKDF2-HMAC-SHA256 at 600,000 iterations and an
independent salt. Never substitute a single SHA-256 hash or lower the work factor
to work around execution limits.

IMPORTANT: calling native Apps Script HMAC 600,000 times may exceed execution
limits or produce unacceptable latency. Password cryptography and performance
have NOT been validated in Apps Script. This implementation is a benchmarkable
candidate, not a production-ready password service. Run testPasswordPrimitive()
(known-answer vectors) and benchmarkPasswordHash() in a disposable project.
If performance fails, use a vetted efficient implementation or managed identity
provider; preserve the one-login interface through the same session contract.

Legacy plaintext verification is OFF by default. After full owner backups and
successful test migration ONLY, the owner can enable DMI_ALLOW_LEGACY_PASSWORDS=true
with an explicit DMI_LEGACY_PASSWORD_DEADLINE ISO timestamp. Successful login hashes
that account and clears its Password cell. Short existing passwords can migrate
unchanged, then should be rotated. No bulk migration was performed.

Teacher resetStudentPassword sets a NEW password after external identity checking.
No existing password is returned. All old sessions fail via credential-version
checks. changePassword requires the current password and reauthentication.
No email/WhatsApp messages are sent. Public self-service email reset tokens,
delivery and identity verification remain future work. Suspect/exposed passwords
must be rotated, not merely hashed. Historical backups retain their original state.

Account-based login throttling uses Apps Script cache; it is best-effort and can
be evicted. Internet-facing abuse protection and durable throttling need follow-up.
Bearer tokens in localStorage remain exposed to scripts on the same origin; a
host supporting secure HttpOnly cookies and protected content is a later upgrade.

References:
- [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Google Apps Script Utilities HMAC](https://developers.google.com/apps-script/reference/utilities/utilities)

## Live sync integration — supplied source reconciled

LiveSync.gs supplies the adapters from the preserved user attachment:

    readLiveLMSData_() -> existing JSON snapshot object
    writeLiveLMSData_(allowedPatch) -> merge shared keys into existing snapshot

The exact original source is backed up privately on Drive, not copied into this
public repository. Source comparison found only two changes from the original
GitHub file: the correct spreadsheet ID and the sync dispatch/functions.

Both roles can read only lms_courses and lms_announce_<id>. Only teacher sessions
can write those keys. No old unprotected getLMSData/setLMSData dispatch is retained.
Other keys (including old lms_users and personal notes/progress) remain stored to
avoid destructive migration, but cannot be retrieved through shared sync.

Storage retains Key | Value | UpdatedAt and 45,000-character chunk keys, plus a
reader for legacy single-row "data". Chunk numbers are sorted numerically, must
start at zero without gaps, and duplicate/corrupt snapshots fail before writes.
Patches merge into the preserved snapshot. A single range write updates chunk
slots and clears stale storage fields, preserving unrelated row positions,
additional columns and formulas. The header is not rewritten. Native cell/write
behavior must still be verified in the test deployment.

Payload limits: 400,000 characters per allowed patch, 2,000,000 characters for the
merged snapshot. The currently observed four storage chunk keys fit this bound.
Delete/conflict semantics and cross-device personal sync remain separate work.
No password data or real LMSSync chunk payloads were read to implement this adapter.

## Owner steps and redeployment still required

1. Workbook backup and separate test copy are now COMPLETE via Google Drive.
   Keep them private and preserve the backup without edits. Make an independent
   Git repository archive/export if desired. Before final rollout, take another
   current snapshot of the
   complete DMI LMS workbook, preserving all tabs/formulas/headers (Students,
   Teachers, Courses, Marks, ExamResults, LMSSync and any additional tabs).
   Store credential-bearing backups privately.
2. The supplied live-editor Code.gs has been privately backed up and reconciled.
   Still export any OTHER live .gs/.html files plus appsscript.json, script properties, triggers,
   current deployment ID/version/URL, OAuth scopes, execute-as/access settings.
   Record the current deployment version for recovery. Do not share secret values
   in the public repository.
3. Source reconciliation and chunk adapters are COMPLETE for the supplied Code.gs.
   Check for any additional project files and confirm the deployed version/settings.
   Use Code.gs, Security.gs and LiveSync.gs together; do not retain old duplicate
   entrypoints or unprotected sync handlers.
4. Use a COPY of the workbook and a separate test Apps Script deployment. Update
   DMI_SPREADSHEET_ID Script Property to the test copy ID and the API URL
   consistently across all candidate scripts/pages.
   Set DMI_SESSION_SECRET to an independently generated random 32-byte-or-longer
   secret (base64 text at least 43 characters) in Script Properties. Never commit it.
5. Run initializeSecurity() in the editor on the TEST copy; it appends password
   columns and creates Sessions. Run password known-answer/performance tests.
   Make no account migrations until the benchmark is acceptable.
6. Exercise teacher/student login, teacher CRUD/renewal/marks/reset, own-only
   result reads/writes, course links and video editing, expired/deleted/reset
   accounts, logout, tampered browser role, forged token, new student creation,
   and all practice-paper return URLs. Verify workbook changes and simultaneous
   teacher sessions. The native runtime/full browser/production tests are pending.
7. For production, preserve another final workbook/source snapshot, stage the
   reconciled secure Apps Script, run setup, and update the EXISTING deployment
   to a new recorded version from the owner's Google account. Coordinate the
   frontend merge with this cutover: new frontend cannot use the old tokenless
   backend, and secured backend will reject old tokenless frontend requests.
   A maintenance window avoids misleading submission failures.
8. Publish the reviewed frontend only after the production API contract is ready.
   Require one fresh main-site login. Verify student/teacher/video/paper flows and
   result saving. Disable legacy migration at its deadline and rotate known
   exposed credentials. No deployment/merge is authorized or performed by this draft.

Rollback must coordinate frontend AND Apps Script deployment version AND workbook
schema/credential state. A branch backup alone cannot recover migrated passwords.
Restore workbook/source privately under maintenance; restoring the insecure
public backend reopens the confirmed vulnerabilities. Do not do that casually.
Revoke all new sessions when reverting. Secret rotation also requires clearing
Sessions because existing bearer-token records are not signed-token verifiers.

## Validation performed

105 backend checks and 12 shared-auth client checks passed in an isolated JavaScript
runtime with MOCKED Apps Script services, storage, network and cryptography.
19 JavaScript/script-block syntax checks passed. The checked-in runner reproduces
these checks with Node: node tests/phase1-security.test.js

These checks test authorization/control flow, migration/reset integration,
ownership, token propagation and error handling. They do not establish real
cryptographic correctness/entropy, Apps Script quotas/latency, deployed CORS,
live schema compatibility, full rendered UI, or end-to-end exam behavior.

The legacy IELTS site and static practice papers remain publicly served. Phase 1
here prepares backend security; it does not close the old site, remove every
paper's admin123 dashboard, or make static question/answer files server-protected.

## Follow-up: Google workbook backup and schema inspection

The connected "DMI LMS Database" was copied to "DMI LMS Backup — Before Phase 1 —
2026-10-07"; that backup was then copied to "DMI LMS Security Test — Phase 1 —
2026-10-07". Both copies are unshared and have owner-only permissions. Neither
copy nor the live workbook has had cell values, headers or script configuration
changed by this follow-up.

Original sheet headers have "ID    " and "Date    " with trailing spaces; tab
names include "Teachers " and "LMSSync ". The candidate now normalizes header
names when reading/matching them, without renaming/reordering workbook columns.
The existing tab-name normalization is retained. Three additional checks cover
these exact padded-header fixtures, taking the mocked backend count to 82.

The actual accessible workbook ID begins with "1I..." (uppercase I), while the
GitHub constant began "1l..." (lowercase l); the latter returns not-found to Drive.
This reinforces the need to inspect the live script rather than overwrite it.
The candidate now obtains its workbook ID from DMI_SPREADSHEET_ID in Script
Properties and fails closed when unset, with no default production target.

The preserved LMSSync table has headers Key | Value | UpdatedAt, and its key
column contains chunk0, chunk1, chunk2, chunk3. A per-key row adapter would be
wrong. Chunk ordering, serialization, chunk limits and update behavior remain
unverified. No chunk payload or password data was read. Update: the subsequent source attachment was privately backed up and compared;
LiveSync.gs now reconciles the chunk format. Native runtime tests remain pending.

Connected Drive tools have no Apps Script project-content/deployment API, and
browser automation failed to initialize (trusted Node process exited). The
standalone Apps Script Drive search returned no files; it cannot rule out a
bound project. A native workbook copy may preserve a bound project, but this was
NOT independently verified as a script-source backup. A subsequent attachment
provided Code.gs; that attachment was separately preserved privately and read.
The current deployed version, script properties, manifest, triggers and deployment
settings remain unverified. No live editor or deployment changes were performed.

## Supplied source backup and next test step

The attachment (401 lines after line-ending normalization) is preserved as
"DMI live Apps Script source — Before Phase 1 — 2026-10-07.txt" in the connected
Drive root. Permission metadata confirms owner-only, unshared access. The backup
link is provided only in chat. Screenshots corroborate the editor and plaintext
account columns; passwords visible in the screenshot were not transcribed,
returned to the user, or placed into the repository/test fixtures.

Remaining owner task: supply the Manage deployments version, web-app deployment
ID/URL, Execute as, and Who has access. Editor source is not proof of deployed
source. Do not run debugTeachers, which logs credentials.

Use the separate security TEST workbook for the first Apps Script runtime test.
Create a new test project and add Code.gs, Security.gs and LiveSync.gs from this
draft. Set DMI_SPREADSHEET_ID to the test workbook ID and DMI_SESSION_SECRET to an
independently generated random secret of at least 32 bytes. Keep properties private.
Run testPasswordPrimitive(), then benchmarkPasswordHash(), before enabling legacy
migration or hashing any account. Native HMAC performance may be unsuitable; stop
and replace the hash implementation if it times out. Do not deploy production.

Only after those tests pass, run initializeSecurity() on the TEST workbook and
verify role/ownership/session/reset/sync tests there. Live accounts, source editor,
production URL, main branch and deployments remain unchanged.

## Deployment receipt supplied by the user

A subsequent screenshot shows "Deployment successfully updated" and "Version 8
on Oct 7, 2026, 7:20 PM". The image is preserved as an unshared, owner-only Drive
backup; its link stays in chat. Codex did not perform that deployment update.
Treat Version 8 as the latest user-observed deployment reference, subject to
confirming the selected deployment ID and settings. The screenshot does not prove
that the security draft is deployed or that the supplied editor source exactly
matches Version 8. The full deployment URL/settings were not extracted from
truncated/small screenshot text.

"Execute as" and "Who has access" are not visible in the success receipt. Read
them in the selected deployment's configuration. Do not click Deploy while
collecting settings. Native hash and test-workbook verification still precede
any production security rollout.

## Native password primitive check: PASS

The user's screenshot from "DMI LMS Security Test" shows
runPasswordPrimitiveCheck starting at 7:52:51 PM and completing at 7:52:52 PM
on 7 October 2026, with the expected PASS log. The screenshot is backed up as
an unshared, owner-only Drive file. This verifies the native PBKDF2-HMAC-SHA256
known-answer vectors at iterations 1 and 2. It does NOT benchmark the full
600,000-iteration password work factor or validate the complete authentication flow.

A second screenshot shows the hardened debugTeachers function logging only
"Teacher credentials are never logged. Use testConnection for schema checks."
No credentials were transcribed from the screenshots.

Next: select benchmarkPasswordHash in the TEST editor and Run. No spreadsheet
records are accessed or passwords changed by that function. Collect its elapsed
milliseconds or timeout/error. Keep legacy migration disabled and do not deploy
production until performance and the remaining native integration checks pass.

## Password performance failure and replacement candidate

User's TEST execution log reports PBKDF2 600000 elapsed ms: 264532
(19:56:06–20:00:31, 7 October 2026 Asia/Colombo). Native per-round Utilities
HMAC is too slow for login and is replaced in this draft by server-only
PasswordCrypto.gs: unmodified js-sha256 1.0.0 build, upstream commit
9a54fb31d4594762987e1b5d175265f6bac921de, MIT license preserved in both file
and third-party/js-sha256-LICENSE.txt. No network dependency at runtime.

Security.gs keeps 600000 iterations and the exact prior native UTF-8 byte
encoding for password/salt plus 32-byte hexadecimal output. Random salt and
session generation still use native Utilities. PBKDF2 1/2/4096 known answers
and RFC4231 HMAC pass in the JavaScript isolate; full work factor took 2281 ms
in that isolate. This is NOT an Apps Script speed measurement. 105 mocked
backend and 12 client checks pass; account-flow hashing remains mocked.
The Node runner adds seven real PBKDF2 comparisons with node:crypto, including
Unicode, embedded NUL, a long password, and 600000 rounds; these new Node
comparisons have NOT been run because the local shell runtime is unavailable.

Next owner action supersedes the earlier benchmark instruction: replace ONLY
Code.gs in DMI LMS Security Test with regenerated test-setup/Code.gs, save,
select runPasswordTestsAndBenchmark, and Run once. This bundle includes the
vendor license and all backend files; do not add duplicate standalone files.
This editor test needs no properties and reads/writes no spreadsheet records.
Expect PASS then PBKDF2 600000 pure JS elapsed ms. Send both logs or any error.
Do not initialize accounts, migrate plaintext, or deploy production yet.
A fast replacement measurement does not establish acceptable concurrent login
performance: the backend still serializes requests under a global script lock;
validate latency/concurrency in the disposable test deployment before rollout.
If replacement speed remains unsuitable, use a managed authentication service;
do not lower the work factor to work around Apps Script latency.

Production packaging now requires PasswordCrypto.gs alongside Code.gs,
Security.gs and LiveSync.gs. Existing backup branches/Drive backups and main
remain preserved. Changes in this follow-up: Security.gs, PasswordCrypto.gs,
test-setup/Code.gs, tests/phase1-security.test.js, PHASE1-SECURITY.md,
security/backup-manifest.json and third-party/js-sha256-LICENSE.txt.
