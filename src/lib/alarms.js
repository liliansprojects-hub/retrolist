import { getAlarms } from './store';

export function parseTime(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return { h, m };
}

// next time this alarm should ring, or null if expired (one-shot in the past)
export function nextTrigger(alarm, now = new Date()) {
  const pt = parseTime(alarm.time);
  if (!pt) return null;
  const days = alarm.days && alarm.days.length ? [...alarm.days] : null;

  if (days) {
    for (let i = 0; i < 8; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      if (!days.includes(d.getDay())) continue;
      d.setHours(pt.h, pt.m, 0, 0);
      if (d.getTime() > now.getTime()) return d;
    }
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    d.setHours(pt.h, pt.m, 0, 0);
    return d;
  }

  if (alarm.date) {
    const d = new Date(alarm.date + 'T00:00:00');
    d.setHours(pt.h, pt.m, 0, 0);
    if (d.getTime() > now.getTime()) return d;
    return null;
  }

  const today = new Date(now);
  today.setHours(pt.h, pt.m, 0, 0);
  if (today.getTime() > now.getTime()) return today;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(pt.h, pt.m, 0, 0);
  return tomorrow;
}

export function formatRemaining(ms) {
  if (ms <= 0) return 'now';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function dayLabel(days) {
  if (!days || !days.length) return null;
  const names = ['s', 'm', 't', 'w', 't', 'f', 's'];
  return days.slice().sort((a, b) => a - b).map((d) => names[d]).join(' ');
}

export function formatTime(t, format) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (format === '12h') {
    const ampm = h >= 12 ? 'pm' : 'am';
    const hh = h % 12 || 12;
    return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}