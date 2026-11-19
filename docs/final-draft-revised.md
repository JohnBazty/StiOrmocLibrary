# SmartLib: A Web and Mobile-Based Smart Library System with Online Printing Service Requests for STI College Ormoc

**Revised Final Draft (system chapters), 2026-11-11**

This revision updates the chapters of the Final Draft (`docs/source/Final-Draft.pdf`, May 21, 2026) that describe the system. They now match what SmartLib already does on `main` and the decisions recorded in STI ILMS REA `docs/spec-decisions.md` (2026-11-10). A feature that is not built yet keeps the draft's original wording. The change notes at the end list every change and its source.

Unchanged and not repeated here: the title page, endorsement form, approval sheet, table of contents, Project Context, Review of Related Literature, Calendar of Activities, the figures (Figures 1 to 29), References and Appendices A to D. Use the original PDF for those parts.

---

## INTRODUCTION

### Project Context

Unchanged from the Final Draft.

### Purpose and Description

The primary purpose of the SmartLib system is to modernize and centralize institutional library services into a single web platform that works on library computers, laptops and students' phones. The system streamlines administrative workflows for both librarians and students, replacing labor-intensive manual methods. Its main objective is to speed up book search, borrowing and return transactions, while introducing self-service features that reduce desk work. By automating routine administrative tasks, the platform lowers the staff's manual burden and lets the library operate as an efficient study and research environment.

What makes this project unique is how it tackles the real problems students face every day. Beyond tracking books, the system adds an online printing request service: students upload their files from their own devices, see the page count and cost before submitting, and follow the job until it is ready for pickup, instead of handing over files by USB, Gmail or Messenger. The project also respects the physical space of the library. Each student has a personal, signed attendance QR pass that staff scan at the entrance, which replaces the paper logbook and records the purpose of every visit. This combination of traditional library tools and modern digital services makes the system a "smart" solution built for the actual needs of the campus.

The project is designed to be helpful for the modern learner. A personal dashboard shows what a student has borrowed and when it is due, their reservations, notifications, library announcements and how full the library is right now, helping them stay organized and avoid penalties. A recommendation panel suggests books from the catalog, and every book page can produce a ready-to-copy APA citation. By making the library's collection visible through a digital catalog with shelf locations and a floor-plan image, the system helps the school's resources get used to their full potential.

### Objectives

#### General Objective

To design, develop and implement SmartLib, a system that automates traditional library operations, including circulation, inventory tracking, fines and clearance, attendance and printing services, to improve the academic experience at STI College Ormoc.

#### Specific Objectives

- To develop a Digital Cataloging interface that lets users search books and research papers by title, author or ISBN, without regard to letter case, and see the real-time availability of each physical copy, its shelf label and the library floor-plan image.
- To create an Automated Circulation module that uses barcode scanning for physical copies and one versioned borrowing policy for all loan rules. Before a loan is saved, it checks the borrower and the copy, separating blocking problems from warnings that an Admin may confirm with a recorded reason.
- To build an Inventory Management system that lets librarians track each copy's condition and availability, run barcode-based inventory audits, archive titles and copies without losing their history, add books in bulk, and export inventory reports as CSV and PDF.
- To implement a contactless QR-based attendance monitoring feature that records entry and exit with a signed personal QR pass, requires visitors to state their purpose of visit, shows current occupancy against the library's capacity, and identifies peak usage times.
- To integrate an Online Printing Service Request system that lets students upload files in restricted formats (PDF and DOCX), counts the pages on the server and computes the cost before submission, shows whether the printing service is available, and keeps the student informed until the job is ready for pickup.
- To deploy an interactive tablet-based Library Kiosk within the premises to facilitate rapid local catalog search, shelf location discovery, and automated academic citation generation.
- To provide an Admin Analytics Dashboard for library staff to view insights on the most borrowed resources and student usage trends, with a downloadable summary report.
- To develop a Fines, Violations and Accounts Clearance module that computes overdue penalties from configurable rates, operating days and closed dates, applies a configurable maximum penalty, records non-circulation infractions (e.g., noise, food), handles lost-book reports and charges, records cash payments at the front desk with a verifiable digital receipt, supports manual GCash payment verification, and computes each user's clearance standing live from unreturned books, unpaid fines and lost-book charges.
- To build a Printing Service Management and Consumables Tracking subsystem for library staff to manage the print queue, record payments, monitor revenue and expenses, and track ink bottles and paper reams with restock and usage history.

