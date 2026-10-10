# Microsoft Entra Student and Faculty Authentication Plan

- **Date created:** 2026-10-09
- **Date last updated:** 2026-10-09
- **Status:** `planned`

## Why

STI College Ormoc Students and Faculty already use organizational Microsoft accounts. SmartLib should let them use that existing identity instead of requiring a second library password. Microsoft must verify the person's credentials, while SmartLib remains responsible for the person's School ID, campus access, role, account status, and library history.

This integration must not connect to the registrar, accounting, or any other school database. It must not request mailbox, file, contact, class, or directory-reading access.

## Objective

Add **Sign in with Microsoft** to the Student/Faculty portal using Microsoft Entra ID OpenID Connect. A successful Microsoft sign-in will be linked to one local SmartLib account, after which the API will issue the same short-lived SmartLib JWT used by the current application.

The work is complete when:

- only accounts authenticated by the approved STI Microsoft tenant can enter the Microsoft flow;
- Microsoft passwords are never received by SmartLib, and Microsoft access or refresh tokens are never persisted, exposed, or used to call Microsoft services;
- a Microsoft identity can be linked to only one SmartLib account, and one SmartLib account can have only one Microsoft identity;
- SmartLib, not Microsoft profile text or the browser, remains authoritative for School ID, role, account status, and permissions;
- existing Active Student and Faculty accounts can link without losing history;
- Deactivated or Archived SmartLib accounts remain blocked even when Microsoft authentication succeeds;
- new Student requests require local verification before becoming Active;
- Faculty and Admin accounts cannot be created through public onboarding;
- the existing password login remains available during rollout and rollback;
- the complete flow is verified locally, in a stable staging deployment, and in production with controlled test accounts.

## Authority and constraints

- The Final Draft requires secure registration and login with account verification, local account lifecycle management, and preserved historical records.
- The product explicitly excludes live synchronization with registrar, accounting, and other campus databases.
- The API remains the Node.js and Express modular monolith.
- Supabase Postgres remains the active application database. MySQL remains the rollback reference.
- Supabase Auth remains out of scope. The application will preserve its existing JWT, session, role guard, and account-status model.
- `Admin` remains the Librarian/Super Admin authorization value. The Admin login stays local in the first release so the library retains a recovery path if Microsoft is unavailable.
- Anonymous onboarding may request a Student account only. Faculty remains staff-provisioned.
- Existing user data and password hashes must not be rewritten or discarded.

## Recommended approach

Use a single-tenant Microsoft Entra application and the OAuth 2.0 authorization-code flow through the Express API. Add `@azure/msal-node` as the only new authentication dependency so token creation, code redemption, signature validation, issuer validation, audience validation, nonce handling, and Microsoft error handling are delegated to Microsoft's supported server library.

Request only these OpenID Connect scopes:

- `openid`
- `profile`
- `email`

Do not request Microsoft Graph permissions, `offline_access`, application permissions, group-directory reads, mailbox access, or file access. The API needs proof of identity, not access to Microsoft 365 data.

Use the signed `tid` tenant claim and `oid` object claim as the permanent Microsoft identity key. Treat `name`, `email`, and `preferred_username` as display hints only because they can change. Do not authorize by email suffix alone.

Microsoft authentication proves control of an account in the approved tenant. It does not prove a School ID, current enrollment, role, or Ormoc-campus membership. SmartLib must therefore require an existing account link or an approved local onboarding request.

## Why alternatives are not selected

- **Email-domain-only registration:** A matching suffix does not prove current enrollment, campus, or role, and email-style claims can change.
- **Automatic Active account creation after Microsoft login:** A Microsoft account does not supply a trustworthy SmartLib School ID. Allowing a user to enter any School ID and immediately activate it creates an account-claiming risk.
- **Microsoft Graph or school directory lookup:** It adds permissions, consent, privacy exposure, and operational dependency that are unnecessary for login.
- **Registrar database integration:** It conflicts with the product's explicit no-live-sync limitation and is not required for federated authentication.
- **Replacing local authorization with Microsoft groups or profile fields:** It would make library permissions depend on directory administration and could bypass SmartLib's Active, Deactivated, and Archived lifecycle.
- **Supabase Auth migration:** It would replace the current authentication boundary and conflict with the existing v1 architecture decision. Direct Entra integration can reuse the established account, JWT, session, and role checks.
- **Removing password login immediately:** It would create a lockout risk during tenant approval, account linking, secret rotation, or Microsoft outages.

