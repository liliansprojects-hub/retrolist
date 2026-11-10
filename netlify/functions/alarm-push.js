// Registers a phone for background alarms and handles snooze / test requests.
// Endpoint: /.netlify/functions/alarm-push
//   GET  ?action=key      -> the public key the browser needs to subscribe
//   POST {action:'register' | 'unregister' | 'snooze' | 'test', deviceId, ...}
// All logic lives in netlify/lib/alarmCore.js (tested without a network).
import webpush from 'web-push';
import { getStore } from '@netlify/blobs';
import { handleRequest, blobsToStore } from '../lib/alarmCore.js';

export default async (req) => {
  // 'strong' consistency: an alarm saved a moment ago must be visible to the
  // next scheduled run, not up to a minute later
  const devices = blobsToStore(getStore({ name: 'alarm-devices', consistency: 'strong' }));
  const meta = blobsToStore(getStore({ name: 'alarm-meta', consistency: 'strong' }));
  let body = null;
  if (req.method === 'POST') { try { body = await req.json(); } catch { body = null; } }
  const out = await handleRequest(
    { method: req.method, action: new URL(req.url).searchParams.get('action'), body },
    { devices, meta, webpush, subject: process.env.URL || 'https://retrolist.netlify.app' },
  );
  return new Response(JSON.stringify(out.json), {
    status: out.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
