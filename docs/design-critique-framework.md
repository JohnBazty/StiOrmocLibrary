# StiOrmocLibrary Design Critique Framework

## Why

StiOrmocLibrary serves students, faculty, librarians, and administrators across task-heavy workflows such as catalog search, borrowing, reservations, attendance, printing, fines, clearance, inventory, and reporting. This framework makes design reviews consistent, evidence-based, and useful to the people implementing the product.

It is intended for reviews of wireframes, prototypes, completed screens, and end-to-end flows. It does not replace usability testing or accessibility testing.

- **Date created:** 2026-10-10
- **Date last updated:** 2026-10-10
- **Status:** `built`

## How to use this framework

Before a critique, identify:

- The screen or flow being reviewed.
- The primary user role: Student, Faculty, Librarian, Administrator, or staff role when implemented.
- The user's goal and the successful end state.
- The device and viewport being reviewed.
- The design maturity: concept, wireframe, visual design, prototype, or implemented interface.
- Known product, technical, and brand constraints.
- The evidence available: screenshots, prototype recordings, task results, analytics, support reports, or direct observation.

Review the design against the evaluation criteria, record feedback using the standard format, agree on priorities and owners, and confirm follow-up actions. Do not present an assumption as a verified defect.

## 1. Critique structure

### What works well

Identify choices that help users complete their task or that should be preserved during later changes.

For each strength:

- Name the exact screen, component, or interaction.
- Explain which user goal it supports.
- Identify the design principle it demonstrates.
- State what should remain unchanged.

Example:

> **Catalog — availability shown beside each result:** Users can decide whether an item is worth opening without leaving the results page. Preserve this information when the card layout is revised.

### Areas for improvement

Describe observed friction without assigning blame or prescribing a solution too early.

For each issue:

- State what was observed and where.
- Identify the affected role and task.
- Explain the likely user impact.
- Support the observation with evidence when available.
- Separate verified behavior from assumptions that still need testing.

Example:

> **Reservation queue — status lacks a next step:** A user can see “Ready for Pickup” but not the claim deadline or required action. This could lead to an expired reservation even though the status itself is visible.

### Questions and concerns

Use questions to expose missing requirements or evidence, not to hide a recommendation.

Useful questions include:

- What is the most important action on this screen?
- What information must the user know before committing the action?
- What happens when data is empty, delayed, invalid, stale, or unavailable?
- Can the task be completed with keyboard-only input and at 200% zoom?
- Does the design work for long names, long titles, large result sets, and small screens?
- Are status, errors, and warnings understandable without color?
- Does the user know what happened and what to do next?
- Does the flow match the approved product rules and the user's permissions?
- Does the solution depend on data or behavior the current API does not provide?

### Actionable recommendations

Convert the highest-impact observations into changes that can be designed, implemented, and verified.

Every recommendation should:

- Begin with an action verb.
- Identify the exact location and affected role.
- Describe the expected behavior, not only the preferred appearance.
- Include a measurable acceptance check.
- Respect the STI palette and the existing product architecture.
- Avoid expanding the feature beyond the problem being solved.

Example:

> **Add the claim deadline and a “View pickup details” action to every Ready for Pickup reservation.** Show the deadline in Asia/Manila time, include the same information in the detail view, and verify that it remains readable at 320 px width and with keyboard-only navigation.

## 2. Evaluation criteria

Score each criterion from 1 to 5 only after writing the supporting observations:

- **1 — Critical:** The design prevents or seriously risks task completion.
- **2 — Weak:** Major friction or exclusions affect common use.
- **3 — Adequate:** The main task works, but meaningful issues remain.
- **4 — Strong:** The experience is clear and reliable, with minor gaps.
- **5 — Excellent:** The experience is efficient, inclusive, consistent, and well evidenced.

The score is a summary, not a substitute for individual findings.

### Usability

Evaluate whether each user can understand the screen, complete the task efficiently, recover from errors, and confirm the result.

Check:

