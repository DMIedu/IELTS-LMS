# Owner setup for private Speaking assessment

The assessment code is drafted and disabled. The owner-created Render service dmi-speaking-assessment shows Deploy succeeded / Live in the 10 October screenshot, using the Free instance in Singapore and manual deployment from the draft branch. This hosting status is screenshot-confirmed; independent endpoint verification remains pending. No Gemini key/model or real assessment has been verified. The live LMS is unchanged.

The remaining owner setup has two parts:

1. A Gemini API project/key. Open [Google AI Studio](https://aistudio.google.com/) using the Google account that will own DMI's assessment service. Follow [Google's current key guide](https://ai.google.dev/gemini-api/docs/api-key) to create or use the correct project/key. Keep the key private; it belongs in the hosted service's secret configuration, not this chat, a browser page, GitHub or Apps Script client code. Review that project's access, data-processing terms and billing/quota settings before real student recordings are sent.
2. A private host for the processing service. The draft now includes a non-root HTTP image (Dockerfile.web), a bounded Gunicorn configuration and a separate offline worker image. The owner has deployed the web image on Render; the worker and assessor remain disabled by default. Hosting needs authenticated HTTPS ingress, a server/runtime, resource and timeout limits, secret storage and durable request/cost controls.

After these exist, configure an available audio-capable Gemini model explicitly. The draft has no default model, account or key. Test only synthetic audio first, then approved private recordings and compare the proposed criterion scores with independent teacher ratings.

Teachers retain control of feedback and score release. AI estimates are DMI practice feedback, not official IELTS results. The current draft neither saves/releases AI scores nor updates existing Marks/ExamResults.

Both mocks still need full private content/audio review and a complete lab trial. Do not enable the mock runner or publish this draft during account/service preparation.

## Reviewable HTTP package

Build from private-audio-service using Dockerfile.web. The image runs Gunicorn 26.2.0 with one synchronous worker, one thread, optional control socket disabled, backlog 8, a 210-second worker timeout, access logging disabled and worker scratch files in /dev/shm. The default service returns WORKER_DISABLED. The web entry point does not enable either assessment or the LMS runner.

The owner-selected host must provide HTTPS termination, private secret injection, a maximum request body of 18 MiB, request read deadlines, a small bounded queue, CPU/memory limits and only one pilot instance. Start with at least 512 MiB memory, then measure synthetic peak usage; this is a proposed allocation, not a verified capacity guarantee. Use a read-only root filesystem, non-root UID 10001, no added capabilities, and bounded writable /dev/shm. Configure upstream timeout slightly above 210 seconds and reject slow or oversized uploads before they reach Python. Do not expose this raw HTTP container directly to the internet.

Settings to inject privately after a separately authorized pilot:
- PORT: defaults to 8080, accepts ports 1024–65535.
- DMI_AUDIO_WORKER_ENABLED: false by default.
- DMI_AUDIO_WORKER_TOKEN: private service bearer token, minimum 32 characters.
- DMI_AUDIO_ASSESSOR_ENABLED: false by default.
- DMI_AUDIO_GEMINI_KEY: provider secret; never put it in the image or repo.
- DMI_AUDIO_GEMINI_MODEL: explicitly selected audio-capable model.

Do not use Gunicorn command/environment overrides to add workers or threads. The in-memory replay cache handles exact retries only within the same process for five minutes; a restart, expired entry or multiple instances can cause another provider call. Durable request claims, response storage and cost limits remain required before broader real-user use. Automatic retries after uncertain provider completion must stay off.

Synthetic loopback HTTP checks cover disabled mode, missing token, rejected credentials, malformed authenticated requests, route/method handling and invalid port rejection. CI builds both images; no image registry push, cloud host, external API call or real recording is part of these checks. Native HTTPS ingress, limits, IAM/secrets, Gemini compatibility and teacher calibration remain unverified.

References: [Gunicorn settings](https://gunicorn.org/reference/settings/) and [pinned package release](https://pypi.org/project/gunicorn/26.2.0/).


## Owner-created Render pilot

The Render setup uses an empty Root Directory, Docker build context private-audio-service, Dockerfile path private-audio-service/Dockerfile.web, Auto-Deploy Off and an empty HTTP Health Check Path (TCP startup checks). Service URL shown by Render: https://dmi-speaking-assessment.onrender.com .

The first deployment at ff3726e emitted a Gunicorn management-socket permission error for /home/worker while Render still reported Live. The draft correction disables the unused control socket instead of granting write access. After checks pass, manually deploy the corrected branch commit and inspect fresh logs. Auto-Deploy Off means GitHub changes are not installed automatically.

A browser GET to /v1/evaluate should return POST_REQUIRED. This verifies only routing/server reachability, not AI readiness or authenticated POST behavior. The root URL returns NOT_FOUND because this is an API service, not a homepage. No real recordings or provider secrets should be added until disabled/authenticated synthetic acceptance, account/model setup and cost controls are verified.