## User flows

### 1. Returning linked Student or Faculty

```text
Login page
  -> Sign in with Microsoft
  -> Microsoft verifies the organizational account and MFA policy
  -> API validates tenant, token, state, nonce, and authorization code
  -> API finds the local Microsoft-to-SmartLib link
  -> API checks local role and account status
  -> API issues the existing SmartLib JWT
  -> Student or Faculty dashboard
```

The Microsoft ID token is used only during the callback. Any Microsoft access-token material returned during code redemption is discarded after identity validation and is never persisted or used because SmartLib is not calling Microsoft Graph. The flow does not request `offline_access` and must not retain refresh tokens.

### 2. Existing SmartLib user linking for the first time

1. The user completes Microsoft sign-in.
2. The API finds no existing Microsoft identity link and returns a one-time `link_required` result through the server session.
3. The page asks for the user's existing SmartLib School ID and library password.
4. The API verifies the existing credentials, confirms the account is Active and is Student or Faculty, and locks the account and Microsoft identity rows.
5. If neither side is already linked, the API creates the link and records the event.
6. The API invalidates older sessions through the existing authentication-version mechanism and issues the normal SmartLib JWT.

This one-time proof prevents one STI Microsoft user from claiming another person's School ID.

### 3. New Student without a SmartLib account

1. The user completes Microsoft sign-in.
2. The user submits School ID, name, contact number, program or strand, and year or grade level.
3. The API creates a pending Microsoft onboarding request, not an Active account.
4. The Librarian verifies the School ID and identity using the approved campus procedure, such as presentation of the school ID or an authorized roster.
5. Approval transactionally creates and links `accounts`, `users`, `student_profiles`, and the Microsoft identity record.
6. Rejection keeps the request and decision reason for accountability. The user cannot sign in to SmartLib until approved.

Public onboarding always requests Student access. It never accepts a role from the browser.

### 4. Faculty

Faculty remains staff-provisioned. The Librarian creates or imports the Faculty SmartLib account before linking. A public Microsoft onboarding request cannot create Faculty access.

### 5. Admin

The Admin portal continues using its local School ID and password in the first release. Microsoft Admin sign-in can be evaluated separately after Student and Faculty rollout, but the local Admin recovery account must remain available.

## Microsoft Entra setup

STI's Microsoft 365 administrator must perform or approve the following one-time configuration. No database access is involved.

1. Register **STI Ormoc Smart Library** in the STI Microsoft Entra tenant.
2. Select **Accounts in this organizational directory only**.
3. Register exact web redirect URIs for:
   - local development;
   - one stable staging address;
   - the production SmartLib address.
4. Configure only the OpenID Connect scopes listed above.
5. Provide the application client ID and tenant ID.
6. Create a client secret for the API, store it only in local/Vercel secret management, record its expiry, and assign an owner responsible for rotation.
7. Grant tenant consent if STI's policy prevents ordinary users from consenting to the basic sign-in scopes.
8. Provide dedicated Student and Faculty test accounts and confirm whether the Entra tenant covers only Ormoc or the wider STI organization.

If the tenant covers multiple STI campuses, local SmartLib approval remains mandatory for Ormoc access.

Use a stable staging domain because Microsoft redirect URIs must match exactly; arbitrary Vercel preview URLs should not be registered.

## Configuration changes

Add these server-only variables to `apps/api/.env.example` and deployment secrets:

```dotenv
MICROSOFT_ENTRA_ENABLED=false
MICROSOFT_ENTRA_TENANT_ID=
MICROSOFT_ENTRA_CLIENT_ID=
MICROSOFT_ENTRA_CLIENT_SECRET=
MICROSOFT_ENTRA_REDIRECT_URI=http://localhost:5173/api/v1/auth/microsoft/callback
```

Rules:

- fail startup in production when the feature is enabled and any required value is absent;
- require GUID-shaped tenant and client IDs and an HTTPS redirect URI in production;
- never expose the client secret through Vite variables, API responses, logs, or source control;
- hard-code the minimal scopes in the API rather than making permissions configurable;
- keep the feature disabled by default until the Entra registration and migration are ready.

## Database changes

