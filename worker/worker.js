import { buildPushHTTPRequest } from '@pushforge/builder';

const ORIGIN = 'https://basboosa1.github.io';
const APP_URL = 'https://basboosa1.github.io/steps-habits/';

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'habits', 'questions'],
  properties: {
    summary: { type: 'string' },
    habits: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'emoji', 'note', 'frequency', 'times_per_week', 'time_of_day', 'status', 'until'],
        properties: {
          name: { type: 'string' }, emoji: { type: 'string' }, note: { type: 'string' },
          frequency: { type: 'string', enum: ['daily', 'weekly'] },
          times_per_week: { type: 'integer' },
          time_of_day: { type: 'string', enum: ['morning', 'day', 'evening', 'any'] },
          status: { type: 'string', enum: ['active', 'mastered', 'later'] },
          until: { type: 'string' }
        }
      }
    },
    questions: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['habit_index', 'question', 'options'],
        properties: {
          habit_index: { type: 'integer' }, question: { type: 'string' },
          options: {
            type: 'array', items: {
              type: 'object', additionalProperties: false, required: ['label', 'field', 'value'],
              properties: {
                label: { type: 'string' },
                field: { type: 'string', enum: ['frequency', 'time_of_day', 'status', 'name', 'keep', 'drop'] },
                value: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
};

const SYSTEM = `You turn a person's messy personal notes about habits into a clean, trackable habit list for a habit-tracking app.

Rules:
- Write habit names in the note's language. Make each name short (2-6 words), clear and actionable, phrased as what to do or avoid. Move details, reasons and nuances into "note" (one short sentence, same language) or leave note empty.
- One entry per real habit. Merge duplicates (the same habit listed in two sections is one habit). Split an item only when it clearly contains separate habits.
- Skip anything that is not a habit: headings, meta-comments about the list itself, dates of reviews, self-reflection paragraphs, personality insights, general life lessons.
- frequency: "weekly" with times_per_week when the text implies a weekly count ("3 times a week" = 3, "every 2-3 days" = 3, "once a week" = 1, a weekly day off = 1). Otherwise "daily" with times_per_week 7.
- time_of_day from cues: waking up, morning reading = morning; bedtime, sleep, night, after a set evening hour = evening; work-hours or "during the day" = day; otherwise any.
- status: "mastered" for habits the note says are already established or existing; "later" for wishes, someday or desired-but-not-started ones; otherwise "active". Progress percentages in the note do not change the status.
- until: an end date written in the note ("until 3.11.26" is day.month.year) as YYYY-MM-DD, otherwise "".
- emoji: one fitting emoji per habit.
- questions: only where a reasonable reading is genuinely ambiguous and the answer changes how the habit is tracked. At most 5. Each with 2-3 short options in the note's language; an option sets one field: frequency value is "daily" or "weekly:N"; time_of_day and status take their enum values; name takes the new name; "keep" changes nothing; "drop" removes the habit. habit_index is the 0-based index in habits.
- summary: one short friendly sentence in the note's language saying what you found.`;

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Owner signs in with APP_PASS; other users get their own token in the users table.
async function userFor(req, env) {
  const pass = req.headers.get('x-app-pass');
  if (!pass) return null;
  if (env.APP_PASS && pass === env.APP_PASS) return 'owner';
  const row = await env.DB.prepare('SELECT id FROM users WHERE token_hash = ?').bind(await sha256(pass)).first();
  return row ? row.id : null;
}

async function importNote(req, env, reply) {
  const { note, today } = await req.json().catch(() => ({}));
  if (typeof note !== 'string' || !note.trim() || note.length > 30000) return reply({ error: { message: 'bad note' } }, 400);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-5-5', max_tokens: 16000, fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Today is ${String(today).slice(0, 10)}.\n\n<note>\n${note}\n</note>` }]
    })
  });
  return new Response(r.body, { status: r.status, headers: { 'Access-Control-Allow-Origin': ORIGIN, 'content-type': 'application/json' } });
}

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': ORIGIN,
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-app-pass'
    };
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const user = await userFor(req, env);
    if (!user) return reply({ error: { message: 'unauthorized' } }, 401);
    const path = new URL(req.url).pathname;

    if (path === '/data' && req.method === 'GET') {
      const row = await env.DB.prepare('SELECT data, updated_at FROM docs WHERE user_id = ?').bind(user).first();
      return reply(row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : { data: null, updatedAt: 0 });
    }
    if (path === '/data' && req.method === 'PUT') {
      const body = await req.text();
      if (body.length > 5_000_000) return reply({ error: { message: 'too large' } }, 413);
      const { data, updatedAt } = JSON.parse(body);
      if (!data || !Array.isArray(data.habits) || !Number.isFinite(updatedAt)) return reply({ error: { message: 'bad data' } }, 400);
      await env.DB.prepare(
        `INSERT INTO docs (user_id, data, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = ?3 WHERE excluded.updated_at >= docs.updated_at`
      ).bind(user, JSON.stringify(data), updatedAt).run();
      return reply({ ok: true });
    }
    if (req.method === 'POST' && (path === '/' || path === '/import')) return importNote(req, env, reply);

    if (path === '/push-key' && req.method === 'GET') return reply({ key: env.VAPID_PUBLIC || null });
    if (path === '/subscribe' && req.method === 'POST') {
      const { subscription: s, tz } = await req.json();
      if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return reply({ error: { message: 'bad subscription' } }, 400);
      await env.DB.prepare(
        `INSERT INTO subs (endpoint, user_id, p256dh, auth, tz) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = ?2, p256dh = ?3, auth = ?4, tz = ?5`
      ).bind(s.endpoint, user, s.keys.p256dh, s.keys.auth, tz || 'Asia/Jerusalem').run();
      return reply({ ok: true });
    }
    if (path === '/unsubscribe' && req.method === 'POST') {
      const { endpoint } = await req.json();
      await env.DB.prepare('DELETE FROM subs WHERE endpoint = ? AND user_id = ?').bind(endpoint, user).run();
      return reply({ ok: true });
    }
    if (path === '/test-push' && req.method === 'POST') {
      const n = await notifyUser(env, user, { title: 'צעדים', body: 'ההתראות עובדות ✓' });
      return reply({ sent: n });
    }
    return reply({ error: { message: 'not found' } }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDueReminders(env));
  }
};

