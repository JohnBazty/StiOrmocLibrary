# Local payment return page

Published with the owner's explicit approval on November 12, 2026, as the separate
Vercel project `sti-library-local-return-20261112` in team `ssl19`.

Endpoint: <https://sti-library-local-return-20261112.vercel.app/payments/result>

This navigation-only endpoint accepts one UUID `payment` query parameter and
returns HTTP 303 to `http://localhost:5173/payments/result?payment=<uuid>`. It has
no database connection, payment credential, callback processing, application
proxy or school records. The fixed destination prevents open redirects. It sets
no-store and no-referrer headers and rejects extra parameters, duplicate IDs,
malformed references and non-GET/HEAD requests.

The browser that started checkout must have the library app running on its own
localhost port 5173. This is a local development return path, not the live library
application's payment redirect. A different device would resolve localhost to
itself. Existing Xendit sessions keep their original return settings; create a
new checkout after configuration changes.

The API reads `XENDIT_LOCAL_RETURN_URL` from the existing ignored
`apps/api/.env.xendit-sandbox`. This setting names the HTTPS endpoint above. The
API validates it and appends only the saved payment ID to both success/cancel
return URLs. The local confirmation page still fetches and verifies provider
status; following the return link never proves payment.

Run the navigation checks from the repository root:

```powershell
node --test tools/payment-return-bridge/return.test.mjs
```

Deployment source is only this folder. `.vercelignore` excludes local environment
files, tool identity, logs, README and checks. The separate `.vercel/project.json`
is ignored and must continue to point to the return project. Do not deploy the
library repository or attach its environment variables to this project.
