# Written runner draft

The isolated mock-runner.html route restores server answers, renders only the current section, uses server clock/deadlines, autosaves every eight seconds, retries an ambiguous save with the same request identity and snapshot, and locks submitted sections. Unacknowledged text remains in page memory; leaving warns and refresh can recover only server-acknowledged work. Revision conflict pauses saves for teacher assistance instead of overwriting another save.

No entry-page link or live rollout was added. Listening playback, Writing chart rendering, Speaking recording, private content adaptation and teacher review are incomplete. Keep DMI_MOCK_RUNNER_ENABLED absent or false. The server gate still prevents new attempts. Existing mock entry and practice pages remain independent.

Browser verification uses synthetic content only; Apps Script acceptance remains pending.