- The primary action is obvious and appears at the right point in the flow.
- Labels use familiar library language rather than internal system terms.
- Search, filters, sorting, pagination, and selected state are visible and reversible.
- Forms prevent avoidable errors and preserve valid input after a failure.
- Loading, empty, success, error, offline, and permission-denied states are defined.
- Destructive or irreversible actions explain the consequence and require deliberate confirmation.
- Status-heavy flows such as reservations, printing, borrowing, fines, and clearance always show the current state and next step.
- Repeated administrative tasks support efficient keyboard and barcode-scanner use.

### Visual design

Evaluate whether hierarchy, spacing, typography, and the STI brand palette make the interface easy to scan and understand.

Check:

- The page has one clear heading and a visible primary action.
- Related information is grouped and competing elements do not have equal emphasis.
- STI blue `#003399`, STI yellow `#FFF200`, and white `#FFFFFF`, including approved opacity variants, are used consistently.
- Yellow is reserved for emphasis and does not reduce text readability.
- Dense tables remain scannable through alignment, spacing, headings, and responsive treatment.
- Light and dark modes preserve hierarchy and contrast.
- Icons support labels instead of replacing essential text.

### Accessibility

Evaluate against WCAG 2.2 Level AA and practical assistive-technology use.

Check:

- Every action and form control is operable with a keyboard.
- Focus is visible, follows a logical order, stays inside an open modal, and returns to the trigger after closing.
- Controls have programmatic names; form fields have associated labels, instructions, and error messages.
- Status changes and validation errors are announced to screen readers when appropriate.
- Text, controls, and meaningful graphics meet contrast requirements in light and dark modes.
- Color is never the only way to identify availability, severity, selection, or status.
- Content works at 200% zoom, 320 px width, and with increased text size without losing actions or information.
- Touch targets are large enough and sufficiently separated for reliable mobile use.
- Motion respects reduced-motion preferences.

### Consistency

Evaluate whether the same meaning, action, and state are presented in the same way across the product.

Check:

- Shared buttons, inputs, dialogs, drawers, tables, status badges, and notifications behave consistently.
- Role-specific navigation uses predictable placement, naming, and active-state treatment.
- The same domain status uses the same label and explanation everywhere it appears.
- Date, time, currency, identifiers, capitalization, and empty-state language follow one convention.
- Similar confirmation, cancellation, and error flows use the same interaction pattern.
- Responsive and dark-mode variants preserve the same information and action priority.

### Innovation

Evaluate whether a new idea meaningfully improves the library task rather than adding novelty or complexity.

Check:

- The idea addresses an observed user problem.
- It reduces time, errors, effort, or staff intervention.
- It remains understandable to first-time and infrequent users.
- A familiar fallback exists if the enhancement fails or is unavailable.
- It respects privacy, accessibility, device, connectivity, and operational constraints.
- Its benefit can be tested with a clear success measure.

An innovative concept should not receive a high score if it weakens basic usability or accessibility.

## 3. Feedback categories

Assign one primary category to each finding. Add a secondary category only when it changes who should address the issue.

### User experience

Use for information architecture, task flow, discoverability, navigation, decision-making, recovery, and overall effort.

StiOrmocLibrary examples:

- A student cannot tell why clearance is blocked or what resolves it.
- A librarian must move between several screens to finish one return.
- A reservation state is visible but its deadline and next action are not.

### Visual design

Use for hierarchy, typography, spacing, color, contrast, iconography, density, and responsive composition.

StiOrmocLibrary examples:

- Several buttons appear equally important although only one advances the task.
- A wide inventory table hides critical actions on a small screen.
- A muted blue opacity makes supporting text difficult to read in dark mode.

### Interaction design

Use for control behavior, focus, input, feedback, transitions, confirmation, error handling, and state changes.

StiOrmocLibrary examples:

- Closing a dialog does not return focus to the button that opened it.
- A barcode scan provides no immediate success or failure response.
- A filter applies automatically but gives no visible indication that results changed.

### Content and copy

Use for labels, instructions, status explanations, errors, empty states, confirmations, tone, and terminology.