### Scope and Limitations

#### Scope

The project focuses on the development of a responsive web system with two workspaces: an administrative workspace for the Librarian, and a student and faculty workspace that works on PCs and phones through the browser. A tablet-based local kiosk for catalog search and shelf tracking within the library premises is also part of the proposal. The primary users are the students and faculty members of STI College Ormoc, who use the digital catalog, borrowing, reservations, attendance and printing services, and the library staff, who manage the collection, attendance, circulation, fines and printing. This research and development project is conducted during the second semester of the 2025–2026 academic year.

- **Digital Cataloging:** A searchable catalog of books and research papers with real-time copy availability, shelf labels, a library floor-plan image and APA citations.
- **Automated Circulation:** Barcode-based desk checkout and return under one versioned borrowing policy, with pre-checkout checks, online borrow requests fulfilled at the desk, and title-level reservations with a waiting list.
- **Inventory Management:** Tracking of copy condition and availability, barcode inventory audits, research and thesis inventory, a book archive, bulk book entry, and barcode and QR labels for copies.
- **QR-Based Attendance Monitoring:** Contactless entry and exit logging with a signed personal QR pass, a purpose of visit (Library Visit, Study, Research or Printing), live occupancy against capacity, and attendance analytics by academic term.
- **Online Printing Service Request:** A module that lets students upload files in restricted formats (PDF and DOCX), see the server-computed page count and cost, check printing service availability, and track the request until pickup.
- **Interactive Library Kiosk:** A local tablet interface for self-service book queries, physical shelf location tracking, and APA/MLA academic citation generation.
- **Fines and Clearance:** Overdue and infraction fines, lost-book charges, cash payments with digital receipts, fine adjustments with a recorded reason, and live clearance standing with Admin overrides.
- **Admin Analytics:** A dashboard of key figures, peak usage hours and popular library resources.
- **Reports Generation:** Exportable reports (CSV and PDF) on inventory, research and thesis holdings, attendance, printing revenue and supply expenses, fines, clearance and the dashboard summary.

#### Limitations

- The system is designed for the library of STI College Ormoc and may not be fully compatible with the setup of other STI campuses without modification.
- The system requires a continuous internet connection. It is a web application: students and faculty use it through a phone or computer browser, and no separate native mobile app or offline mode is provided.
- The Online Printing Service Request and Fines modules exclude automated merchant payment gateway APIs, relying instead on library front-desk cash collections and manual GCash receipt verification, and do not handle physical hardware maintenance.
- Payment records and PDFs issued by the system are internal receipts. They are not BIR-registered invoices.
- The system operates independently and does not live-sync with other campus databases (e.g., accounting or registrar). Users sign in with SmartLib accounts; school single sign-on is not part of this release.
- Scheduled background tasks (such as automatic reservation expiry and automatic checkout before closing) depend on a scheduled job service that is still being set up for the cloud deployment.
- Built-in hardware integrations such as RFID, receipt printers and card printers are outside the scope.

### Review of Related Literature/Studies/Systems

Unchanged from the Final Draft.

---

## METHODOLOGY

### Technical Background

#### Technologies Used

The SmartLib system uses a modern web stack chosen for performance and accessibility from any device. The frontend is a single React application written in TypeScript, built with Vite and styled with Tailwind CSS. It provides the administrative workspace and the student and faculty workspace, and its responsive layout works on library PCs, laptops and phones, so no separate native mobile application is needed. The interface uses only STI's official colors (blue, yellow and white) and never relies on color alone to show meaning.

