# Test the Academic mock entry foundation

Status: draft development. This tests teacher setup and student admission only. The original Academic paper, timed runner, recordings, marking and AI Speaking are not yet included. Do not use it for a real mock exam.

## What is included
- Teacher creates a sitting with a title, class label, 1–100 chosen active accounts and entry opening/closing times.
- The server generates a 48-bit temporary code. Only a salted hash is stored, and candidates never receive the candidate list, code hash or salt.
- Teacher may issue a replacement code or permanently close entry.
- An assigned, active student enters using the existing verified LMS session and code.
- One admission per student identity/sitting; refresh recovers it, repeated entry does not create duplicates.
- Five failed code attempts trigger a separate fifteen-minute mock-code limit, without revoking the student's LMS login.
- Expired/inactive accounts and unassigned candidates cannot enter.
- Code rotation affects new admissions. It does not erase existing admissions.
- DMI logo and the exact owner-supplied British Council partner badge are included.
- Admissions are stored in new MockSittings / MockAdmissions tabs; marks, exam submissions, course data and account passwords are not changed.
- Entry times use the computer's displayed local time zone. Backend comparisons use absolute timestamps.

## Test backend — owner step
1. Open the Apps Script project named **DMI LMS Security Test**. Keep the production **Untitled project** unchanged.
2. Back up the test project's current Code.gs.
3. Replace only Code.gs with the consolidated `release-candidate/Code.gs` from this development. Do not add MockTests.gs, Security.gs or the other standalone source files alongside the bundle.
4. Save and run **initializeMockTests** once from the function menu.
5. Expect: **Mock entry ready. Existing accounts, courses, marks and sessions preserved. Exam sections are not enabled yet.**
6. Update the existing TEST deployment: Deploy → Manage deployments → pencil → New version → Deploy. Keep its URL and settings.
7. Keep all existing Script Properties. Do not reset security secrets or recreate accounts.

## Isolated test website
A separate `test/academic-lab-mock` branch contains the test website and launcher.
Download the provided pinned test archive, extract, close any older test server window, then double-click **Start-DMI-Test.cmd**.
The website must show the yellow **DMI SECURITY TEST COPY** banner. Its client blocks production Apps Script requests.
Use the existing private test student/teacher credentials. Do not send passwords or code values in screenshots.
This static launcher serves HTML/JS locally; it is for the entry screens, not a full Listening audio test.

## Native acceptance
1. Teacher signs in → Teacher Panel → Mock Tests.
2. Choose the temporary Browser Test Student, an opening time in the past/current time, and an entry close in the future. Create the sitting.
3. Note the issued code privately. Confirm the sitting appears after Refresh.
4. Student signs in in a separate browser/profile → Dashboard → Mock Tests.
5. Check one wrong code is rejected, then use the correct code.
6. Confirm admission identifies the correct student. Refresh and confirm the same admission returns.
7. Teacher chooses View entries and sees the student's entry.
8. Create another sitting for two temporary candidates; replace its code before they enter. Confirm the previous code fails and the replacement works.
9. Confirm an unassigned temporary candidate cannot list or enter the sitting.
10. Close entry and confirm an unadmitted candidate cannot enter.
11. Confirm an opening time in the future prevents entry, and a passed closing time prevents entry.
12. Leave the test fixtures available for the next development. No production rollout yet.

## Automated validation
`tests/mock-entry.test.js` uses synthetic Sheets/session fixtures and real Node hash/HMAC utilities.
`tests/mock-entry-browser.test.js` exercises the actual pages in Chromium with all backend calls intercepted and an in-memory workbook.
The workflow publishes check totals and desktop/mobile screenshots. Native Apps Script acceptance remains separate.

## Remaining mock-test development
- Original Academic paper, answer keys and reviewed content.
- Listening audio production, real pacing, one-play controls and two-minute checking.
- Shared timed Listening → Reading → Writing runner with server deadlines.
- Autosave, interruption recovery and final submissions.
- Recorded AI Speaking and private audio storage.
- Writing/Speaking teacher review, combined report and release controls.
- Full concurrent lab pilot before production.

## Validation completed — 9 October 2026
- 76 synthetic backend admission/security checks passed.
- 13 existing login transport regression checks passed.
- 35 Chromium browser checks passed, including teacher creation, wrong/correct code, admission refresh, teacher monitoring, unassigned candidates, closed entry, desktop/mobile layout and both actual logo images loading.
- Five backend/client syntax checks passed.
- Ten pinned test-package checks confirmed correct test endpoints, guard injection and bundle consistency.
- Browser validation used synthetic accounts and an in-memory workbook, with zero live workbook writes.
- Latest code validation: https://github.com/DMIedu/IELTS-LMS/actions/runs/37871483383
- Native Apps Script and real test-workbook acceptance remain pending. No production release has been made.

## Pinned downloads
- Isolated test website: https://github.com/DMIedu/IELTS-LMS/archive/a35d3ddb342f6fb63602a588cb1f4b3b131fd632.zip
- Consolidated tested backend: https://raw.githubusercontent.com/DMIedu/IELTS-LMS/e16872e39a2d91e14e0b16b082990c085f85b4ce/release-candidate/Code.gs
- Draft review: https://github.com/DMIedu/IELTS-LMS/pull/6

The local terminal and browser-control connection failed during this task with a setup-refresh error. GitHub validation was used to complete automated testing; the signed-in Apps Script editor could not be operated from this chat.
