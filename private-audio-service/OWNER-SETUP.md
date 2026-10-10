# Owner setup for private Speaking assessment

The code is drafted and disabled. No account, key or hosting has been created. The live LMS is unchanged.

The remaining owner setup has two parts:

1. A Gemini API project/key. Open [Google AI Studio](https://aistudio.google.com/) using the Google account that will own DMI's assessment service. Follow [Google's current key guide](https://ai.google.dev/gemini-api/docs/api-key) to create or use the correct project/key. Keep the key private; it belongs in the hosted service's secret configuration, not this chat, a browser page, GitHub or Apps Script client code. Review that project's access, data-processing terms and billing/quota settings before real student recordings are sent.
2. A private host for the processing service. The draft contains a WSGI callable and a non-root offline worker image; neither is deployed or listening. Hosting needs authenticated HTTPS ingress, a server/runtime, resource and timeout limits, secret storage and durable request/cost controls.

After these exist, configure an available audio-capable Gemini model explicitly. The draft has no default model, account or key. Test only synthetic audio first, then approved private recordings and compare the proposed criterion scores with independent teacher ratings.

Teachers retain control of feedback and score release. AI estimates are DMI practice feedback, not official IELTS results. The current draft neither saves/releases AI scores nor updates existing Marks/ExamResults.

Both mocks still need full private content/audio review and a complete lab trial. Do not enable the mock runner or publish this draft during account/service preparation.