The backend is a Node.js and Express API written in TypeScript and organized as a modular monolith: each library capability (catalog, circulation, reservations, fines, clearance, attendance, printing, inventory, users, notifications, dashboard, reports and floor plan) is its own module inside one service. Data is stored in Supabase PostgreSQL. Every query is parameterized, multi-record changes run inside database transactions, and each schema change is a versioned migration. Uploaded files, such as print documents, supplier quotations and the floor-plan image, are kept in Supabase Storage; the database stores only their metadata. All dates and times are stored in UTC, while due dates, operating days and reports follow Philippine time (Asia/Manila).

Security is enforced on the server. Passwords are hashed, sign-in issues signed tokens, and every protected route checks the user's role and account status. Role-Based Access Control has two staff levels: the Admin, who is the Librarian, with full control of policies, settings, fines, archives and users; and Library Staff (student assistants) with a fixed, restricted set of operational rights. Students and Faculty are the library's users. The server is the only authority for roles, due dates, fines, availability, clearance and print costs; it never trusts values sent by the browser. Attendance QR passes are signed by the server and can be reissued or revoked, so a copied or forged code is rejected.

Barcode scanning is used for cataloged copies, and QR codes identify students at the attendance desk. The web application and API are hosted on Vercel and the database on Supabase, both cloud services. Dashboards use charts to turn raw records into visual summaries of inventory, attendance purposes and printing statistics, and most screens can export their data as CSV or PDF.

#### Calendar of Activities

Unchanged from the Final Draft.

#### Resources

To develop, test and run the SmartLib system, the following hardware and software resources are required.

**Hardware Resources**

- **Development Computers:** Laptops or desktop computers (minimum Core i5 processor and 8 GB RAM) capable of running code editors and local servers.
- **Mobile Devices:** Smartphones used to test the responsive web application in a phone browser.
- **Barcode and QR Scanners:** Dedicated USB barcode scanners or high-resolution webcams used to test book tracking and attendance scanning.
- **Network Equipment:** Reliable internet routers and connections to reach the cloud services.

**Software Resources**

- **Development Environment:** Visual Studio Code as the main code editor, with the Node.js runtime for the backend.
- **Database Management:** Supabase PostgreSQL for structured data, with versioned SQL migrations, and Supabase Storage for uploaded files.
- **Design and Prototyping Tools:** Figma or Canva for user interface mockups and user experience flows.
- **Version Control:** Git and GitHub for source code management, code review and version history.
- **Testing:** Node's built-in test runner and Supertest for the API, and Vitest with Testing Library for the web application.
- **Deployment Platforms:** Vercel for hosting the web application and API, and Supabase for the database and file storage.
- **Documentation Tools:** Microsoft Office Suite or Google Workspace for drafting the capstone manuscript, technical manuals and project reports.
- **Web Browsers:** Modern browsers such as Google Chrome for testing and debugging.

### Requirements Analysis

The Requirements Analysis for the SmartLib system identifies the computing solutions needed for the institution by examining the stakeholders, activities and limitations of the current setup.

