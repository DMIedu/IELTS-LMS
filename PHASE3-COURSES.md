# Course details and enrolment — release package

Status: the owner deployed the course backend to production Version 13 on 8 October 2026 (Asia/Colombo). Matching website publication follows this commit. Native TEST initialization, course creation, enrolment visibility and renewal were confirmed during rollout. Native removal visibility and full production course acceptance remain pending.
Base: 40d84e6bb7ee6dbc8499e634e450bb062c2a9d8c. The existing Phase 1 backend and Phase 2 login retry remain intact.

## What teachers can do
Teacher Panel → Courses now contains a course details editor and enrolment roster.
Create a course with name, description, teacher, duration, syllabus, learning materials link and optional course page link. Select an existing course to edit; names stay fixed to preserve lesson associations. Assign active students or remove their enrolments. Expired/inactive students cannot receive new enrolments. Removing an enrolment does not delete their results or account.

The existing lesson form remains. Once course management is initialized, save a new course's details before adding its lessons. The course KPI counts unique courses, not lesson rows.

## Student behaviour and access
My Courses displays course cards with details, syllabus, resources and expandable lesson lists. New courses default to “Enrolled students only”. Existing lesson courses stay available to all active students until a teacher explicitly selects that setting; the UI confirms this access change. Restriction filters both listCourseCatalogue and listCourses on the server using the authenticated student's identity. The student cannot supply a different email to bypass the filter or read the roster. Teachers can see all courses and manage enrolment.

These restrictions govern dashboard API listings only. They do not secure public media/material URLs, implement DRM, or restrict the separate video tutorial library and its lms_courses sync payload. Host protected resources with appropriate host permissions. Video playback and tutorial-library course editing remain deferred as requested. Personal lesson progress is not part of this release.

## Storage and security
Two additive tabs: CourseDetails and CourseEnrollments. CourseKey is a digest of the trimmed, lowercased course name, grouping existing lesson rows. Metadata updates preserve extra columns. CourseEnrollments stores CourseKey, StudentEmail, EnrolledAt and EnrolledBy; repeated enrolment is idempotent. Deleting a student clears their enrolments to prevent a recreated account inheriting them.
No new script properties, triggers, or password migration changes.
All requests remain POST with verified sessions. Metadata and enrolment mutations, and roster reads, require a teacher. Mutations receive no automatic retry. URL inputs allow http/https without embedded credentials; UI renders plain text and escapes user-entered content.

## Validation
36 backend checks passed with in-memory Sheets, locks, properties and sessions:
legacy preservation, idempotent setup/enrolment, real handle/authorize dispatch, role checks, authenticated identity, visibility and revocation, expired/deleted users, header-order handling, extra-column preservation, input bounds and unsafe URLs.
The existing 13 login transport regression checks also passed with the extended read-action list.
13 UI checks passed with a minimal DOM: text escaping, safe links, empty/error states, old-backend fallback, active-student selection, legacy settings and disabled writes before setup.
The consolidated backend and changed frontend scripts passed syntax checks.
Tests ran in the isolated functions JavaScript runtime. Local shell execution was unavailable; the checked-in Node runners were not executed as Node processes.
Native TEST evidence: initialization completed; existing test web-app deployment updated to Version 2; course creation saved; the user confirmed hidden before enrolment and visible after enrolment, and confirmed renewal. Initial course catalogue loading returned non-JSON HTML; recovery succeeded, but its underlying cause remains unresolved. No production enrolment change or comprehensive layout audit is confirmed. Follow-up UI checks cover clear retry feedback and clearing stale errors on success.

Run locally with Node:
- node tests/course-management.test.js
- node tests/course-ui.test.js
- node tests/phase2-login-transport.test.js

## Installation order
1. Make a fresh private copy of the workbook and save the currently deployed Code.gs source privately.
2. First install/test this bundle in the existing security TEST project with its TEST workbook properties. Replace its consolidated Code.gs with release-candidate/Code.gs. Do not add the standalone files alongside the bundle (duplicate names).
3. Run initializeCourseManagement once in the editor. It creates only the two new tabs, preserves existing records, and validates their headers. Re-running it is safe.
4. Deploy a new version of that existing TEST deployment. Leave execute-as/access settings and private properties unchanged. Confirm the public ?action=ping response says phase3-courses.
5. After the copied-workbook checks pass, install the same bundle in the production Untitled project, run initializeCourseManagement and update the existing web-app deployment with a new version. Keep the same deployment URL, execute-as/access settings and properties. Confirm ?action=ping returns phase3-courses.
6. Only then merge/publish the matching frontend. The website is deliberately kept on the current release until the backend is ready.

## Native acceptance after backend installation and website publication
Use separate browser profiles for Teacher and Student:
- Existing course and lesson links remain available.
- Teacher creates one restricted sample course with details, syllabus and a materials link.
- Before enrolment, Student A cannot see it; Student B cannot see it.
- Enrol Student A. On a refreshed My Courses page, A sees the details/materials and B still does not.
- Removing A's enrolment hides that course again; marks remain unchanged.
- Reassign A and confirm an enrolled course's lesson appears.
- Logout and signed-out role protections still work.
Use a test workbook for sample records; avoid enrolling real users during the first checks.

## Rollback
Restore the prior Apps Script deployment version and previous website commit. Keep the two new tabs for recovery; do not delete data. Old source does not read them, so old dashboard behaviour returns to all lesson courses being available to active students. Do not change the session secret or password migration properties. Restore database backups only if actual data corruption is confirmed and reviewed.
