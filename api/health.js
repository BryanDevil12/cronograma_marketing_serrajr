const { applyCors } = require('./_lib/cors');
const { getSupabase } = require('./_lib/supabase');
const { getCalendarClient, isReauthError } = require('./_lib/googleCalendar');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const result = { supabase: 'unknown', google: 'unknown' };

  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('team_members').select('id').limit(1);
    result.supabase = error ? `error: ${error.message}` : 'ok';
  } catch (err) {
    result.supabase = `error: ${err.message}`;
  }

  try {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    await calendar.calendarList.get({ calendarId });
    result.google = 'ok';
  } catch (err) {
    if (isReauthError(err)) {
      result.google = 'google_reauth_required';
      res.status(401).json(result);
      return;
    }
    result.google = `error: ${err.message}`;
  }

  const ok = result.supabase === 'ok' && result.google === 'ok';
  res.status(ok ? 200 : 500).json(result);
};
