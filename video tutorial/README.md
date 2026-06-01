# DMI Local LMS

## Site structure

- Main IELTS practice papers page: `../index.html`
- Video tutorial LMS: `index.html`
- Course seed data: `course-data.js`

A self-contained learning management system that runs entirely in your browser. No server, no install — just open `index.html`.

## Quick start

For the full LMS flow, open `../index.html` first. The main page shows IELTS practice papers and links to this video tutorial LMS.

1. Double-click `index.html` (or right-click → Open with → Chrome / Edge / Firefox).
2. Sign in with one of the default accounts:
   - **Admin:** `admin` / `admin123`
   - **Demo student:** `student` / `student`
3. Students can also create their own account via the "Sign up" link.

## What's pre-loaded

The IELTS Band 7+ Preparation Course is seeded from `IELTS_Band_7_Course_Outline.docx`:

- 35 sections
- 568 items (lectures + 46 quizzes + 28 assignments + 21 role plays + practice tests)
- ~92 hours of content
- Video URLs are blank — the admin must fill them in.

## Item types

Each item in a section can be one of:

| Type | Description |
|------|-------------|
| **Lecture** | Plays a video (YouTube, local `.mp4`, or any embed URL) |
| **Notes / Article** | Shows written content (markdown or HTML) instead of a video — great for instructor notes, transcripts, slide summaries |
| **Quiz** | Standalone quiz item with multiple questions |
| **Assignment** | Marker for a student deliverable |
| **Role Play** | Speaking role-play prompt |
| **Practice Test** | Timed mock test |

**Questions can be attached to ANY item**, not just Quiz-type items. So a video lecture can have a follow-up "Check your understanding" quiz right below the player.

## Adding video to a lecture

Log in as `admin` → **Admin Panel** → **Courses** → expand a section → click **Edit** on the item. In the **Video source** box you get two options:

### Option 1 — Upload for offline playback (recommended, always works)

Click the file picker and choose the `.mp4` from anywhere on your computer. The LMS copies the video into the browser's own offline database (IndexedDB). After that:

- It plays offline, with no internet, every time.
- There is **no file path to manage** — even if you later move or rename the original file, the LMS copy keeps working.
- Click **Save** after the green "✓ Stored offline" message appears.

This is the most reliable method and is why your earlier attempt didn't play: a file picker cannot tell a web page the real path of the file you chose, so a typed/guessed path will usually be wrong. Uploading sidesteps paths entirely.

**Storage note:** offline videos live inside this browser profile only. The Admin → Courses tab shows how many are stored and how much space is used. They are *not* included in Export/Import backups (videos are too large for JSON) — keep your original `.mp4` files as the master copy.

### Option 2 — Link to a path or URL

Paste any of these into the path field:

- **YouTube link** — `https://www.youtube.com/watch?v=...` or `https://youtu.be/...`
- **Hosted .mp4 URL** — `https://yoursite.com/video.mp4`
- **Full Windows path** — `D:\ielts CRM\cava\videos\lec1.mp4`
  The LMS converts it to a properly URL-encoded `file:///` link (spaces and special characters like `—` are handled automatically). The file must actually exist at that exact path. This works in Chrome; if a path-linked video won't play, switch that item to Option 1.
- **Relative path** — `../videos/section01/lec1.mp4` (relative to the `lms` folder). Handy if you keep all videos in `D:\ielts CRM\cava\videos\`.

### Recommended folder structure (for Option 2)

```
D:\ielts CRM\cava\
├── lms\
│   ├── index.html
│   ├── course-data.js
│   └── README.md
└── videos\
    ├── section01\
    │   ├── 01-why-take-this-course.mp4
    │   └── 02-course-description.mp4
    ├── section02\
    └── ...
```

## Adding notes / article content

1. Edit the item, set type = **Notes / Article**.
2. Write content in the **Article body** textarea. Supported syntax:
   - `# Heading 1` / `## Heading 2` / `### Heading 3`
   - `**bold**`, `*italic*`, `` `code` ``
   - `- bullet point`
   - Plain HTML also works (paste `<img src="...">`, tables, etc.)
3. Save. Students see the formatted article in the main viewer area.

## Attaching questions to any item

You can add a quiz to a video lecture or article — useful for "check your understanding" after each video.

1. Edit the item.
2. In the **Questions attached to this item** panel, click **Edit questions →**.
3. Add as many questions as you want. Supported types:
   - **Multiple choice** — any number of options, pick one correct
   - **True / False / Not Given** — IELTS-style with fixed three options
   - **Fill the blank** — case-insensitive text match
4. Save. Students see the quiz below the video. Scoring 70%+ marks the item complete.

## Building quizzes (in bulk)

Admin Panel → **Quiz Builder** tab lists every item with questions attached (quiz items AND lectures with follow-up questions). Click **Edit** on any row to jump straight into the question editor.

## Managing users

Admin Panel → **Users** tab. You can add admin or student accounts, change passwords, or delete users. Each user's progress and notes are private and tied to their username.

## Where your data lives

All data is stored in the browser's `localStorage` under keys prefixed `lms_`. This means:

- Data **persists** across browser sessions on the same machine + browser.
- Data is **per-browser** — if you open the LMS in Chrome and then in Edge, you'll get separate states.
- Clearing browser data will wipe the LMS.

### Backups

- **Export data:** Admin Panel → "Export data" downloads a JSON file with all users, courses, progress, notes, Q&A, announcements.
- **Import data:** Admin Panel → "Import data" restores from such a backup.
- **Reset all:** wipes everything and re-seeds the IELTS course from `course-data.js`.

Recommended: export weekly and keep the file in a safe place.

## Files in this folder

| File | Purpose |
|------|---------|
| `index.html` | The LMS app itself (UI + auth + admin + quiz engine) |
| `course-data.js` | Initial seed: the parsed IELTS Band 7+ course outline |
| `README.md` | This file |

## Notes & limitations

- **Single-machine multi-user.** Multiple students can log in on the same computer, but they share the browser's localStorage; data does not sync between machines. For true multi-device sync you'd need a backend server.
- **Storage limit.** Most browsers cap localStorage at 5–10 MB. The seed course uses ~600 KB. You have plenty of room for notes, Q&A, and quiz attempts, but uploading binary content (PDFs, video) is not supported — link to externally-hosted files instead.
- **No analytics.** Progress is tracked per user but there's no admin "see all students' progress" view yet. Easy to add — ask if you want it.
