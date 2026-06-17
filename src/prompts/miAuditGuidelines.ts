/**
 * Mercedes Intelligence 2.0 (MI 2.0) warranty audit survival guidelines.
 * Stories that pass MI review are factual, workflow-complete, evidence-linked, and structurally clear.
 */
export const MI_AUDIT_GUIDELINES = `## MERCEDES INTELLIGENCE 2.0 — AUDIT-RESISTANT WRITING STANDARD

Mercedes Intelligence 2.0 evaluates warranty stories for **factual consistency**, **diagnostic logic**, **workflow completeness**, and **billing defensibility**. Stories that survive audit share these traits:

### What MI 2.0 Rewards (write toward these)
1. **Clear 3 C's headers** — "Customer Complaint/Concern", "Cause", and "Correction" are explicit and easy to parse. Each section has a distinct purpose; no blending cause into complaint or correction into cause.
2. **Complaint-to-evidence chain** — Customer concern is tied to this RO line. Cause is built step-by-step from documented evidence (test drive → voltage → XENTRY → guided tests → findings). Every code, measurement, or guided test in Cause must appear in the technician's provided data.
3. **Complete 10-step workflow** — All standard warranty workflow steps appear in chronological order, woven naturally (not as a naked numbered list). Missing steps use [NOT DOCUMENTED] or [NOT PROVIDED] — MI flags *omitted* steps more harshly than honest placeholders.
4. **Correction matches Cause** — Repair actions directly address the stated root cause. Post-repair verification (final Quick Test, disconnect, verification drive) closes the loop.
5. **Mileage discipline** — Mileage in/out documented when available in RO data. Verification drives reference realistic distances (typically 3–5 miles) without inventing odometer readings.
6. **Technician voice** — First-person, professional, concise. Active verbs ("Performed", "Verified", "Confirmed", "Replaced"). No marketing language, no vague hedging ("seems like", "probably").
7. **Technical specificity without fabrication** — Use exact codes, measurements, and component names from provided OCR/notes. Specificity from real data scores higher than generic boilerplate.
8. **Audit-safe honesty** — Placeholders signal awareness of missing documentation. Invented test results, voltages, or codes are the #1 MI rejection trigger.

### What MI 2.0 Flags (avoid these)
- **Fabricated data** — Any number, code, test result, or procedure not in the provided repair line data
- **Missing 3 C's structure** — Wall-of-text stories without clear sections
- **Cause without evidence** — Jumping to root cause without walking through diagnostics
- **Correction without verification** — Repairs stated without final Quick Test / test drive closure
- **Complaint mismatch** — Story addresses a different concern than the labeled RO line
- **Copy-paste boilerplate** — Identical phrasing across unrelated repairs; lacks line-specific detail
- **Contradictions** — Story claims steps that contradict provided notes or omit documented OCR findings
- **Excessive length / noise** — Over 2,500 characters or padded with irrelevant detail

### MI 2.0 Scoring Mental Model (for generation quality)
- **90–100**: Full 3 C's, complete workflow, evidence-linked cause, verified correction, zero fabrication risk, line-specific detail
- **75–89**: Strong structure and workflow; minor gaps (placeholders for 1–2 steps) or light generic phrasing
- **60–74**: Recognizable structure but weak evidence chain, missing workflow steps, or vague cause/correction linkage
- **Below 60**: Structural failures, likely fabrication, or missing 3 C's — high MI rejection risk`;

export const MI_GENERATION_STYLE_RULES = `### MI 2.0 GENERATION STYLE (STRICT)
When writing warranty stories, you MUST:
- Open with a labeled **Customer Complaint/Concern** section quoting or paraphrasing the RO complaint for THIS line
- Build **Cause** as a chronological diagnostic narrative: initial drive → source voltage → battery charger → XENTRY Quick Test → guided testing → findings → conclusion
- Close **Correction** with documented repairs PLUS final Quick Test, disconnect, and verification drive
- Use [NOT DOCUMENTED] / [NOT PROVIDED] for any step lacking data — never invent filler
- Prefer short, precise sentences. One procedure per sentence where possible
- Reference fault codes and measurements exactly as provided
- End with confidence the repair was verified — MI expects closure`;