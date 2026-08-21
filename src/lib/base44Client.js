import { createClient } from '@base44/sdk';

// this used to be a permanent dead stub (auth always false, entities always
// empty, no `functions` key at all) — that's the actual root cause behind
// "db is not defined" / "Cannot read properties of undefined (reading
// 'invoke')" errors seen across login, forgot-password, and registration:
// cloudSync.js calls db.functions.invoke(...) directly, and this stub never
// had a `functions` object to invoke anything on in the first place.
//
// this app's backend functions (accountLookup, syncExchange, forgotPassword,
// etc.) are deployed on Base44's own servers and are reached over HTTPS via
// this SDK client — that part doesn't change even though the frontend itself
// is hosted on Netlify. VITE_BASE44_APP_ID is already set in the Netlify
// environment (visible in the build config), so this only needs a real
// client construction, not a new environment variable.
const appId = import.meta.env.VITE_BASE44_APP_ID;

export const base44 = createClient({ appId });
export const db = base44;
export default db;
