# Listening-paper repair

Audited all 10 listening papers linked from the home page: Book 17 Tests 1–2, Book 18 Tests 1–4 and Book 19 Tests 1–4 (40 audio parts).

## Findings and changes

- All papers initially selected local media files. None of those files or the Audio directory exists in the repository. The default is now each part's online audio.
- All 16 Book 18 links used 2023/05; their source pages list 2023/06.
- All 16 Book 19 links used 2024/05 and .mp3; their source pages list 2024/07 and .m4a.
- The eight Book 17 online links match the source listing and are retained.
- Unverified YouTube fallbacks reused video IDs across different books/tests. They are replaced with a link to the selected part's actual audio, avoiding a potentially unrelated recording.
- A shared native audio controller handles errors, user-gesture playback restrictions, seeking and volume. It preserves position while navigating questions within the same part and remembers positions when returning to a part.
- Changing part pauses and selects the matching recording. It does not autoplay. Selected disk audio stays loaded during question navigation, and replaced file object URLs are released.
- A failed source gives an actionable status message. Students can open that part's audio separately or choose the matching audio file from their device.
- Questions, answer fields, scoring, exam timing and submission code are unchanged.

## Source evidence

The corrected URLs were checked against these pages on 9 October 2026 (Asia/Colombo). The pages list all four audio parts; no recordings or additional question text were copied:

- [book 17 listening test 1](https://ieltstrainingonline.com/practice-cam-17-listening-test-01-with-answer-and-audioscripts/)
- [book 17 listening test 2](https://ieltstrainingonline.com/practice-cam-17-listening-test-02-with-answer-and-audioscripts/)
- [book 18 listening test 1](https://ieltstrainingonline.com/practice-cam-18-listening-test-01-with-answer-and-audioscripts/)
- [book 18 listening test 2](https://ieltstrainingonline.com/practice-cam-18-listening-test-02-with-answer-and-audioscripts/)
- [book 18 listening test 3](https://ieltstrainingonline.com/practice-cam-18-listening-test-03-with-answer-and-audioscripts/)
- [book 18 listening test 4](https://ieltstrainingonline.com/practice-cam-18-listening-test-04-with-answer-and-audioscripts/)
- [book 19 listening test 1](https://ieltstrainingonline.com/practice-cam-19-listening-test-01-with-answer-and-audioscripts/)
- [book 19 listening test 2](https://ieltstrainingonline.com/practice-cam-19-listening-test-02-with-answer-and-audioscripts/)
- [book 19 listening test 3](https://ieltstrainingonline.com/practice-cam-19-listening-test-03-with-answer-and-audioscripts/)
- [book 19 listening test 4](https://ieltstrainingonline.com/practice-cam-19-listening-test-04-with-answer-and-audioscripts/)

tests/listening-audit.json records each old/new URL and the distinction between source-listing verification and actual decoded playback.

## Validation

174 deterministic player/page integration checks pass. All 10 inline page scripts and the shared controller parse. Question HTML and scoring functions were compared to the previous source and are unchanged.

The Listening checks workflow runs the Node tests and makes small header/range requests to all 40 external URLs, retaining a JSON status/type report. It closes each response without reading the recording. An audio-compatible HTTP response does not prove full playback, seeking support or correctness of every recording.

Native browser testing is unavailable in this session because the local tool runtime failed to start. Actual audible playback, mobile behavior and external-host hotlink restrictions remain unverified. External hosting can change independently of this website.

## Browser check after publication

Open each listening paper and press Play for Parts 1–4. Confirm sound matches the questions. Navigate between two questions in the same part: the audio must keep playing without restarting. Pause/resume, seek and adjust volume. A new part should select the corresponding audio and wait for Play.

If embedded playback fails, try **Open Part N audio separately**. If that also fails, provide the paper name and part number; use the matching local audio file in the meantime.

This is a frontend-only repair. Apps Script, properties and the pending lesson-progress test package are unchanged.
