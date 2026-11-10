// Runs every minute on Netlify's scheduler and sends a push to any phone
// that has an alarm due. See netlify/lib/alarmCore.js for why/how.
import webpush from 'web-push';
import { getStore } from '@netlify/blobs';
import { runTick, blobsToStore } from '../lib/alarmCore.js';

export default async () => {
  const devices = blobsToStore(getStore({ name: 'alarm-devices', consistency: 'strong' }));
  const meta = blobsToStore(getStore({ name: 'alarm-meta', consistency: 'strong' }));
  const result = await runTick({ devices, meta, webpush, subject: process.env.URL || 'https://retrolist.netlify.app' });
  console.log('alarm tick', JSON.stringify(result));
  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
};

export const config = { schedule: '* * * * *' };
