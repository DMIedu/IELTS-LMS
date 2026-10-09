# DMI Academic Lab Mock — implementation specification

Status: specification prepared; mock runner, new paper, recordings and AI assessment are not implemented or published.

## Confirmed choices
- First mock: a new, original DMI-created Academic paper.
- Entry: existing active student login plus a temporary mock-test code issued by a teacher/admin.
- Branding: existing dmi-logo.jfif and DMI's British Council partner badge. The owner confirmed a partner badge exists; its actual asset still needs to be supplied.
- Speaking: AI-assisted mock practice. This is a DMI training assessment, not an official IELTS test or official band result.
- This development takes priority over lesson progress.

## Candidate experience
1. Open Mock Tests from the LMS.
2. Sign in with the existing LMS account, enter the teacher's temporary code, and confirm the displayed sitting and candidate identity.
3. Complete headphone, volume and microphone checks before the exam starts. A permission or audio failure must prevent starting.
4. Listening: four parts and 40 questions; play the timed recording once, including instructions/read/check intervals, followed by two minutes to check answers. The recording must be authored and timed for the computer format; do not add a ten-minute paper answer-transfer period.
5. Reading: three original passages and 40 questions in 60 minutes, with split passage/question view and navigation/review flags.
6. Writing: Academic Task 1 visual data and Task 2 essay, sharing 60 minutes. Suggested allocation: 20/40 minutes, minimum lengths 150/250 words. Save both tasks for teacher marking; Task 2 has twice the weight of Task 1.
7. Move Listening → Reading → Writing without a discretionary break or returning to a submitted section.
8. Complete Speaking in a teacher-scheduled separate slot, normally after Writing for DMI's lab workflow. Parts 1–3 last approximately 11–14 minutes; Part 2 allows one minute preparation and up to two minutes speaking.
9. Show submission confirmation. Answers, keys and preliminary scores stay hidden until teacher release.

Real IELTS Speaking uses a human examiner and may be scheduled separately before or after the other tests; AI Speaking simulates the training format.

## Teacher controls
- Create a sitting with title, Academic paper version, class/batch, allowed candidates, entry window and Speaking slot.
- Generate a high-entropy temporary code; display to the issuing teacher once and store only its salted hash.
- Rotate/revoke the code, close entry, or cancel a sitting. Expiry blocks new entry; whether an already admitted attempt continues is an explicit teacher control.
- One ordinary attempt per candidate per sitting; teacher-authorised restart is logged and preserves the previous attempt.
- View candidates as not started, in progress, technical interruption, submitted, awaiting Writing review, or results released.
- Inspect Listening/Reading answers and raw marks, both Writing tasks, and Speaking recordings/transcripts/AI estimates.
- Review/override Writing and Speaking criteria with teacher comments. Release a combined report only when all required assessments exist.
- Provide technical recovery without asking students to repeatedly log in or resubmit.

## Security and recovery
- Verify account/session, role, sitting membership and code on the server. Never use a browser role, guessed URL or supplied student email as authority.
- Keep code-attempt throttling distinct from normal account login throttling.
- Keep mock questions, answer keys, scoring configuration and temporary codes out of public GitHub Pages assets.
- Deliver only the currently authorised section's questions; never return answer keys to a candidate.
- Store server start/deadline timestamps and enforce section order, closure and submission deadlines server-side.
- Save drafts with attempt/section/revision identifiers and idempotent submission IDs. Reject stale autosaves after a final submission.
- Refresh resumes the same attempt and deadlines; browser refresh must not restart a timer.
- Network failure retains a local pending draft, visibly reports unsaved work, and reconciles with server acknowledgement. Do not silently claim submission success.
- Do not advance on a failed submission. Deadline recovery and any grace period are explicit, audited teacher decisions.
- Headphone/audio failures require teacher intervention. Disallow normal audio pause, seeking or replay during timed Listening.
- Tab/fullscreen events may be logged for invigilation; a browser cannot guarantee prevention of cheating.
- Store audio privately in file storage, with teacher access checked server-side; do not put audio blobs in Sheet cells or public file links.
- Avoid changing the existing practice-paper pages or their saved results.

