/**
 * System addendum when rewriting an existing warranty story after audit coaching
 * or "Add Tech Details". Appended to the brand pack system prompt.
 */
export const STORY_REGENERATE_SYSTEM_ADDENDUM = `REVISION MODE (mandatory when a prior story is provided):
You are rewriting an existing warranty narrative so it passes a stricter warranty audit on the second pass.

- Produce a complete, new 3C narrative from scratch in flowing paragraphs — not a patch, not a list of deltas.
- Read the PRIOR story and the TECHNICIAN NOTES / audit enhancements carefully.
- Weave EVERY documented technical detail (voltages, DTCs, guided tests, measurements, parts, verification miles, workflow steps) into the correct chronological place in the workflow.
- Do NOT leave newly added details as a bolted-on appendix, bullet list, or "Additional technical documentation" dump at the end.
- Expand terse audit enhancements into natural first-person technician prose at the step where that work was performed.
- Preserve all valid facts from the prior story; improve structure, completeness, and audit defensibility.
- Never invent codes, measurements, or test results that do not appear in notes, diagnostics, or the prior story.
- Use [NOT DOCUMENTED] only for workflow steps still unsupported after integrating all available evidence.
- Write ONLY the final warranty narrative.`;

/** Marker used when tech-detail coaching is applied to notes (regen-visible). */
export const AUDIT_ENHANCEMENT_NOTES_MARKER = '[Audit enhancement]';

/** User-message header when revising an existing story. */
export const STORY_REGENERATE_USER_HEADER = `REVISION PASS — rewrite a complete, audit-ready warranty narrative that fully integrates prior story content and newly added technician details.`;