At implementation time, reserve the next migration numbers from `.cursor/agent-protocol.md`. With the current tracker, these are MySQL rollback migration `044` and Supabase/Postgres migration `014`. Do not reuse them if another migration lands first.

### `account_microsoft_identities`

Create one link row per SmartLib account:

- `account_id` - primary key and foreign key to `accounts`, deletion restricted;
- `tenant_id` - Microsoft Entra tenant GUID;
- `object_id` - immutable Microsoft user object GUID from `oid`;
- `login_name` - nullable display-only `preferred_username` or email hint;
- `display_name` - nullable display-only Microsoft name;
- `linked_at`;
- `last_authenticated_at`;
- `updated_at`.

Add a unique constraint on `(tenant_id, object_id)`. Do not store ID tokens, access tokens, refresh tokens, authorization codes, PKCE verifiers, or Microsoft passwords.

### `microsoft_onboarding_requests`

Store pending new-Student requests separately so `accounts.account_status` retains its existing Active, Deactivated, and Archived meaning:

- request ID;
- tenant ID and object ID;
- display-only login name and Microsoft name;
- requested School ID and Student profile fields;
- status: `Pending`, `Approved`, or `Rejected`;
- request, decision, and update timestamps;
- deciding Admin account and required decision reason;
- approved account ID when applicable.

Allow only one request record per `(tenant_id, object_id)`. A mistaken rejection is corrected by an Admin reopening or approving that same record rather than creating duplicate identity claims. Enforce School ID and identity collision checks again inside the approval transaction.

### Password compatibility

Make `accounts.password_hash` and the linked `users.password_hash` nullable only for Microsoft-only accounts. Existing hashes remain unchanged. Password login must perform the existing dummy-hash comparison when the stored hash is null and return the same generic invalid-credentials response.

Do not insert an invented password or a reusable placeholder hash for Microsoft-only accounts.

### Audit and lifecycle

- Record link, relink, and unlink actions in the existing account-management audit trail after an account exists.
- Store pending approval or rejection actor, time, and reason on the onboarding request.
- Deactivation or archiving does not delete the Microsoft link.
- A later reactivation restores eligibility but still requires a fresh Microsoft sign-in.
- Admin-only unlink or relink requires a reason and increments `auth_version` so existing SmartLib tokens become invalid.

Update both fresh-install baselines, the schema readiness check, `docs/schema-context.md`, and the Supabase migration ledger documentation.

## API design

Add a Microsoft authentication service inside `apps/api/src/modules/auth/`; do not create a separate service or deployment.

### Public authentication endpoints

- `GET /api/v1/auth/microsoft/start`
  - starts the user-portal flow only;
  - creates state, nonce, and PKCE values;
  - stores the temporary values in the database-backed Express session;
  - accepts only allowlisted return destinations;
  - redirects to the tenant-specific Microsoft authorization endpoint.

- `GET /api/v1/auth/microsoft/callback`
  - validates state and nonce;
  - redeems the authorization code once;
  - validates issuer, audience, expiry, tenant ID, and object ID through MSAL;
  - stores only a short-lived completion result in the server session;
  - redirects to the frontend callback page without putting a SmartLib JWT or Microsoft token in the URL.

- `POST /api/v1/auth/microsoft/complete`
  - requires the server session and the existing CSRF protection;
  - consumes the completion result once;
  - returns either the existing login response, `link_required`, or `onboarding_required`;
  - clears temporary Microsoft state after success or terminal failure.

- `POST /api/v1/auth/microsoft/link`
  - requires a completed Microsoft session, CSRF token, School ID, and current SmartLib password;
  - binds an existing active Student or Faculty account transactionally;
  - rejects identity or account collisions with a generic safe message;
  - issues the existing SmartLib JWT after linking.

- `POST /api/v1/auth/microsoft/onboarding-requests`
  - requires a completed Microsoft session and CSRF token;
  - accepts Student profile information but no role or status;
  - creates or returns the caller's one pending request;
  - rate-limits repeated attempts.

### Admin endpoints

Add Admin-only operations under the existing users module:

- list and inspect Microsoft onboarding requests;
- approve a request transactionally;
- reject a request with a reason;
- view whether an account is Microsoft-linked;
- unlink or relink an identity with a reason.

Approval must lock the request, requested School ID, and Microsoft identity before creating the account and all linked profile rows. A repeated approval request must return the original outcome rather than create duplicate accounts.

### Existing JWT behavior

After Microsoft authentication or linking:

- load role and account status from SmartLib tables;
- apply the same Active-account and linked-user checks used by password login;
- increment `auth_version` through the existing session service;
- clear older cookie sessions for the linked operational user;
- issue the same 15-minute SmartLib JWT contract;
- route using the existing Student or Faculty dashboard logic.

The Microsoft ID token is never accepted as authorization for catalog, borrowing, fines, printing, attendance, or Admin APIs.

## Frontend changes

### Student and Faculty login

- Add a primary **Sign in with Microsoft** button to `/login`.
- Keep **Use School ID and library password** as a clearly labeled fallback during rollout.
- Add a callback page that calls the one-time completion endpoint and routes by the returned SmartLib role.
- Show specific, non-sensitive messages for:
  - Microsoft sign-in cancelled;
  - tenant not allowed;
  - SmartLib account deactivated or archived;
  - one-time account linking required;
  - onboarding awaiting Librarian approval;
  - identity already linked to another account;
  - temporary Microsoft service or configuration failure.

### Linking and onboarding

- Existing users see a one-time School ID and current-library-password link form.
- New Students see the existing profile fields after Microsoft authentication.
- The page explains that Microsoft verifies identity but the Librarian verifies the School ID and library eligibility.
- Do not display or allow a role selector.
- Do not persist Microsoft claims or pending credentials in `localStorage` or `sessionStorage`.

### Administration

Extend the current Admin Users area instead of adding a disconnected administration system:

- add a Microsoft onboarding queue;
- show linked/not linked status on the user detail view;
- provide approve, reject, unlink, and relink actions with confirmation and required reasons;
- keep School ID and role read-only during identity linking.

### Admin login

Leave `/staff` and `/admin/login` unchanged for this release.

## Security requirements

- Use the tenant-specific authority, never `common`, `organizations`, or `consumers`.
- Use authorization code flow with PKCE, state, and nonce.
- Store state, nonce, verifier, and completion data only in the existing server-side session store with a short expiry.
- Make the completion result single-use and clear it on success, failure, timeout, or restart of the flow.
- Require HTTPS and Secure cookies in production; retain `HttpOnly` and `SameSite=Lax`.
- Validate redirect and return destinations against an exact allowlist.
- Continue login, link, onboarding, and callback rate limiting.
- Never log authorization codes, client secrets, Microsoft tokens, SmartLib passwords, session IDs, or full token claims.
- Use generic responses for credential and identity-link collisions so attackers cannot enumerate School IDs.
- Do not treat email, display name, `preferred_username`, or client-supplied profile values as authorization data.
- Reject guest or unexpected tenant identities unless STI explicitly approves them and the local account is already linked.
- Keep all existing API role and account-status guards. Frontend routing remains convenience only.
- Add secret-expiry ownership and rotation to the production runbook.

## Implementation phases

### Phase 0 - Institutional prerequisites

- [ ] Confirm the STI Entra tenant ID and whether it covers Ormoc only or all STI campuses.
- [ ] Obtain approval from the STI Microsoft 365 administrator.
- [ ] Register local, stable staging, and production redirect URIs.
- [ ] Obtain dedicated Student and Faculty test accounts.
- [ ] Document the Librarian's School ID verification procedure for new requests.
- [ ] Confirm the production owner and expiry date of the client secret.

Exit condition: the team can complete a basic tenant-restricted sign-in in the stable staging environment without Graph or school-database access.

### Phase 1 - Database and configuration foundation

- [ ] Add reviewed Supabase/Postgres and MySQL rollback migrations using the next available numbers.
- [ ] Add both tables, nullable Microsoft-only password support, constraints, and indexes.
- [ ] Update fresh-install baselines and schema readiness checks.
- [ ] Add validated environment configuration with the feature disabled by default.
- [ ] Add `@azure/msal-node` and pin it through the existing lockfile.
- [ ] Update schema and authentication documentation.

Exit condition: migrations apply cleanly to disposable Postgres and MySQL databases, preserve all existing accounts and hashes, and can be rerun safely through the migration ledger.

### Phase 2 - Microsoft sign-in for pre-linked pilot accounts

- [ ] Implement the Entra adapter, start, callback, and completion endpoints.
- [ ] Implement server-session state, nonce, PKCE, expiry, one-time consumption, and return-path validation.
- [ ] Resolve only pre-linked Active Student/Faculty accounts.
- [ ] Reuse existing JWT issuance and authentication-version behavior.
- [ ] Add the login button and callback page behind the feature flag.
- [ ] Add focused API and web tests.

