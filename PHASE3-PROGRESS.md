# Phase 3: dashboard lesson progress

Students can mark a lesson complete in **My Courses**. The student dashboard reads completion from the database on each load, so it follows the account across browsers/devices. Teachers select a course in **Courses** and click **View progress** to see completed lessons, percentage and current account/course access.

This is student-reported completion, not measured video watch time. It applies to lesson rows in the dashboard Courses sheet, not the separate video tutorial library. Test marks are unchanged. Public media URLs retain their own access settings.

## Storage and permissions

The additive **CourseProgress** sheet has CourseKey, StudentEmail, LessonID and CompletedAt headers. Initialization preserves courses, enrolments, accounts, marks and sessions and may be run again safely. Existing CourseDetails and CourseEnrollments setup must already exist.

Progress writes use the student identity in the verified session. Students cannot change another account's progress or read the teacher report. Restricted courses require enrolment; expired/disabled accounts cannot write. The teacher report also shows retained historical progress for students removed from enrolment, marked unavailable. Renewing/re-enrolling restores access without clearing progress. Account deletion clears that account's progress; deleted lessons no longer count.

Lesson IDs must remain stable and unique. A zero-lesson course has 0% completion. Progress saves are idempotent and use the existing script lock. Ambiguous write responses are not retried automatically: refresh My Courses to read the confirmed state.

## Test installation

Use **DMI LMS Security Test**, with its existing test workbook, secret, credentials, access settings and deployment URL. Do not change the production Untitled project yet.

1. Replace only Code.gs with the consolidated release-candidate/Code.gs in the test archive. Keep SecurityTest.gs, BrowserTest.gs and SyncTest.gs. Do not add the standalone backend modules alongside the bundle.
2. Save, select **initializeLessonProgress**, and Run. Expect “Lesson progress ready. Existing courses, enrolments and marks preserved.”
3. Deploy → Manage deployments → edit the active test web app → New version → Deploy.
4. Extract the matching test website archive into a fresh folder. Close the previous local test server and start Start-DMI-Test.cmd from the new folder. The yellow test banner and test-only endpoint guard must be present. Use the existing private test credentials.

### Browser acceptance checks

Use separate browsers/profiles for simultaneous teacher/student accounts.

- In the test teacher panel, select a course with at least two dashboard lesson rows; add lessons using the existing lesson form if needed. Assign the test student if restricted.
- Student → My Courses → expand its lessons → mark one complete. Expect “Progress saved” and 1 / 2.
- Refresh, then sign in as the same student in a separate browser/device. The same lesson should remain checked.
- Teacher → Courses → select that course → View progress. Expect the same student at 1 / 2 and 50%.
- Student unmarks it; refresh the teacher report and expect 0 / 2.
- Remove the student's enrolment: the student should lose the course, and the report should retain previous progress with unavailable access. Re-enrol and confirm progress returns.
- Verify renewal retains progress. Confirm another student does not inherit completion.
- Test writes affect only the test database. Keep real passwords and script-property values private.

## Production rollout

After browser checks pass: back up the production Code.gs/database, replace production Code.gs with the same consolidated backend, run initializeLessonProgress, then update the **existing** production deployment with a new version and its existing execute/access settings. Publish the matching frontend only after that backend step succeeds.

No new script properties or triggers are needed. Keep the existing spreadsheet ID, secret and migration settings. The configured legacy-password deadline remains 22 October 2026, 23:59:59 Asia/Colombo; this feature does not change password migration.

## Validation and open items

66 in-memory backend integration checks pass, exercising real request authorization with Apps Script service doubles. 23 minimal-DOM UI checks and 13 login transport checks pass. Consolidated backend and frontend JavaScript syntax checks pass. Native Apps Script deployment and browser acceptance are pending; mocks do not verify Google runtime quotas, redirects, browser layout or performance.

The intermittent “Use POST” / HTML response issue remains unresolved. The existing explicit login rejection retry and read recovery are retained; progress writes are not automatically retried. Video playback/course-information work remains deferred.
