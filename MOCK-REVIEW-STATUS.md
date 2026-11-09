# Teacher review draft

MockReviews stores append-only Writing criterion marks and feedback with the verified teacher identity, date, task, request identity and base revision. Students cannot call review actions. Writing must close and the immutable paper must match before marking. Duplicate save requests recover their original review; stale edits are refused. A changed or unavailable paper still allows the teacher to see saved answers with an explicit warning.

mock-review.html is an isolated disabled-rollout screen, not linked from the live LMS. It shows acknowledged answers, rubric history and pending assessment. Blank criteria remain unmarked rather than becoming zero. No marks or exam results are released and no overall band is calculated. Speaking and Listening/Reading scoring still need separate review/release implementation. Setup is additive through initializeMockAttempts on the test workbook when native access returns; no setup or deployment was run here.