Exit condition: a pre-linked pilot account reaches the correct dashboard, while wrong-tenant, unlinked, deactivated, archived, replayed, expired, and tampered flows are denied.

### Phase 3 - Existing account self-linking

- [ ] Add the one-time School ID/password linking endpoint and page.
- [ ] Lock both account and Microsoft identity during linking.
- [ ] Record the link event and invalidate prior SmartLib tokens.
- [ ] Add duplicate, collision, wrong-password, wrong-role, and concurrent-link tests.

Exit condition: an existing Student or Faculty can securely link once and then use Microsoft without changing or losing any library record.

### Phase 4 - New Student onboarding and Admin approval

- [ ] Add the Student-only onboarding request form and API.
- [ ] Add the Admin queue to the existing user-management area.
- [ ] Implement transactional approval and reasoned rejection.
- [ ] Create Microsoft-only accounts with null password hashes and correct linked operational/profile rows.
- [ ] Add Admin identity unlink/relink with audit and token invalidation.
- [ ] Add idempotency and concurrency tests for approval.

Exit condition: a new Student cannot access SmartLib until a Librarian approves the request, and repeated or competing actions cannot create duplicate accounts or identity links.

### Phase 5 - Controlled deployment

- [ ] Apply the reviewed Supabase migration before enabling the feature.
- [ ] Configure secrets and exact callbacks in stable staging.
- [ ] Complete the live verification matrix with dedicated test accounts.
- [ ] Deploy production with the feature flag off, run health and password-login smoke tests, then enable Microsoft sign-in.
- [ ] Pilot with a small set of pre-linked accounts.
- [ ] Expand to existing-user linking, then new-Student onboarding.
- [ ] Keep password login available until adoption and support readiness are reviewed.
- [ ] Record results and update this plan to `built` only after production acceptance.

Exit condition: production sign-in, linking, onboarding, account blocking, logout, and fallback login pass without exposing tokens or changing historical library data.

## Verification plan

### Automated API tests

- configuration disabled, incomplete, and production-invalid cases;
- start route creates state, nonce, PKCE, exact tenant authority, and safe redirect;
- callback rejects missing, mismatched, expired, reused, or tampered state and nonce;
- callback rejects wrong tenant, audience, issuer, missing object ID, and guest identity when not approved;
- no token, authorization code, or secret appears in redirects or error responses;
- completion can be consumed only once;
- linked Active Student and Faculty receive the existing JWT shape and correct dashboard;
- Admin cannot enter through the public Microsoft user flow;
- Deactivated and Archived accounts are denied;
- local role wins over Microsoft display/profile data;
- null password hashes fail password login safely without user enumeration;
- identity/account collision, concurrent linking, and concurrent approval are safe;
- approval creates all account/profile/identity rows in one transaction and rolls back completely on failure;
- unlink/relink increments `auth_version` and invalidates old JWTs.

### Automated web tests

- Microsoft button visibility follows the feature flag;
- callback loading, success, cancellation, failure, link-required, and approval-pending states;
- local password fallback still works;
- no role selector appears in onboarding;
- Student and Faculty route to their correct dashboards;
- Admin management controls remain Admin-only.

### Local and staging verification

- run `npm test`;
- run `npm run typecheck`;
- run `npm run build`;
- inspect the login, callback, linking, onboarding, and Admin approval screens at mobile and desktop sizes;
- use a dedicated STI Student test account, Faculty test account, and non-STI Microsoft account;
- confirm Microsoft MFA and cancellation behavior;
- inspect browser history, network responses, application storage, and server logs for leaked codes or tokens;
- confirm no Microsoft Graph request occurs;
- confirm existing password login and Admin login still work.

### Production acceptance

- complete one linked-Student login and one linked-Faculty login;
- confirm wrong-tenant denial;
- confirm one Deactivated test account remains denied after valid Microsoft authentication;
- submit and approve one disposable new-Student request;
- verify the approved account can use the dashboard and retains the correct School ID and role;
- unlink the disposable identity, confirm its old JWT is rejected, and remove only disposable records through the approved cleanup process;
- review logs for consent, callback, database, and token-validation errors;
- verify password fallback and local Admin recovery after Microsoft sign-in is enabled.

