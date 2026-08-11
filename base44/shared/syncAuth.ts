const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

// shared helpers for the local-account sync functions.
// accounts are stored as Note records (kind: 'account') partitioned by username.
// the base44 client is created per-request via createClientFromRequest and
// passed in by each function — no global stub.

export async function findAccount(base44, username) {
  const records = await db.asServiceRole.entities.Note.filter({
    username: username,
    kind: 'account',
  });
  return records && records[0] ? records[0] : null;
}

export async function verifyAccount(base44, username, authHash) {
  const account = await findAccount(base44, username);
  if (!account) return { ok: false, reason: 'no_account', account: null };
  if (account.payload && account.payload.hash !== authHash) {
    return { ok: false, reason: 'bad_auth', account: account };
  }
  return { ok: true, account: account };
}