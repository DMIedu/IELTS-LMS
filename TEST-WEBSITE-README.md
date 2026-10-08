# Isolated course management test copy

Extract the whole archive, close any previous test launcher, then double-click Start-DMI-Test.cmd. Keep its window open. Use http://127.0.0.1:8765/test-start.html; do not open HTML files directly.

This copy uses only the existing DMI LMS Security Test endpoint and separate test login keys. test-mode.js rejects other script.google.com deployment paths before LMS scripts run. The changed teacher/student screens and shared auth are based on the current course release candidate, including the Phase 2 login retry.

First replace consolidated Code.gs in the DMI LMS Security Test Apps Script project with release-candidate/Code.gs from this archive. Do not add standalone Code/Security/CourseManagement files beside the bundle. Keep DMI_SPREADSHEET_ID pointing at the TEST workbook and leave the session secret private. Run initializeCourseManagement, then publish a new version of the existing TEST deployment. Confirm ?action=ping says phase3-courses.

The temporary browser accounts from Phase 1 were cleaned up. In the TEST project only, use the existing BrowserTest.gs (or add test-setup/BrowserTest.gs from this archive if it is absent), then run createBrowserTestAccounts to create fresh private test credentials; view them in Script Properties and do not share their values. Use these accounts to sign in to this local website.

Teacher: Courses → New course; add description, teacher, duration, syllabus and a materials link; save with Enrolled students only selected. Student: verify the course is hidden before enrolment, visible after teacher enrols that student, and hidden again after removal. Confirm existing lessons and marks remain available and student cannot access Teacher Panel. Use Chrome and Edge for separate accounts.

Run cleanupBrowserTestAccounts when test sign-ins are finished. The two new tabs may retain sample course metadata for future TEST checks; production is untouched.

This archive is for TEST only. The full rollout and rollback instructions are in PHASE3-COURSES.md. Native layout/integration tests remain pending; do not treat mocked tests as live evidence.