The stakeholders are the Librarian (the system's Admin, with full policy control), Library Staff (student assistants with restricted operational roles), and registered Students and Faculty. The business activities the system automates are book cataloging with shelf labels and a floor-plan image, barcode-based circulation under a versioned borrowing policy, contactless QR-based attendance monitoring with the visitor's purpose of visit, printing request management with format restrictions, server-side page counting and service availability, fines and lost-book charges with desk payments, and live clearance. These functions operate within the STI College Ormoc Library, and are also reachable through phone and computer browsers for remote inquiries and self-service.

Library operations happen during the library's operating hours, which the librarian configures for each day of the week (Monday to Saturday by default). The system shows due dates and availability in real time based on these hours. Sundays, holidays and other closed dates that the librarian records are excluded from overdue penalty calculations; if a due date falls on a closed day, it moves to the next operating day. Procedures are currently performed by hand, through logbooks, card catalogs and physical stamps. By replacing these with barcode scanning, signed QR passes, digital inventory audits and in-app notifications, the system modernizes operations. To manage student accounts across semesters, each account can be set to Active, Deactivated or Archived with a recorded reason; archived accounts cannot sign in, while their borrowing, payment, printing and attendance history stays available for reports.

### Requirements Documentation

#### Functional Requirements

The system has two main workspaces, each with features that streamline library operations.

##### User Side Features (Students and Faculty)

- **User Authentication:** Self-registration with the student's school ID and secure sign-in. Passwords are hashed, sessions are protected, and deactivated or archived accounts cannot sign in.
- **User Dashboard:** A personal page that shows current loans and their due times, pending borrow requests, active reservations, unread notifications, printing status, the latest library announcement, the library's current occupancy and recommended books. The student's attendance QR pass is shown in the app for scanning at the entrance.
- **Advanced Search and Browse:** A catalog that searches books and research papers by title, author or ISBN, without regard to letter case, with filters for category, author, publication year and availability. Selecting a book shows each physical copy's availability and shelf label, a link to the library floor-plan image, and an APA citation that the student can copy at once.
- **Borrowing and Returning:** Students and Faculty add books to a borrow cart and submit a request; the librarian fulfills it at the desk by scanning the copy's barcode, or checks out a walk-in borrower directly. Every loan follows the active borrowing policy, and the policy version is saved with the loan. A loan is due at 8:59 AM on the next operating day; a policy setting may instead set the due time to the checkout time on the next operating day, never later than closing time. Overdue status and fines start when a configurable grace period after the due time ends (default 0 minutes). Students may request a single renewal before the due time if the book has no active reservations and they have no outstanding fine blocks; the new due date follows the same due-time rule, counted from the time of renewal. Returns are recorded by scanning, and the system computes any late penalty.
- **Borrowing Constraints and Cart Limits:** The borrowing policy sets limits per role. Students may hold at most two (2) borrowed books and two (2) active reservations at the same time; Faculty limits are configurable and are uncapped by default. The policy also sets which material types may be borrowed.
- **Penalty Computation Rules:** Overdue penalties follow the fine policy: PHP 2.00 per hour after the due time until the end of the due day, then PHP 10.00 per day starting the following day, up to a configurable maximum penalty. Closed days and holidays are not counted. Fine rates and the cap are kept as versioned policy records, and each computed fine keeps the inputs used to calculate it.
- **Reservation System:** Users reserve a title that has no copy available and join its waiting list. A reservation moves through Pending, Approved, Ready for pickup and Claimed, and can be Cancelled or Expire. A pickup is confirmed only by staff at the desk.
- **Printing Service Request:** Users upload a PDF or DOCX file (other formats are rejected) and choose copies and options. The server counts the pages, computes sheets and cost, and shows the quote before the request is submitted; it blocks the request if the page count cannot be verified. The user sees whether the printing service is available, follows the request through Pending, Printing and Ready for pickup to Picked up, and can cancel before printing is complete. The user is notified when staff start printing the job.
- **Fine Settlement Options:** A module where students can choose to pay their library fines either by scanning the library's GCash QR code (submitting the 13-digit reference number and receipt screenshot for semi-automated verification) or by paying in cash directly at the library front desk. Each recorded payment produces a digital receipt with a verification code that the student can view and download.
- **QR Attendance Monitoring:** Each student has a personal attendance QR pass, signed by the server and replaceable if it is lost or shared. Staff scan it at the entrance to check the visitor in, record the purpose of visit (Library Visit, Study, Research or Printing), and scan again to check out. A check-in is kept even if no check-out is recorded. Students see their visit history.
- **Tablet Kiosk Interface:** A dedicated local tablet web interface allowing students to perform rapid advanced catalog searches, view book information, identify shelf locations, and copy APA citations instantly within the library.
- **Notification System:** In-app notifications for due dates, overdue penalties, reservation updates, printing updates and library announcements. Users can mark them as read or remove them.
- **Digital Clearance Status:** A page where users see their current library clearance standing ("Cleared" or "Not Cleared"), computed live. If a user is not cleared, the page lists the specific unreturned books, unpaid fines or lost-book charges causing it. A Refresh action recomputes the standing right after a return or payment. Users can also report a borrowed book as lost from their loans and follow the report's status.

##### Librarian and Admin Side Features

- **Dashboard and Analytics:** An administrative dashboard with key figures, including Total Books, Available Books, Overdue Books, Active Users, Daily Attendance (by purpose of visit) and Active Reservations, plus charts of circulation, attendance, category demand and current occupancy. The dashboard summary can be downloaded as a PDF.
- **Book and Research Management:** Create, view, update and archive books and thesis materials, including barcode assignment, category and shelf assignment, bulk book entry, ISBN lookup to fill in book details, and printable barcode and QR labels for copies.
- **Category Management Sub-Table:** The category interface must feature an explicit data grid displaying Category ID, Category Name, Description, Number of Books currently tied to that category, and Date Added, alongside direct triggers for Edit Category and Delete Category actions. Books in a category can be reassigned to another category.
- **Research and Thesis Inventory Analytics:** The research repository module must feature a dedicated data-visualization component capable of rendering a Department Analysis (aggregating and grouping submitted manuscripts by their respective academic programs) and Year Trends (tracking and graphing the volume of institutional research submissions across consecutive graduation years). The research inventory summary and its CSV and PDF reports are available now.
- **Book Archive:** Archiving is the normal way to remove a title or copy from active use, with a reason and confirmation. Archiving is blocked while a loan or reservation is active. A Book archive page lists archived titles and copies with their archive date, reason and the staff member who archived them, and keeps their borrowing history viewable.
- **Floor Plan:** The Admin uploads or replaces the library floor-plan image (PNG, JPEG or WebP). All users can view the current image from a book, cart, loan or reservation, together with the copy's shelf label.
- **Transaction Monitoring:** A circulation desk to fulfill borrow requests, check out walk-in borrowers by barcode, record returns, monitor due and overdue loans, and view loan history. Before checkout, a pre-check classifies problems as blocking (the loan cannot be saved) or as warnings, such as a damaged copy, that the Admin may confirm with a recorded reason. The final checkout checks again so two staff members cannot lend the same copy at once.
- **Borrowing Policy Settings:** One page to publish the borrowing policy: loan period and due-time mode, limits per role, renewal rules, material types that may be borrowed, and the effective date. A published version is never edited; each change creates a new version, and every loan keeps the version it was made under.
- **Fines Management Hub:** A workspace showing paid and unpaid fines with the related book and user. Staff can issue non-circulation infraction fines (e.g., noise, eating), record a cash payment at the front desk, and waive or void part or all of a fine with a recorded reason (a partial write-off is at least PHP 1.00). A payment can never be more than the balance owed; staff give change for cash. Every payment produces a digital receipt that can be reprinted or reversed with an audit trail, and fines can be exported as a PDF report. For online transactions, it features a GCash Verification Queue to inspect uploaded receipts and reference numbers.
- **Lost Books:** A clearance worklist shows pending lost-book reports from users with the borrower and book. Staff open each report and confirm or reject it; a confirmed loss creates one lost-book charge, which blocks clearance until it is paid, and a rejected report creates none. Repeated clicks cannot create a second charge.
- **Inventory Management:** Barcode-based inventory audits, tracking of each copy's condition (including missing and damaged copies) and availability, an inventory summary, and CSV and PDF inventory reports.
- **Printing Service Management:** Tools to manage the print queue, switch the printing service between available and unavailable, update job statuses, record cash payments for print jobs with digital receipts, and view revenue reports.
- **Printing Supplies Asset Management:** An inventory of printing consumables. It tracks ink bottles by type and color and paper reams by size (e.g., Short, A4, Long), records each restock, opened ream and used bottle as a stock movement, flags low stock, and produces stock usage, expense and revenue reports as PDFs for budgeting.
- **Attendance Monitoring:** Real-time attendance logs, the current number of visitors against the configured library capacity, attendance analytics by academic term and purpose of visit, and a downloadable PDF attendance report.
- **User Management:** A user directory with profile editing and Activate, Deactivate and Archive actions. Each change records who made it, why and when. Inactive and archived users cannot sign in or start new library activity, while their past loans, payments, print jobs and attendance stay available to staff.
- **Role-Based Access Control (RBAC):** Separates the Admin (the Librarian, with full settings, fine changes, archiving and user control) from Library Staff (student assistants with restricted access for borrowing scans, print queues and payment checks, and no deletion or policy settings rights). Permissions are fixed per role.
- **Bulk Data Import:** An administrative tool allowing the librarian to upload files to bulk-register students or import large inventories of books into the database.
- **Automated Clearance Management:** A clearance dashboard that computes each user's standing live as "Cleared" or "Not Cleared" from unreturned books, unpaid fines and lost-book charges. Librarians can search users, see each user's blocking items, override the standing with a recorded reason (and revoke the override later), and export clearance reports as CSV for campus submission.

### Design of Software, System, Product, and/or Processes

Unchanged from the Final Draft (Figures 1 to 29). Some figures show the React Native mobile app and the dynamic offline QR code. Update them when those parts are redrawn for the web app.

---

## Change notes (for the team; remove before submission)

Status key: **Built** = on StiOrmocLibrary `main` (2026-11-11). **Decided** = an approved answer in STI ILMS REA `docs/spec-decisions.md` (2026-11-10) that refines a built feature but is not built yet. **Draft** = not built yet, so the original wording was kept.

| Section | Change | Source | Status |
|---|---|---|---|
| Purpose, Scope, Technical Background | React Native app replaced by a responsive web app on phones; no offline mode | Built web app (`apps/web`); spec-decisions scope table: self-checkout "Mobile app: Drop", offline "Mobile app offline: Drop" | Built |
| Technical Background, Resources | MySQL, MySQL Workbench and Render replaced by Supabase Postgres, Supabase Storage and Vercel; testing tools added | MySQL retired 2026-11-10 (`docs/mysql-removal-plan.md`); `vercel.json` | Built |
| Technical Background | Dates stored in UTC, calendar logic in Asia/Manila | spec-decisions borrowing-policy Q4; `fines/fine-calculator.ts` | Built |
| Objectives, Attendance | Dynamic time-synchronized (TOTP) offline QR replaced by a server-signed personal QR pass that can be reissued or revoked; purposes are Library Visit, Study, Research, Printing; capacity and term analytics added | `attendance/attendance-credential.service.ts`, `attendance` routes | Built. Dynamic QR is on `feat/dynamic-attendance-qr` (PRs #9, #10 under review); update this text again if it merges |
| Attendance | Static QR on school ID cards removed from the text | Not found in the code | Draft feature not built; add it back if planned |
| Catalog | Shelf "coordinates" replaced by a shelf label plus an uploaded floor-plan image; case-insensitive search; ISBN lookup; barcode and QR labels | Phase 3 F1 (`docs/system-fixes-and-features-plan.md`); PR #11; `catalog` routes | Built |
| Borrowing | Cart request fulfilled at the desk; versioned borrowing policy; per-role limits; material types; pre-checkout checks with reasoned override; double-lending guard | `docs/configurable-borrowing-policies-plan.md`, `docs/circulation-preflight-check-plan.md` | Built |
| Borrowing | Due-time mode (fixed 08:59 or checkout time, capped at closing) | spec-decisions checkout Q1 | Decided; `016` has no due-time mode column yet |
| Borrowing | Separate Student limits: 2 borrowed books and 2 reservations; Faculty configurable | `016` columns `student_max_active_books`, `student_max_active_reservations` | Built |
| Borrowing | Grace period, default 0 minutes | spec-decisions borrowing-policy Q5 | Decided |
| Borrowing | Renewal due date counted from the time of renewal | spec-decisions borrowing-policy Q6 | Decided; renewals are on `feat/renewal-management-v2`, not merged |
| Penalty rules | Hourly until the end of the due day, then daily; versioned fine policy with cap; closed dates excluded | `fines/fine-calculator.ts` (default cap PHP 500); spec-decisions borrowing-policy Q1-Q2 | Built. The cap amount is a [Librarian] value to confirm |
| Reservations | Status names and desk-verified pickup | `reservations` routes; Phase 1 B1 | Built. Notifications on every status change (Phase 2 A7) and automatic expiry are not built yet |
| Printing | Server-side page count for PDF and DOCX, quote before submit, service availability toggle, Start Printing notification, cash payments with receipts | Phase 3 P1, P2; `printing` routes | Built. "Real-time printer status" and "schedule pickup time" from the draft were not confirmed in the code, so they were removed |
| Printing supplies | Ink bottles and paper reams with movements, restocks, usage, expense and revenue PDFs | `printing` supplies routes | Built |
| Fines | Cash payments with verifiable receipts, reversals, infractions, adjustments | `fines` routes, `fines/fine-receipt-verification.ts` | Built |
| Fines | Payment never exceeds the balance; partial write-off at least PHP 1.00 with a reason | spec-decisions payments Q1-Q2; Phase 1 B3 | Overpayment block built; confirm the PHP 1.00 minimum in the code |
| Fines | GCash verification queue | Not in the code | Draft wording kept (product rule: cash or manually verified GCash) |
| Lost books | User report, staff confirm or reject, one charge per confirmed loss | Phase 1 B6; `clearance` lost-book routes | Built. Not written in yet: Admin "Report Lost" from a row (A5), quotation-based charge (A6, A8) and spec-decisions lost-items Q1 (one processing fee) and Q2 (refund when the book comes back) |
| Catalog, Dashboard | Category table fields (A2), one row per copy (A4), research analytics by program and year | Phase 2 not started; no department grouping found in `inventory` | Draft wording kept |
| Dashboard | KPI list cut to the figures found in `dashboard` (Total, Available, Overdue, Active Users, Daily Attendance, Active Reservations) | `dashboard` module | Built. Add Most Borrowed, Returned, Total Penalties and Recent Activities back if the dashboard shows them under other names |
| Clearance | Computed live; "Pending" renamed "Not Cleared"; overrides with reason and revoke; CSV export; Refresh | `clearance` routes; spec-decisions conflict "Clearance vs restrictions", discharge Q1 (no bulk clearance) | Built |
| Users | Active, Deactivated, Archived with recorded reason | Phase 2 A1 | Built. The end-of-semester batch archive (Phase 4 T2) is not built |
| RBAC | Admin = Librarian; Library Staff with fixed permissions per role | `docs/admin-librarian-role-consolidation-plan.md`; spec-decisions "Porting to StiOrmocLibrary" | Admin built; the Library Staff role is decided, not built |
| Book archive, floor plan, announcements | New features listed | Phase 3 A9, F1, P3 | Built |
| Bulk import | Bulk book entry is built; bulk student registration is not | `catalog` `/add-bulk`, `/bulk-entry` | Draft wording kept for students |
| Kiosk | Draft wording kept | `feat/self-service-kiosk` not merged | Draft |
| Requirements Analysis | Fixed 7:00 AM to 5:00 PM replaced by configurable hours | Library hours table; Phase 4 T4 asks for 7:00 PM closing | Built (configurable). Confirm the hours with the Librarian |
| Limitations | Receipts are not BIR invoices; scheduled jobs not yet running on Vercel; no SSO; no hardware integrations | Phase 2 A10, T1; spec-decisions identity-providers "Dropped" | Built state |
