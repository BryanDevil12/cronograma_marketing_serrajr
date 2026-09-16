const { google } = require('googleapis');
const { getAuthorizedClient } = require('./googleAuth');

const EVENT_YEAR = 2026;

function dateKeyToISODate(dateKey) {
  // dateKey no formato "MM-DD"
  const [month, day] = dateKey.split('-');
  return `${EVENT_YEAR}-${month}-${day}`;
}

function nextDayISODate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function buildEventDescription(ev) {
  const lines = [];
  if (ev.responsible) lines.push(`Responsável: ${ev.responsible}`);
  if (ev.reviewer) lines.push(`Revisor: ${ev.reviewer}`);
  if (ev.details) lines.push('', ev.details);
  return lines.join('\n');
}

function buildEventResource(dateKey, ev, attendeeEmails) {
  const startDate = dateKeyToISODate(dateKey);
  const endDate = nextDayISODate(startDate);

  return {
    summary: `[${ev.type.toUpperCase()}] ${ev.title}`,
    description: buildEventDescription(ev),
    start: { date: startDate },
    end: { date: endDate },
    attendees: attendeeEmails.map((email) => ({ email })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 48 * 60 },
        { method: 'popup', minutes: 24 * 60 },
        { method: 'popup', minutes: 8 * 60 },
        { method: 'popup', minutes: 4 * 60 },
        { method: 'popup', minutes: 0 }
      ]
    }
  };
}

function getCalendarClient() {
  const auth = getAuthorizedClient();
  return google.calendar({ version: 'v3', auth });
}

function isReauthError(err) {
  if (err && err.code === 'google_reauth_required') return true;
  const reason = err && err.response && err.response.data && err.response.data.error;
  return reason === 'invalid_grant';
}

async function createEvent(dateKey, ev, attendeeEmails) {
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const resource = buildEventResource(dateKey, ev, attendeeEmails);

  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: resource,
    sendUpdates: 'all',
  });

  return data.id;
}

async function updateEvent(googleEventId, dateKey, ev, attendeeEmails) {
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const resource = buildEventResource(dateKey, ev, attendeeEmails);

  await calendar.events.update({
    calendarId,
    eventId: googleEventId,
    requestBody: resource,
    sendUpdates: 'all',
  });
}

async function deleteEvent(googleEventId) {
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  try {
    await calendar.events.delete({
      calendarId,
      eventId: googleEventId,
      sendUpdates: 'all',
    });
  } catch (err) {
    // Evento já removido manualmente no Google Agenda — não é erro fatal do nosso lado.
    if (err && err.code === 410) return;
    if (err && err.response && err.response.status === 410) return;
    throw err;
  }
}

module.exports = { createEvent, updateEvent, deleteEvent, isReauthError, getCalendarClient };