StiOrmocLibrary examples:

- “Invalid operation” does not explain what failed or how to recover.
- “Claimed” is used where the user needs “Picked up by borrower.”
- A destructive action does not name the record that will be affected.

### Technical feasibility

Use when a proposal depends on data, permissions, performance, hardware, storage, connectivity, or behavior that may not exist.

StiOrmocLibrary examples:

- A dashboard concept needs real-time data that the current API only returns on refresh.
- A proposed role action conflicts with server-enforced permissions.
- An offline interaction cannot safely complete a transaction that requires a server-side lock.

Technical feasibility should shape the solution, not be used to dismiss a demonstrated user need. Record the constraint and propose the nearest viable experience.

## 4. Feedback format

Record one problem per feedback item. Use this template:

```text
ID: [Short unique identifier]
Location: [Role, route or flow, screen, and component]
Category: [Primary feedback category]
Criteria: [One or more evaluation criteria]

Observation:
[Describe the visible behavior and the evidence. Avoid vague judgments.]

Impact:
[Who is affected, what task is affected, and what can happen as a result.]

Priority:
[P0, P1, P2, or P3, with a one-sentence reason]

Recommendation:
[Describe the smallest change that addresses the observed problem.]

Acceptance check:
[State how the team will verify that the change solved the problem.]

Owner and status:
[Named owner or discipline] — [Open, Accepted, In progress, Resolved, Deferred, or Rejected]

Evidence and links:
[Screenshot, prototype frame, recording, task result, issue, or implementation link]
```

### Specific observations

Write what a reviewer can point to, reproduce, or measure.

- Weak: “The form is confusing.”
- Strong: “After an invalid School ID is submitted, the error appears only at the top of the page; focus remains on the submit button and the School ID field is not identified as the source.”

### Impact assessment

Describe impact in user terms:

- Task blocked or completed incorrectly.
- High risk of data loss, privacy exposure, or unauthorized action.
- Significant delay, repeated work, or staff dependency.
- Misunderstood state, deadline, fee, or consequence.
- Exclusion of keyboard, screen-reader, low-vision, or mobile users.
- Minor friction or cosmetic inconsistency with no meaningful task effect.

### Priority level

- **P0 — Blocker:** Prevents a critical task, creates a serious security/privacy risk, causes data loss, or excludes users from a required service. Resolve before release.
- **P1 — High:** Causes frequent failure, serious confusion, or an accessibility barrier in a core workflow. Include in the current release or next immediate fix.
- **P2 — Medium:** Creates recoverable friction, inconsistency, or inefficiency. Schedule after P0 and P1 findings.
- **P3 — Low:** A minor refinement with limited user impact. Address when working in the same area; do not displace higher-impact work.

Priority is based on impact, frequency, reach, and recoverability—not personal preference or implementation effort. Effort should be estimated separately.

### Suggested solutions

Recommend the smallest change likely to solve the stated problem. When evidence is limited, label the solution as a hypothesis and define a test.

Good recommendations:

- Describe behavior as well as appearance.
- Preserve existing architecture and shared components.
- Include empty, loading, error, responsive, keyboard, and dark-mode behavior where relevant.
- Do not depend on unsupported data or permissions.
- Include a verification condition.

## 5. Collaborative approach

### How to present feedback

- Start with the user's goal, the design constraints, and what works well.
- Walk through the flow in the order the user experiences it.
- Present observations before recommendations.
- Group findings by task or theme, then order them by priority.
- Critique the work, not the person who created it.
- Distinguish product requirements, verified evidence, professional judgment, and open questions.
- Limit the meeting discussion to decisions that benefit from collaboration; record minor items asynchronously.

### How to receive feedback

- Restate the observation to confirm shared understanding.
- Ask for evidence or a reproduction path when the issue is unclear.
- Explain constraints with concrete facts, not defensiveness.
- Separate disagreement about the problem from disagreement about the proposed solution.
- Record the decision and rationale, including valid rejected or deferred feedback.
- Request a short follow-up test when competing solutions cannot be resolved from evidence.

