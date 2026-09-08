# Local model lab

Scope authorized by the user's 2026-09-08 request: a separate local experiment page,
independent OCR/layout/LLM selection, and the existing demo report presentation.
This does not change the approved production report creation flow.

- Fixed existing 15-slide/17-PIN benchmark snapshot; no arbitrary file or model path input.
- Three cached OCR engines × three cached layout engines × three installed LLMs.
- Explicitly distinguish loading an existing result from fresh LLM inference. OCR/layout
  caches retain source hashes and original timing; fresh elapsed time is separate.
- Reuse the existing instructor report UI without replacing the original saved report.
- Local development + loopback + local database + authenticated report owner only.
- No external model calls, auto-downloads, production data writes or database migrations.
- Persist local run history outside Git. Validate model IDs, dataset hashes and model checksum.
- One fresh inference at a time; errors remain visible and never substitute another model.
- A/B and charts retain their existing format. Original question-category charts are not
  model accuracy; experimental output remains an unverified draft.
- Missing dependencies/data must be displayed as unavailable, not fabricated results.

Verification: selection and network-boundary tests, cached and fresh execution,
existing report rendering, type/build checks. Preserve existing local DB; no reset.

Verified on 2026-09-08: saved default combination and A/B rendering; fresh
Tesseract + PP-DocLayout-S + Qwen3 1.7B completed all 17 PINs in 269.3 seconds
(LLM stage; 6 outputs passed structural/evidence checks, not an accuracy score).
History reopening, original report, and 390px mobile overflow check passed.
All 27 selections validate; this does not mean all 27 combinations were benchmarked.

2026-09-08 follow-up scope: show per-model status, measured stage seconds, peak
memory and token usage, plus per-PIN generation time. Cached stage timing is
historical, never current execution time. Running elapsed time is request wall
time, not completed inference time. External API fee is zero for these local
engines; electricity, hardware depreciation and total operating cost are not
measured and must remain unknown. Preserve original report and ownership checks.
