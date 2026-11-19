# Vibe Monday UX Writing Handbook — STI Library Adaptation

Source: `https://vibe.monday.com/?path=/docs/foundations-ux-writing-handbook--docs`

## Core Principles
1. **Clarity**
   - **Simple language:** Use everyday library words. Replace technical jargon and backend codes with plain explanations.
   - **Concision:** Keep messages short and direct; cut every unnecessary word.
2. **Consistency**
   - **Terminology:** Use one approved term for each concept across every role and screen.
   - **Formatting:** Use the same layout and sentence structure for all errors, confirmations, empty states, and helper notices.
3. **Accessibility**
   - **Inclusive language:** Respectful, neutral wording for students, faculty, staff, and librarians.
   - **Readability:** Short sentences and familiar terms so non-technical staff can act confidently on the first read.

## Personality & Voice
- **Expert and reliable:** Communicate with reassuring confidence. Own problems plainly and explain how to fix them.
- **Proactive and supportive:** Anticipate blockers *before* the user wastes time clicking through a form.
- **Empathetic, conversational, positive, and professional:** Human-to-human, never robotic, never scolding or passive-aggressive.

## Tone Spectrum (Light & Engaging -> Professional & Reliable)
Adjust tone by moment:
1. New feature announcements *(lightest)*
2. Empty states *(helpful, encouraging, with clear next step)*
3. Informational messages *(clear, calm)*
4. Confirmation messages *(direct, reassuring)*
5. User errors *(calm, never blaming, state what to fix)*
6. Sign-in & registration flows *(clear, steady)*
7. System errors *(honest, explain what stayed safe + retry path)*
8. Payments, fines, clearance, data privacy & security *(most professional and reliable)*

## 6 UX Writing Values
1. **We work for the users** — Write simple, intuitive, relevant copy.
2. **Stay consistent** — Same term everywhere (`Book queue`, `Copy`, `Borrower`, `School ID`, `Borrow & return`).
3. **Keep it stress-free** — Never manipulate, guilt, or alarm users unnecessarily.
4. **Gradual complexity** — Keep advanced/rare options collapsed; guide one step at a time.
5. **The pen is mightier than the sword** — Never use passive-aggressive or blaming language.
6. **Write for all readers** — No backend jargon, SQL terms, or internal enum names.

## 6 Golden Rules
1. **Bottom line first** — Put the key decision, blocker, or result in the first phrase.
2. **Give full context** — State which book, borrower, or filter scope is affected.
3. **Focus on the user's point of view** — Frame around what the person wants to accomplish next.
4. **One CTA** — Show one clear primary action per screen area, card, or dialog.
5. **Use specific CTAs** — Button text must answer the heading directly.
6. **Cut the fluff** — Delete repeated descriptions and filler sentences.

## STI Library Before / After Microcopy Guide

| Pattern | Avoid (Current Anti-Pattern) | Use Instead (Vibe-Compliant) |
| --- | --- | --- |
| Confirm dialog title & CTA | `"Are you sure?"` / `"Yes, save"` | `"Save borrowing policy changes?"` / `"Save policy"` |
| Cancel action dialog | `"Confirm cancellation"` / `"Cancel"` | `"Cancel this reservation?"` / `"Keep reservation"` & `"Cancel reservation"` |
| Blocking error before booking | Letting user submit then showing `"CIRCULATION_ELIGIBILITY_BLOCKED"` | Upfront banner + disabled button: `"Borrowing limit reached (2 of 2 active). Return a book or cancel a request before adding another."` + link `"View my books"` |
| Field error | `"Invalid input"` or red banner at top of page | Inline under field: `"Enter the 13-digit GCash reference number from the receipt."` |
| Empty filtered table | `"No records."` | `"No loans match \"BSIT\"."` + button `"Clear filters"` |
| Truly empty queue | `"No loans in this view."` | `"No overdue books right now. Active loans due today appear in Due today."` |
| Page header | Hidden `description` + duplicate `<p>` below | Single 1-line `PageHeader` subtitle explaining the desk goal and next action. |
| Raw warning code | `"COPY_DAMAGED_FLAG"` | `"Copy marked For Repair"` + `"Explain why this copy is safe to lend before continuing."` |