### Follow-up actions

At the end of the review:

1. Confirm the accepted P0 and P1 findings.
2. Assign an owner and target milestone to every accepted item.
3. Identify dependencies, unresolved questions, and required product decisions.
4. Convert accepted findings into trackable work items with acceptance checks.
5. Re-review changed flows, including responsive, keyboard, screen-reader, loading, empty, error, and dark-mode states where relevant.
6. Close an item only after its acceptance check passes.

### Documentation

Keep one critique record per reviewed flow or release. Store:

- Review date, participants, scope, user role, device, and design version.
- Evaluation scores and the observations supporting them.
- Feedback items, priorities, owners, statuses, and evidence.
- Decisions, rejected alternatives, and reasons.
- Follow-up test results and unresolved risks.
- Links to the final design, implementation work, and verification evidence.

Do not overwrite the original critique after implementation. Add resolution notes so the record preserves what changed and why.

## Project-specific critique checklist

Use these checks in every StiOrmocLibrary design review:

- Verify the experience for every role that can access the flow; do not assume the administrative and student versions have the same needs.
- Confirm that permissions shown in the interface match server-enforced permissions.
- Show status and the next action together for borrowing, reservations, printing, fines, clearance, attendance, and inventory.
- Display deadlines and operational times clearly in Asia/Manila time.
- Pair every status color with text and, where useful, an icon.
- Use only the approved STI palette and verify contrast for opacity variants and dark mode.
- Preserve complete names, book titles, identifiers, amounts, and dates without hiding essential distinctions.
- Define loading, empty, partial-data, error, offline, and permission-denied states.
- Verify keyboard-only use, focus behavior, screen-reader names, 200% zoom, and a 320 px viewport.
- Verify that barcode and QR workflows provide immediate, unambiguous feedback and a safe manual fallback.
- Confirm destructive actions name the affected record, explain the consequence, and preserve required history.
- Confirm the proposal uses data and behavior supported by the current API and schema; document any required backend work separately.

## Completed critique example

**ID:** RES-01  
**Location:** Student — Reservations — Ready for Pickup card  
**Category:** Content and copy  
**Criteria:** Usability, accessibility, consistency

**Observation:** The card shows the status “Ready for Pickup,” but the design does not show the claim deadline or explain what the student must bring to the counter.

**Impact:** A student may believe the reservation remains available indefinitely, miss the pickup window, and lose the reserved copy. The lack of instructions can also increase questions at the circulation desk.

**Priority:** P1 — the missing information can cause a time-sensitive core task to fail.

**Recommendation:** Add a plain-language next-step message directly below the status, show the exact claim deadline in Asia/Manila time, and provide a “View pickup details” action. Do not rely on color to communicate urgency.

**Acceptance check:** In a usability check, a student can identify the reservation state, deadline, location, and required next action without opening another screen. The content remains available to keyboard and screen-reader users and fits at 320 px width without horizontal scrolling.

**Owner and status:** Product design and frontend — Open

**Evidence and links:** Add the reviewed frame, screenshot, or task recording before triage.

## Definition of done for a critique

A critique is complete when:

- The reviewed scope, user, device, and evidence are recorded.
- All five evaluation criteria have supporting observations and a score.
- Strengths and improvement areas are both documented.
- Every accepted issue uses the standard feedback format.
- Priorities reflect user impact rather than opinion or implementation ease.
- P0 and P1 items have owners, acceptance checks, and follow-up dates.
- Open questions and feasibility constraints have named owners.
- The critique record and supporting evidence are stored where the team can find them.

## Implementation tracking

- [x] Define the critique structure.
- [x] Define the five evaluation criteria and scoring scale.
- [x] Define feedback categories.
- [x] Define a specific, actionable feedback format.
- [x] Define presentation, reception, follow-up, and documentation practices.
- [x] Add StiOrmocLibrary-specific checks and a completed example.

## Change log

- **2026-10-10:** Created the initial design critique framework.
