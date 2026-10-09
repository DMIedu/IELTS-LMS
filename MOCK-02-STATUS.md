# Academic Mock 02

Selected existing sources are pinned in `mock-papers/mock-02-sources.json`: Book 18 Test 1 Listening, Reading and Academic Writing, plus Book 17 Test 1 Speaking. All four source paths/blob versions were checked against the manifest during private adaptation. These are existing DMI practice-page sources; official paper fidelity has not been independently verified.

## Private content draft

An owner-only integrated adapter now contains 40 Listening questions, 40 Reading questions, two Writing tasks, and the separate Speaking prompt draft. Numbered objective IDs and 80 source keys were checked; saved JSON was read back and matched exactly. Compact PaperJSON is 45,072 characters. No question text, scripts, graph values or answer keys were added to this public repository.

The adapter preserves three unordered Listening answer pairs, Reading table relationships and choice labels, and the source Writing line graph (four series, eleven categories, 44 values, with its forecast boundary). Private answer normalization/group scoring metadata is a specification, not implemented scoring. The current renderer supports only grouped bar charts, so this line chart is an explicit readiness blocker rather than silently converted.

## Disabled and pending

Reviewed=false, AudioReviewed=false, listeningSeconds=null and installable=false. Neither mock is enabled or published live. Candidate written timers, acknowledged answer saving and teacher Writing-review drafts exist on this feature branch; native Apps Script acceptance has not occurred.

Still required: line-chart delivery with synthetic tests; full Listening audio playback/recovery, actual duration and independent key/content review; objective scoring and controlled release; Speaking recording/private upload and genuine audio-based assessment; 11–14-minute Speaking timing adaptation (the source fixed schedule totals 580 seconds); teacher review and a timed lab pilot. Existing practice pages, logins and result sheets remain unchanged.