// ---------- reminders ----------
async function notifyUser(env, user, payload) {
  const { results } = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM subs WHERE user_id = ?').bind(user).all();
  let sent = 0;
  for (const s of results) {
    const { endpoint, headers, body } = await buildPushHTTPRequest({
      privateJWK: JSON.parse(env.VAPID_PRIVATE),
      subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      message: { payload: { ...payload, url: APP_URL }, adminContact: APP_URL, options: { ttl: 3600, urgency: 'high' } }
    });
    const r = await fetch(endpoint, { method: 'POST', headers, body });
    if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(s.endpoint).run();
    else if (r.ok) sent++;
  }
  return sent;
}

function localNow(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}
const addDays = (s, n) => { const d = new Date(s + 'T12:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

function habitState(h, d, F) {
  const tgt = F.quantity !== false && h.target > 1 ? h.target : 1;
  const done = day => { const v = h.log?.[day]; return v === true || (typeof v === 'number' && v >= tgt); };
  if (h.status !== 'active' || (h.until && d > h.until) || h.log?.[d] === 's' || done(d)) return 'closed';
  if (h.freq?.type === 'weekly') {
    const start = addDays(d, -new Date(d + 'T12:00Z').getUTCDay());
    let c = 0; for (let i = 0; i < 7; i++) if (done(addDays(start, i))) c++;
    if (c >= h.freq.times) return 'closed';
  }
  return 'open';
}

async function sendDueReminders(env) {
  const { results } = await env.DB.prepare(
    'SELECT s.user_id, MIN(s.tz) AS tz, d.data FROM subs s JOIN docs d ON d.user_id = s.user_id GROUP BY s.user_id'
  ).all();
  for (const row of results) {
    const data = JSON.parse(row.data);
    const F = data.settings?.features || {};
    if (F.reminders === false) continue;
    const now = localNow(row.tz);
    const due = t => { const m = toMin(t); return m <= now.min && m > now.min - 5; };
    const open = (data.habits || []).filter(h => habitState(h, now.date, F) === 'open');
    const once = async k => (await env.DB.prepare('INSERT OR IGNORE INTO sent (user_id, day, k) VALUES (?, ?, ?)').bind(row.user_id, now.date, k).run()).meta.changes > 0;

    const timed = open.filter(h => h.remind && due(h.remind));
    if (timed.length && await once('r' + now.min)) {
      await notifyUser(env, row.user_id, {
        title: timed.length === 1 ? `${timed[0].emoji} ${timed[0].name}` : 'הגיע הזמן',
        body: timed.length === 1 ? 'הגיע הזמן להרגל הזה' : timed.map(h => `${h.emoji} ${h.name}`).join(' · ')
      });
    }
    const sum = data.settings?.summary;
    if (sum?.on && sum.time && due(sum.time) && open.length && await once('summary')) {
      await notifyUser(env, row.user_id, {
        title: `נשארו ${open.length} הרגלים להיום`,
        body: open.slice(0, 4).map(h => `${h.emoji} ${h.name}`).join(' · ') + (open.length > 4 ? ' ועוד' : '')
      });
    }
  }
  await env.DB.prepare('DELETE FROM sent WHERE day < ?').bind(addDays(new Date().toISOString().slice(0, 10), -3)).run();
}
