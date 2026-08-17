# Reconstruction notes — read this first

This folder is your Base44 export, reorganized into a real, buildable
project structure, with the injected export-tool junk removed.

## What was fixed

1. **Folder structure rebuilt.** All 146 flattened files sorted into
   `src/pages/`, `src/components/`, `src/components/ui/`, `src/hooks/`,
   `src/lib/`, `src/context/`, `entities/`, `functions/`, `shared/` —
   matching what `jsconfig.json` / `components.json` actually expect
   (`@/*` → `src/*`).

2. **The `__B44_DB__` stub line removed from all 18 files it was
   contaminating.** This was NOT your real source code — it's boilerplate
   the export/scraping tool pasted onto the top of every file it captured,
   including `README.md` and `index.html` (as dead text outside any HTML
   tag). This is almost certainly why asking Base44's AI to "delete this
   line" never visibly changed anything — it likely isn't in your actual
   live source, just in this particular exported copy.

3. **Backend functions renamed to their real, exact names** — matched
   against every `db.functions.invoke('name', ...)` call in the frontend
   (`src/lib/cloudSync.js`), not guessed from content alone:
   - `functions/accountLookup.ts`
   - `functions/confirmEmail.ts`
   - `functions/deleteAccountRemote.ts`
   - `functions/forgotPassword.ts`
   - `functions/resetPassword.ts`
   - `functions/syncExchange.ts` (the core push/pull sync engine)
   - `functions/verifyEmail.ts`

4. **Good news: your Gmail/Nodemailer switch is already built.**
   `shared/mailer.ts` is a complete, working Nodemailer + Gmail transport
   using `GMAIL_USER` / `GMAIL_APP_PASSWORD`, and it's what `forgotPassword.ts`
   and `confirmEmail.ts` actually call to send codes.

5. **Found dead/orphaned code:** `src/pages/ResetPassword.jsx` is not
   referenced anywhere in `src/App.jsx`'s routes, and it calls a
   different, unused mechanism (`db.auth.resetPassword({ resetToken })` —
   Base44's built-in link-based reset) that has nothing to do with the
   real 4-digit-code flow your app actually uses
   (`ForgotPassword.jsx` → `forgotPasswordRemote`/`resetPasswordRemote`
   in `cloudSync.js` → the `forgotPassword`/`resetPassword` functions
   above). Safe to delete, or ignore.

6. **Corrected several misplaced files after Netlify build errors caught
   them** — these were reorganization mistakes on my part, not anything
   wrong with your original export:
   - `AuthContext.jsx`, `LocalAuthContext.jsx`, `SyncContext.jsx` moved
     from a (wrong) `src/context/` folder into `src/lib/` — every import
     across the whole codebase expects them there.
   - `PageNotFound.jsx` moved from `src/pages/` into `src/lib/`, matching
     `App.jsx`'s `./lib/PageNotFound` import.
   - `Layout.jsx` moved from `src/` root into `src/components/`.
   - `functions/*.ts` restructured from flat files into per-function
     subfolders (`functions/forgotPassword/entry.ts`, etc.) — this
     matches Base44's real convention (confirmed against your old proper
     export) and is required for the `../../shared/...` relative imports
     inside each function to resolve correctly.

   Every relative and `@/` import across the entire `src/` tree (223
   total) was then verified programmatically to resolve to a real file —
   not just spot-checked.

## What still blocks a real Netlify deployment

This is the honest part. Even cleaned up, this code cannot run
independently on Netlify yet, because of things that were never meant
to leave Base44's servers:

- **Every file in `functions/` imports `'npm:@base44/sdk'` and,
  in some cases, `'base44:runtime'`** (for `secrets.get(...)`). These
  module specifiers only resolve inside Base44's own Deno-based function
  runtime — they are not real, installable npm packages, and Netlify
  Functions (Node/AWS Lambda) can't run them as-is.
- **The functions store everything through
  `db.asServiceRole.entities.Note`** — a generic Base44 entity table
  being used as the real database (accounts, sync records, reset codes
  are all rows in this one "Note" entity, distinguished by a `kind`
  field). This only works while Base44 is still the backend.
- **The frontend's `db` global** (`db.auth`, `db.functions.invoke`,
  `db.entities`) is provided automatically by Base44's platform when the
  app is hosted there. On Netlify, nothing provides this — it would need
  to be replaced with real calls to whatever backend replaces Base44
  (e.g. Supabase), which is the work already scoped out in the
  Supabase migration plan.

## The good part

The actual *logic* in every function is already fully written and
correct-looking: PBKDF2-SHA256 password hashing matching client and
server, code generation with 15-minute expiry, a real push/pull sync
merge algorithm, and working email sending. Porting this to Netlify
Functions + Supabase is mostly a matter of swapping the storage/import
lines (`db.asServiceRole.entities.Note.*` → Supabase table calls,
`base44:runtime` secrets → Netlify environment variables) — not
rewriting the logic from scratch.