## Rollout and rollback

The rollout is additive and feature-flagged. Database changes are backward-compatible, existing password hashes remain valid, and existing application JWT consumers do not change.

If Microsoft sign-in fails in production:

1. set `MICROSOFT_ENTRA_ENABLED=false`;
2. redeploy or restart the API;
3. direct users to the existing School ID/password login;
4. keep identity links and onboarding audit records in place for diagnosis;
5. do not roll back or delete account/history rows;
6. correct tenant, callback, consent, secret, or code issues in staging before re-enabling.

## Risks and mitigations

- **STI admin approval is unavailable:** Keep current login active and do not expose an unverified Microsoft button.
- **The STI tenant covers multiple campuses:** Require local SmartLib account linking or Librarian approval; tenant membership alone never grants access.
- **Microsoft email or name changes:** Continue using `(tenant_id, object_id)` as the identity key and update display hints after successful login.
- **A Microsoft account is deleted and recreated:** The object ID changes, so access does not silently transfer; an Admin must relink after verification.
- **Client secret expires:** Track ownership and expiry, alert before rotation, and retain local login as recovery.
- **A user attempts to claim another School ID:** Existing accounts require the current SmartLib password; new requests require Librarian verification.
- **Microsoft is unavailable:** Existing local password login and the local Admin recovery account remain operational.
- **OAuth replay or callback tampering:** Enforce one-time authorization codes, state, nonce, PKCE, short session expiry, and single-use completion.
- **Unintended directory-data access:** Request no Graph permissions and store no Microsoft access or refresh tokens.

## Expected change points

- `apps/api/src/config/env.js`
- `apps/api/.env.example`
- `apps/api/src/app.js`
- `apps/api/src/types/express-session.d.ts`
- `apps/api/src/modules/auth/` Microsoft adapter, routes, validation, service, and tests
- `apps/api/src/modules/users/` onboarding approval and identity management
- `apps/web/src/App.tsx`
- `apps/web/src/features/auth/` login, callback, link, onboarding, API client, and tests
- `apps/web/src/features/users/` Admin onboarding and identity-link controls
- next available `database/supabase/` migration
- next available `database/migrations/` rollback-reference migration
- `database/supabase/001_from_baseline.sql`
- `database/mysql56-schema.sql`
- `docs/schema-context.md`
- `docs/authentication-setup.md`
- `docs/jwt-role-authentication.md`
- `docs/api-reference.md`
- `README.MD`
- `.cursor/agent-protocol.md` migration tracker after migrations are created

## External prerequisites before implementation

The plan is build-ready once Ethan has:

- the STI Entra tenant ID;
- confirmation that STI IT will register or approve the application;
- the final production and stable staging domains;
- dedicated Student and Faculty Microsoft test accounts;
- an agreed manual or roster-based School ID verification procedure for new Students.

No registrar or school-database credentials are required.

## References

- [Microsoft identity platform: single-tenant and multitenant applications](https://learn.microsoft.com/en-us/entra/identity-platform/single-and-multi-tenant-apps)
- [Microsoft identity platform: OpenID Connect](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)
- [Microsoft authentication flows and authorization code guidance](https://learn.microsoft.com/en-us/entra/identity-platform/msal-authentication-flows)
- [Microsoft ID token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)
- [Microsoft Entra user and administrator consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/user-admin-consent-overview)

## Implementation tracking

- [x] Current login, account schema, deployment, and authentication-version behavior inspected.
- [x] Product source of truth and relevant authentication/account-lifecycle requirements reviewed.
- [x] Microsoft tenant, claim, flow, and consent guidance reviewed.
- [x] Architecture and safe account-linking approach selected.
- [x] Database, API, UI, security, test, deployment, and rollback work planned.
- [ ] Institutional prerequisites completed.
- [ ] Implementation approved by Ethan.
- [ ] Phase 1 built and verified.
- [ ] Phase 2 built and verified.
- [ ] Phase 3 built and verified.
- [ ] Phase 4 built and verified.
- [ ] Phase 5 production acceptance completed.

## Change log

- **2026-10-09:** Created the planned Microsoft Entra authentication design. Selected direct single-tenant OIDC through the existing Express API, retained SmartLib JWT and local authorization, excluded Graph and school-database access, and defined safe migration, linking, onboarding, testing, rollout, and rollback paths.
