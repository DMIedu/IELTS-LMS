# DMI LMS — Google Sheet Setup Guide

Login system + teacher panel + student panel. Uses a Google Sheet as the database. No server needed.

## Files added

- `Code.gs` — Apps Script backend
- `login.html` — Unified login (DMI brand styled)
- `teacher-panel.html` — Add students, courses, post marks, see exam submissions
- `student-panel.html` — Student dashboard
- `lms-result-sender.js` — Drop-in JS so any existing test page submits results to admin

---

## Step 1 — Create the Google Sheet

Create a Google Sheet with **5 tabs**. Type the header row exactly as shown (row 1):

### Tab: `Students`
```
ID | Name | Email | Password | Class | JoinDate | ExpiryDate
```

### Tab: `Teachers`
```
ID | Name | Email | Password | Subject
```
Add one row by hand so you can log in:
```
T-001 | Niroshan | niroshan.dmi@gmail.com | Pass1234 | IELTS
```

### Tab: `Courses`
```
CourseID | Course | Lesson | VideoURL | PDFURL
```

### Tab: `Marks`
```
MarkID | StudentEmail | StudentName | Course | Test | Score | MaxScore | Date | TeacherName | Comments
```

### Tab: `ExamResults`
```
ResultID | StudentEmail | StudentName | TestName | Course | Score | MaxScore | Date | AnswersJSON | QuestionsJSON
```

---

## Step 2 — Get the Sheet ID

From your sheet URL `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit` — copy the part between `/d/` and `/edit`.

---

## Step 3 — Deploy Apps Script

1. In the sheet: **Extensions → Apps Script**.
2. Delete the placeholder code, paste the whole `Code.gs`.
3. Replace `PASTE_YOUR_GOOGLE_SHEET_ID_HERE` with your Sheet ID. Save.
4. **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy. Authorize when prompted.
5. Copy the **Web app URL**.

---

## Step 4 — Wire up the HTML / JS files

Open each file in a text editor and replace `PASTE_YOUR_WEB_APP_URL_HERE` with the URL from Step 3:

- `login.html`
- `teacher-panel.html`
- `student-panel.html`
- `lms-result-sender.js`

---

## Step 5 — How it works

### Student lifecycle
1. Admin opens **Teacher Panel → Add Student**, enters name, email, password, class.
2. Backend stamps **JoinDate = today** and **ExpiryDate = today + 30 days**.
3. Student signs in at `login.html`, sees their dashboard.
4. **7 days before expiry** a yellow banner shows on the student dashboard.
5. **After expiry**, login is blocked with a "contact admin to renew" message.
6. Admin clicks **Renew** in the Students table → enters number of days (default 30) → done.

### Exam result flow
1. Student is signed in, opens any existing test HTML (e.g. `book 19 reading test 1.html`).
2. That page includes `<script src="lms-result-sender.js"></script>`.
3. When the student finishes, the test page calls:
   ```js
   DMI_LMS.submit({
     testName: 'Book 19 Reading Test 1',
     course: 'IELTS Reading',
     score: 27,
     maxScore: 40,
     answers:   { 1:'TRUE', 2:'FALSE', 3:'B', ... },
     questions: { 1:'Q1 text…', 2:'Q2 text…' }
   });
   ```
4. The result is written to:
   - **ExamResults** sheet (full answer+question record)
   - **Marks** sheet (so it shows on the student's dashboard automatically)
5. Admin opens **Teacher Panel → Exam Submissions → View Answers** to see every question and the student's answer side-by-side.

### Adding `lms-result-sender.js` to your existing test pages

Inside each test HTML's `<head>` or before `</body>`:

```html
<script src="lms-result-sender.js"></script>
```

Then in whatever function handles the "Submit" / "Finish" button on that test, call `DMI_LMS.submit({...})` with the score data.

If a student is **not signed in**, a small DMI bar appears at the top inviting them to log in, and results are skipped silently. Anonymous practice still works.

---

## Step 6 — Test the whole loop

1. Open `login.html` → sign in as the teacher row you added.
2. **Add Student** tab → create a student.
3. Log out. Open `login.html` as the student.
4. Marks they see show the system-added rows from any test submissions.
5. Log back in as teacher. Open **Exam Submissions → View Answers** to see questions + answers.

---

## Updating the deployment later

After editing `Code.gs`:
**Deploy → Manage deployments → pencil → Version: New version → Deploy**

The URL stays the same.

---

## Notes

- Validity is configurable in `Code.gs`: change `STUDENT_VALIDITY_DAYS = 30`.
- Renewal is additive: if the student still has 5 days left and you renew for 30, they get 35 total.
- Passwords stored plaintext in the sheet. Fine for a classroom; not for sensitive systems.
