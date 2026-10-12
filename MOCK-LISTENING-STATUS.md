# Listening playback and recovery draft

Both mock runners remain disabled. The shared candidate draft now plays reviewed Listening clips in fixed order against elapsed server attempt time. Refresh and retry rejoin the current position; playback cannot reset deadlines or replay missed time through the normal interface. Media failures do not alter acknowledged answer saving. The recording stops at its scheduled end, leaving the separate two-minute review period, and is removed when Reading begins or attempt access is blocked.

## Required private paper data

PaperJSON must contain listeningAudio.clips (one to four). Each clip has url, integer startSeconds, and integer durationSeconds; clips start at zero without gaps/overlap and their durations must sum exactly to listeningSeconds. Backend requires HTTPS URLs on the single explicitly configured DMI_MOCK_AUDIO_HOST. Unknown fields are excluded from candidate responses. Only Listening receives the audio schedule. No host property, paper, credentials or deployment was installed by this change.

The media host must support byte-range seeking. The player compares loaded media duration to the reviewed schedule (two-second tolerance), stops with a teacher message on duration mismatch/non-seekable media, retains visible connection failures and rejoins on retry. Browser autoplay may still require a candidate click. Headphone/media preflight before the timed attempt needs lab validation.

This is a UI playback policy, not a secure streaming/anti-replay service: media URLs visible to an authorised candidate can be accessed separately. Private/signed media delivery and proctor incident handling remain future work. Client clock synchronisation comes from verified attempt responses; browser controls cannot change server deadlines.

## Verification

Synthetic silent WAV fixtures cover initial clock position, fixed normal speed, seek correction, ordered clip switching, refresh, review time, leaving Listening, bad duration, unsupported seeking, connection failure and retry. The test server implements byte ranges for seekable clips and separately tests a non-seekable response. Backend rejects missing/unapproved/misordered/mismatched schedules; teacher-review fixtures include reviewed synthetic audio.

All checks passed on 565e2460899e879b408c49baaaefbe15a7a26396: 95 attempt/review checks; 14 Listening browser checks; existing 82 entry backend, 36 entry browser, 18 runner, 10 teacher-review and 17 chart browser checks, plus login checks. https://github.com/DMIedu/IELTS-LMS/actions/runs/38012409675

Actual Mock 01 recordings are not assembled into a measured reviewed master. Mock 02 clip durations/full playback are not reviewed. Both private adapters keep Reviewed=false, AudioReviewed=false and listeningSeconds=null. Native Apps Script acceptance, real audio/headphone lab review, Speaking recording/private upload/audio assessment, objective scoring and result release remain pending. No original questions/scripts/keys or audio were added to the public repo.