## New paper blueprint: DMI Academic Mock 01
All passages, prompts, diagrams, conversations, distractors and keys must be newly written and reviewed. The topics below are a blueprint, not a finished or calibrated paper.
- Listening Part 1: community workshop booking; two-speaker conversation, Q1–10 form completion.
- Listening Part 2: orientation to a science centre; one speaker, Q11–20 multiple choice and plan labelling.
- Listening Part 3: two students planning a research project; Q21–30 matching and multiple choice.
- Listening Part 4: a lecture on urban cooling; Q31–40 note completion.
- Reading Passage 1: seed preservation; Q1–13 factual/identification/completion tasks.
- Reading Passage 2: designing quieter cities; Q14–26 headings, matching and summary tasks.
- Reading Passage 3: collaboration in scientific discovery; Q27–40 inference, writer's views and multiple choice.
- Writing Task 1: an original chart comparing transport choices in a fictional city across three years.
- Writing Task 2: a balanced discussion of investment in public facilities versus individual financial support.
- Speaking Part 1: everyday routines and learning; Part 2: describe a skill learned from another person; Part 3: learning, expertise and education.
- For every keyed question, maintain accepted spellings, word limits, evidence span/time, question type and an unambiguous explanation.
- Validate all 40 Listening questions against the final recorded audio, not just the transcript.
- Do not claim that a DMI-created paper's raw-to-band conversion is official or statistically calibrated.

## AI Speaking requirements
The current Speaking pages use browser transcription and a local heuristic, including speech-recognition confidence as a pronunciation proxy. This must not be presented as examiner-equivalent AI assessment.
- A real server-side assessment integration is required for this mock.
- Record actual speech for all parts. Store prompts, recording references, timestamps and transcripts together.
- Assess fluency/coherence, lexical resource, grammatical range/accuracy and pronunciation.
- Pronunciation assessment needs the audio; transcript alone and recognition confidence are insufficient.
- Model failures, denied microphone access and missing recordings produce a pending assessment, not an invented band or a zero.
- Keep provider credentials server-side; never place API keys in browser files, GitHub or chat.
- Label results “AI estimated band”; permit teacher correction and review.
- Do not calculate a complete overall estimate while Writing or Speaking is unassessed.

## Delivery sequence
1. Implement secure sitting creation/entry and attempt state; exercise abuse, expiry and role checks.
2. Author/review the original Academic paper and produce properly paced Listening recordings.
3. Implement the shared timed candidate runner and autosave/recovery.
4. Connect recorded Speaking to a server-side AI service and the teacher review queue.
5. Add the combined results report and supplied partner badge.
6. Deploy to DMI LMS Security Test first. Conduct an invigilated pilot with headphones/microphones, actual recordings and concurrent students.
7. Back up and publish the matching production backend and website after acceptance.

## Acceptance checks
- Wrong/expired/revoked code; unauthorised class; student attempting teacher actions.
- One code can admit the authorised class, but no candidate gets an unauthorised extra attempt.
- Exact section order, server deadlines, timer refresh, one-play audio and two-minute review.
- 40 Listening/40 Reading answers and both Writing tasks saved against the correct verified candidate.
- Stale drafts, duplicate submissions, intermittent HTML responses and lost network do not lose or duplicate attempts.
- Microphone refusal, failed transcription/AI service and missing audio are recoverable and accurately reported.
- No student sees another student's answers, audio or reports.
- Teachers review Writing/Speaking and release the combined report.
- All four skills work in a concurrent lab pilot. Record actual tested limitations.

## Official format references
- Computer test format: https://takeielts.britishcouncil.org/en-gb/what-is-ielts/how-it-works/test-modes/ielts-on-computer
- Computer Listening review timing: https://takeielts.britishcouncil.org/sites/default/files/listening_part_3_matching_questions.pdf
- Academic Writing: https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing
- Speaking format: https://www.ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking
