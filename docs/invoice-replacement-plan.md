# Invoice replacement plan for printing and fines

- **Date created:** 2026-09-27
- **Date last updated:** 2026-09-27
- **Status:** `planned`
- **Scope:** Phase 2 item A10; planning only, with no application, database, GitHub, or deployment changes in this step.

## Why

The Student Fines page currently lists OR-numbered PDFs under **Payment records**, and the Student Printing page lists PR-numbered PDFs under **Payment records**. A separate Invoices page exists, but an administrator must enter a payment record ID and issue an invoice manually. This does not deliver the requested experience: after a qualifying payment, the student should see and download an **Invoice** in the place where they paid. The old OR/PR documents must not be renamed to look like newly issued invoices.

The preserved [Final Draft](source/Final-Draft.pdf) covers front-desk printing collections, fines, and payment tracking. The [Administrative System Flow](source/Admin-System-Flow.pdf) is the original operational reference. The current Supabase schema and local, unapplied migration `014_phase2_invoices.sql` are documented in [schema-context.md](schema-context.md). The user's later invoice requirement refines the original payment-document behavior.

## Target experience

1. **Student Printing:** Replace the customer-facing **Payment records** card with **Invoices**. After the librarian records a qualifying printing payment, show its invoice number, date, amount, print request, status, and **View invoice / Download invoice** actions in that card. The separate My Invoices page can remain as the complete invoice history.
2. **Student Fines:** Replace the OR-numbered **Payment records** card with **Invoices**. Show the invoice for each qualifying fine payment, including partial payments; show the associated fine or lost-book collection and amount. The download must be the invoice PDF.
3. **Admin Printing and Fines:** When recording a qualifying cash payment, show the issued invoice number immediately, with View/Download/Reprint actions. The Admin Invoices page remains the configuration and audit ledger, but routine staff must not type a database payment ID to create an invoice.
4. **Notifications and wording:** Say **Invoice available** and link to the correct invoice. Remove new customer-facing **receipt**, **OR**, **PR**, and generic **payment PDF** actions from these flows once the approved invoice flow is active. The internal payment ledger may keep historical table and field names for compatibility.
5. **Historical records:** Preserve already issued OR/PR payment documents unchanged, with their original numbers and PDFs in a clearly identified historical area or audit view. Never silently rename or renumber one as an invoice. Any invoice for an old payment requires an explicit, finance-approved historical issuance process.

## How

1. **Approval and document template:** The school finance team supplies and approves the issuer identity, address, tax details, invoice format, serial range, authorization details, and treatment of printing fees, fines, and lost-book charges. Configure these in the existing invoice setup before enabling issuance. Review the actual PDF against the approved template; a title change alone is insufficient.
2. **Supabase data model:** Keep payment transactions as the accounting source and `customer_invoices` as a linked, separately numbered document ledger. Review local migration `014` and add a backward-safe Supabase migration only if the invoice linkage, snapshot, numbering, status, or old/new document distinction requires it. The active database is Supabase Postgres; MySQL files remain rollback references only.
3. **One payment, one invoice transaction:** For each finance-approved invoiceable collection, record the payment and allocate its invoice number in the **same database transaction**. Lock the invoice series, store the approved issuer and transaction details as an immutable invoice snapshot, and commit both together. If invoice creation fails, roll back the payment entry and show staff a clear error. Repeated clicks or request retries return the same payment and invoice, never a second charge or invoice.
4. **Document and access:** Generate the student PDF from the approved invoice snapshot, show the same invoice through the printing/fines card and My Invoices, and restrict download to its owner or authorized staff. Do not create a new customer-facing OR/PR PDF for a new invoiceable payment.
5. **Corrections:** Reversing a payment must update or void its linked invoice according to the approved process. Keep the original serial and audit trail; never delete, reuse, or silently overwrite an issued number. Define when a corrected invoice needs a new number before enabling that action.
6. **Finance exceptions:** If the finance team says a particular collection is not invoiceable, settle its approved customer document and wording **before** enabling that collection in the new flow. The app must not label an unapproved document as an invoice merely to satisfy the screen design.

## Implementation tracking

- [x] Identify the two student cards and the separate manual Admin invoice flow.
- [x] Preserve already issued OR/PR history as historical data in the plan.
- [ ] Obtain the school's approved invoice sample, issuer details, serial range, authorization details, and classification for printing, ordinary fines, and lost-book collections.
- [ ] Review and, if needed, extend the prepared Supabase invoice migration without changing already issued history.
- [ ] Connect eligible payment recording to automatic invoice issuance in one transaction, including retry and rollback behavior.
- [ ] Replace the student and admin payment-document views and notification wording with direct invoice actions.
- [ ] Verify the approved PDF layout, access control, serial uniqueness, partial payments, reversals, historical records, and both student/admin flows against a separate Supabase test environment.
- [ ] Run the API/web suites and builds; later release the database and app changes together only when deployment is authorized.

## Done when

- A new qualifying printing or fine payment produces exactly one approved, numbered invoice immediately; the student can view and download it from the relevant page.
- The screen and PDF identify the document consistently as an invoice, with the approved issuer and transaction details.
- No new qualifying transaction exposes an OR/PR payment PDF as its customer document, and no old OR/PR record is falsely represented as an invoice.
- A failed issuance leaves no recorded payment; a retry cannot create two payments or two invoice numbers.
- Voids and corrections retain the original document and actor/reason/time history.
- The behavior is verified using Supabase Postgres and, after separate authorization, on the deployed site.

## Change log

- **2026-09-27:** Created a dedicated plan for replacing the OR/PR payment-document views shown on Student Fines and Student Printing with direct, automatic invoice delivery. No implementation or deployment was performed.
