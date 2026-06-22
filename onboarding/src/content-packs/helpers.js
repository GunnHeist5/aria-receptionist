'use strict';

const DAY_LABELS = {
  'mon':     'Monday',
  'tue':     'Tuesday',
  'wed':     'Wednesday',
  'thu':     'Thursday',
  'fri':     'Friday',
  'sat':     'Saturday',
  'sun':     'Sunday',
  'mon-fri': 'Monday through Friday',
  'mon-sat': 'Monday through Saturday',
  'mon-sun': 'Monday through Sunday (every day)',
};

function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour   = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function formatHours(hours) {
  if (!hours || !Object.keys(hours).length) return '';
  return Object.entries(hours)
    .map(([days, range]) => {
      const label = DAY_LABELS[days] || days;
      const [start, end] = range.split('-');
      return `${label} ${formatTime(start)}–${formatTime(end)}`;
    })
    .join(', ');
}

function formatAfterHours(behavior, forward) {
  switch (behavior) {
    case 'forward':
      return forward
        ? `Outside business hours, calls are still forwarded to ${forward} — the owner handles after-hours calls directly.`
        : 'Outside business hours, try to reach someone on the team.';
    case 'emergency_only':
      return "Outside business hours, only handle genuine emergencies. For non-emergencies, take the caller's name and number and let them know the team will call back next business day.";
    case 'ai_message':
      return "Outside business hours, let the caller know the office is closed, take their name and number, and assure them someone will follow up promptly.";
    case 'voicemail':
    default:
      return "Outside business hours, take a message — get their name, number, and nature of the issue, and assure them someone will call back as soon as possible.";
  }
}

module.exports = { formatHours, formatAfterHours };
