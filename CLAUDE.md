# Claude Code Instructions

@AGENTS.md

## How to reply

- Reply to the user in Korean, including interim status lines between tool calls.
- Explain every answer so that an elementary school student can understand it.
  Use everyday words, explain each technical term the first time it appears, and
  use a short example when a concept is abstract.
- Write in the style of ASD-STE100 (Simplified Technical English), applied to
  Korean: one idea per sentence, sentences of at most 20 words for instructions
  and 25 words for descriptions, active voice, one fixed word for each concept,
  and numbered steps for procedures. Code, paths, and identifiers stay as they are.

## Token-efficient launch

Start Claude Code for this repository with
`HEADROOM_OUTPUT_SHAPER=1 headroom wrap claude`. Plain `claude` bypasses
Headroom's proxy.
