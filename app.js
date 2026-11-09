const KEY = 'steps-v2', AIKEY = 'steps-ai-pass';
const AI_URL = 'https://steps-ai.steps-ai.workers.dev';
const COLORS = ['#2E9E5B', '#2F7BD9', '#E0525E', '#E8871E', '#8A5CD6', '#1F9C9C', '#C9A100', '#7A746B'];
const TIMES = { morning: 'בוקר', day: 'במהלך היום', evening: 'ערב', any: 'כל היום' };
const TIME_ORDER = ['morning', 'day', 'evening', 'any'];
const STATUS = { active: 'פעיל', mastered: 'הוטמע', later: 'לעתיד' };
const LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

let S = load();
let view = 'today', day = today(), anchor = day, draft = null, imp = null, popId = null;

const $ = s => document.querySelector(s);
const main = $('#main'), veil = $('#veil'), sheet = $('#sheet');

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { habits: [] }; } catch { return { habits: [] }; }
}
function save() { S.updatedAt = Date.now(); localStorage.setItem(KEY, JSON.stringify(S)); schedulePush(); }

// ---------- cloud sync ----------
let pushTimer = null, cloud = 'off';
const cloudOn = () => !!(AI_URL && localStorage.getItem(AIKEY));
async function api(path, opts = {}) {
  const r = await fetch(AI_URL + path, { ...opts, headers: { 'content-type': 'application/json', 'x-app-pass': localStorage.getItem(AIKEY) } });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
function setCloud(s) { cloud = s; if (view === 'settings') render(); }
function schedulePush() { if (!cloudOn()) return; clearTimeout(pushTimer); pushTimer = setTimeout(push, 1200); }
async function push() {
  try { await api('/data', { method: 'PUT', body: JSON.stringify({ data: S, updatedAt: S.updatedAt || Date.now() }) }); setCloud('ok'); }
  catch (e) { setCloud(e.message === '401' ? 'auth' : 'error'); }
}
async function pull() {
  if (!cloudOn()) return setCloud('off');
  try {
    const r = await api('/data');
    if (r.data && r.updatedAt > (S.updatedAt || 0)) { S = r.data; localStorage.setItem(KEY, JSON.stringify(S)); render(); setCloud('ok'); }
    else if (S.habits.length && (S.updatedAt || 0) > r.updatedAt || !r.data && S.habits.length) await push();
    else setCloud('ok');
  } catch (e) { setCloud(e.message === '401' ? 'auth' : 'error'); }
}
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function today() { return iso(new Date()); }
function D(s) { return new Date(s + 'T12:00'); }
function addDays(s, n) { const d = D(s); d.setDate(d.getDate() + n); return iso(d); }
function dow(s) { return D(s).getDay(); }
function weekStart(s) { return addDays(s, -dow(s)); }
function between(a, b) { return Math.round((D(b) - D(a)) / 864e5); }
function fmt(s) { if (!s) return ''; const [y, m, d] = s.split('-'); return `${+d}.${+m}.${y.slice(2)}`; }
function longDate(s) { const d = D(s); return `יום ${DAYS[d.getDay()]}, ${d.getDate()} ב${MONTHS[d.getMonth()]}`; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const byId = id => S.habits.find(h => h.id === id);

function newHabit(f) {
  return {
    id: uid(), name: f.name, emoji: f.emoji || '🌱', color: f.color ?? S.habits.length % COLORS.length,
    freq: f.freq || { type: 'daily', times: 7 }, time: f.time || 'any', status: f.status || 'active',
    until: f.until || null, note: f.note || '', log: {}, created: today()
  };
}

function freqText(f) {
  if (f.type === 'daily') return 'כל יום';
  return f.times === 1 ? 'פעם בשבוע' : `${f.times} פעמים בשבוע`;
}
function weekCount(h, d) {
  const s = weekStart(d); let c = 0;
  for (let i = 0; i < 7; i++) if (h.log[addDays(s, i)]) c++;
  return c;
}
function activeOn(h, d) { return h.status === 'active' && (!h.until || d <= h.until); }
function metForWeek(h, d) { return h.freq.type === 'weekly' && !h.log[d] && weekCount(h, d) >= h.freq.times; }

function dayRatio(d) {
  const items = S.habits.filter(h => activeOn(h, d) && !metForWeek(h, d));
  if (!items.length) return 0;
  return Math.round(100 * items.filter(h => h.log[d]).length / items.length);
}

function consistency(h) {
  const end = today();
  const start = h.created > addDays(end, -27) ? h.created : addDays(end, -27);
  const days = between(start, end) + 1;
  if (h.freq.type === 'daily') {
    let c = 0; for (let i = 0; i < days; i++) if (h.log[addDays(start, i)]) c++;
    return { pct: Math.round(100 * c / days), days };
  }
  const weeks = Math.max(1, Math.ceil(days / 7)); let got = 0;
  for (let w = 0; w < weeks; w++) got += Math.min(h.freq.times, weekCount(h, addDays(end, -7 * w)));
  return { pct: Math.round(100 * got / (weeks * h.freq.times)), days };
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 1700);
}

// ---------- views ----------
function render() {
  document.querySelectorAll('.tabbar [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === view));
  main.innerHTML = view === 'today' ? viewToday() : view === 'progress' ? viewProgress() : viewSettings();
  if (popId) { main.querySelector(`.card[data-id="${popId}"]`)?.classList.add('pop'); popId = null; }
}

function emptyState() {
  return `<div class="empty"><div class="big">🌱</div><h1 style="font-size:26px">בוא נתחיל</h1>
    <p>הוסף הרגל ראשון, או הדבק פתק הרגלים קיים ונסדר אותו בשבילך.</p>
    <button class="btn" data-act="import">ייבוא מפתק</button>
    <button class="btn soft" data-act="quick">הוסף הרגל</button></div>`;
}

function weekStrip() {
  const t = today();
  let html = `<div class="week"><button class="nav" data-act="wk" data-n="-7" aria-label="שבוע קודם">›</button><div class="days">`;
  for (let i = 6; i >= 0; i--) {
    const d = addDays(anchor, -i);
    html += `<button class="d ${d === day ? 'sel' : ''} ${d === t ? 'today' : ''}" data-act="day" data-d="${d}">
      <span class="l">${LETTERS[dow(d)]}</span><span class="r" style="--p:${dayRatio(d)}"><span>${D(d).getDate()}</span></span></button>`;
  }
  return html + `</div><button class="nav" data-act="wk" data-n="7" aria-label="שבוע הבא" ${anchor >= t ? 'disabled' : ''}>‹</button></div>`;
}

function habitCard(h) {
  const done = !!h.log[day], met = metForWeek(h, day);
  const wk = h.freq.type === 'weekly' ? `<span class="cnt">${weekCount(h, day)}/${h.freq.times}</span>` : '';
  const meta = h.freq.type === 'weekly' ? (met ? 'הושלם לשבוע 🎉' : freqText(h.freq)) : (h.until ? `עד ${fmt(h.until)}` : '');
  return `<div class="card ${done ? 'done' : ''} ${met ? 'met' : ''}" data-id="${h.id}" style="--c:${COLORS[h.color]}">
    <button class="emo" data-act="edit" data-id="${h.id}">${esc(h.emoji)}</button>
    <div class="t" data-act="edit" data-id="${h.id}"><div class="n">${esc(h.name)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</div>
    ${wk}<button class="tick" data-act="tick" data-id="${h.id}" aria-label="סמן">${CHECK}</button></div>`;
}

function viewToday() {
  if (!S.habits.length) return emptyState();
  const t = today();
  const title = day === t ? 'היום' : day === addDays(t, -1) ? 'אתמול' : `יום ${DAYS[dow(day)]}`;
  let html = `<div class="top"><div class="date">${longDate(day)}</div><h1>${title}</h1>
    ${day !== t ? `<button class="back" data-act="day" data-d="${t}">חזרה להיום</button>` : ''}</div>`;
  html += weekStrip();
  const list = S.habits.filter(h => activeOn(h, day));
  if (!list.length) return html + `<div class="empty"><p>אין הרגלים פעילים ליום הזה.</p></div>`;
  const open = list.filter(h => !metForWeek(h, day)), met = list.filter(h => metForWeek(h, day));
  const done = open.filter(h => h.log[day]).length;
  html += `<div class="summary"><span>${done} מתוך ${open.length}</span><span class="bar"><i style="width:${open.length ? 100 * done / open.length : 0}%"></i></span></div>`;
  for (const tm of TIME_ORDER) {
    const g = open.filter(h => h.time === tm); if (!g.length) continue;
    html += `<h2>${TIMES[tm]}</h2>` + g.map(habitCard).join('');
  }
  if (met.length) html += `<h2>הושלמו לשבוע</h2>` + met.map(habitCard).join('');
  return html;
}

function dotGrid(h) {
  const t = today(), start = addDays(weekStart(t), -7 * 15);
  let cells = '';
  for (let i = 0; i < 16 * 7; i++) {
    const d = addDays(start, i);
    cells += `<i class="${d > t ? 'fu' : h.log[d] ? 'on' : ''}"></i>`;
  }
  return `<div class="grid">${cells}</div>`;
}

function viewProgress() {
  if (!S.habits.length) return emptyState();
  let html = `<div class="top"><div class="date">16 השבועות האחרונים</div><h1>התקדמות</h1></div>`;
  const act = S.habits.filter(h => h.status === 'active');
  if (act.length) html += `<h2>פעילים</h2>`;
  for (const h of act) {
    const c = consistency(h);
    const ready = c.pct >= 85 && c.days >= 21;
    html += `<div class="pcard" data-act="edit" data-id="${h.id}" style="--c:${COLORS[h.color]}">
      <div class="head"><div class="emo">${esc(h.emoji)}</div><div class="t"><div class="n">${esc(h.name)}</div>
      <div class="meta">${freqText(h.freq)} · ${TIMES[h.time]}</div></div><div class="pct">${c.pct}%</div></div>
      ${dotGrid(h)}
      ${ready ? `<div class="hint"><span>${c.pct}% ב-4 השבועות האחרונים. נראה שזה כבר הוטמע.</span>
        <button class="btn sm" data-act="master" data-id="${h.id}">הוטמע ✓</button></div>` : ''}</div>`;
  }
  const mastered = S.habits.filter(h => h.status === 'mastered');
  if (mastered.length) html += `<h2>הוטמעו</h2>` + mastered.map(h => miniRow(h, '')).join('');
  const later = S.habits.filter(h => h.status === 'later');
  if (later.length) html += `<h2>לעתיד</h2>` + later.map(h => miniRow(h, `<button class="btn sm soft" data-act="activate" data-id="${h.id}">להתחיל</button>`)).join('');
  return html;
}

function miniRow(h, extra) {
  return `<div class="row" style="--c:${COLORS[h.color]}"><div class="emo" style="width:36px;height:36px;font-size:18px">${esc(h.emoji)}</div>
    <div class="t" data-act="edit" data-id="${h.id}"><div class="n">${esc(h.name)}</div></div>${extra}</div>`;
}

function viewSettings() {
  const hasKey = !!localStorage.getItem(AIKEY);
  return `<div class="top"><h1>עוד</h1></div>
  <h2>ייבוא</h2><div class="group">
    <button data-act="import"><div>ייבוא חכם מפתק</div><div class="s">מדביקים פתק מבולגן, ה-AI מסדר אותו להרגלים ברורים</div></button></div>
  <h2>חשבון וענן</h2><div class="group"><div>
    <div style="margin-bottom:10px">${{ ok: 'מסונכרן לענן ✓', off: 'לא מחובר לענן', auth: 'קוד הגישה שגוי', error: 'אין חיבור כרגע, ינסה שוב אוטומטית' }[cloud]}</div>
    <input type="password" id="aikey" placeholder="${hasKey ? 'קוד הגישה שמור ✓' : 'קוד גישה'}" autocomplete="off">
    <div class="btns" style="margin-top:10px"><button class="btn sm" data-act="savekey">שמור</button>${hasKey ? '<button class="btn sm soft" data-act="delkey">התנתק</button>' : ''}</div></div></div>
  <p class="note">קוד הגישה מחבר את המכשיר לשרת הפרטי שלך: ההרגלים נשמרים בענן ומסתנכרנים בין מכשירים, והייבוא החכם עובד דרך Claude. בלי קוד, הכל נשמר רק במכשיר.</p>
  <h2>גיבוי</h2><div class="group">
    <button data-act="export"><div>שמירת גיבוי</div><div class="s">קובץ עם כל ההרגלים וההיסטוריה</div></button>
    <button data-act="restore"><div>שחזור מגיבוי</div><div class="s">מחליף את הנתונים הנוכחיים</div></button>
    <button data-act="astext"><div>העתקה כטקסט</div><div class="s">רשימה מסודרת להדבקה בפתקים</div></button></div>
  <input type="file" id="rfile" accept=".json,application/json" hidden>`;
}

// ---------- sheets ----------
function openSheet(html) { sheet.innerHTML = `<div class="grab"></div>` + html; veil.classList.add('open'); }
function closeSheet() { veil.classList.remove('open'); draft = null; imp = null; }

function chipRow(group, items, cur) {
  return `<div class="chips">${items.map(([v, l]) => `<button class="chip ${String(v) === String(cur) ? 'on' : ''}" data-act="chip" data-g="${group}" data-v="${v}">${l}</button>`).join('')}</div>`;
}
const FREQS = [['d', 'כל יום'], ['1', 'פעם בשבוע'], ['2', '2 בשבוע'], ['3', '3 בשבוע'], ['4', '4 בשבוע'], ['5', '5 בשבוע']];
const freqKey = f => f.type === 'daily' ? 'd' : String(f.times);

function habitForm(isNew) {
  const d = draft;
  let html = `<h3>${isNew ? 'הרגל חדש' : 'עריכה'}</h3>
    <div class="namerow" style="margin-top:12px"><input type="text" class="emoji-in" id="femoji" value="${esc(d.emoji)}" maxlength="4">
    <input type="text" id="fname" value="${esc(d.name)}" placeholder="למשל: לא לעשות כמה דברים במקביל" enterkeyhint="done" autocomplete="off"></div>
    <label>כמה פעמים</label>${chipRow('freq', FREQS, freqKey(d.freq))}
    <label>מתי</label>${chipRow('time', TIME_ORDER.map(t => [t, TIMES[t]]), d.time)}`;
  if (!isNew) {
    html += `<label>מצב</label>${chipRow('status', Object.entries(STATUS), d.status)}
      <label>צבע</label><div class="swatches">${COLORS.map((c, i) => `<button class="sw ${i === d.color ? 'on' : ''}" style="background:${c}" data-act="chip" data-g="color" data-v="${i}"></button>`).join('')}</div>
      <label>עד תאריך (לא חובה)</label><input type="date" id="funtil" value="${d.until || ''}">
      <label>הערה</label><textarea id="fnote" placeholder="למה זה חשוב לי, איך עושים את זה...">${esc(d.note)}</textarea>`;
  }
  html += `<div class="btns"><button class="btn" data-act="${isNew ? 'add' : 'save'}">${isNew ? 'הוסף' : 'שמור'}</button><button class="btn soft" data-act="close">ביטול</button></div>`;
  if (isNew) html += `<button class="btn link full" data-act="import">יש לך רשימה או פתק? ייבוא חכם</button>`;
  else html += `<button class="btn danger full" data-act="del">מחיקת ההרגל</button>`;
  return html;
}

function openQuick() {
  draft = { emoji: '🌱', name: '', freq: { type: 'daily', times: 7 }, time: 'any', color: S.habits.length % COLORS.length };
  openSheet(habitForm(true));
  $('#fname').focus();
}
function openEdit(id) {
  const h = byId(id); if (!h) return;
  draft = { ...h, freq: { ...h.freq } };
  openSheet(habitForm(false));
}
function readForm() {
  draft.name = $('#fname').value.trim();
  draft.emoji = $('#femoji').value.trim() || '🌱';
  if ($('#funtil')) draft.until = $('#funtil').value || null;
  if ($('#fnote')) draft.note = $('#fnote').value;
  return draft.name;
}

// ---------- import ----------
async function aiParse(text) {
  const r = await fetch(AI_URL + '/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-pass': localStorage.getItem(AIKEY) },
    body: JSON.stringify({ note: text, today: today() })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(r.status === 401 ? 'קוד הגישה שגוי' : (d.error?.message || 'שגיאה ' + r.status));
  if (d.stop_reason === 'refusal') throw new Error('הבקשה נדחתה');
  if (d.stop_reason === 'max_tokens') throw new Error('הפתק ארוך מדי, נסה לחלק אותו');
  const out = JSON.parse(d.content.filter(b => b.type === 'text').map(b => b.text).join(''));
  return {
    summary: out.summary,
    questions: out.questions.filter(q => out.habits[q.habit_index]),
    items: out.habits.map(h => ({
      name: h.name, emoji: h.emoji, note: h.note, time: h.time_of_day, status: h.status,
      freq: h.frequency === 'weekly' ? { type: 'weekly', times: Math.min(7, Math.max(1, h.times_per_week)) } : { type: 'daily', times: 7 },
      until: /^\d{4}-\d{2}-\d{2}$/.test(h.until) ? h.until : null, include: true
    }))
  };
}

// Offline fallback: headings + simple cues
function basicParse(text) {
  const items = []; let status = 'active', stop = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || stop) continue;
    const head = line.slice(0, 30);
    if (/^שיפורים בעצמי|^בדיקת סטטוס/.test(line)) { stop = /^שיפורים/.test(line); status = 'skip'; continue; }
    if (/^הרגל/.test(line)) { status = /קיימים|מיושמים/.test(head) ? 'mastered' : /נחשקים|לעתיד/.test(head) ? 'later' : 'active'; continue; }
    if (status === 'skip' || /^(הערה|הטמעת הרגלים|בדיקה אחרונה)/.test(line)) continue;
    const name = line.replace(/\s*\([^)]*(%|\d+\.\d+\.\d+)[^)]*\)\s*\.?$/, '').replace(/\s+\d{1,3}\s*%\s*$/, '').replace(/[\s\-–:]+$/, '');
    const um = line.match(/עד (\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    const wk = line.match(/(\d)\s*\S*\s*בשבוע/);
    items.push({
      name: name || line, emoji: '🌱', note: '', status, include: true,
      freq: wk ? { type: 'weekly', times: +wk[1] } : /פעם בשבוע/.test(line) ? { type: 'weekly', times: 1 } : /מדי יומיים/.test(line) ? { type: 'weekly', times: 3 } : { type: 'daily', times: 7 },
      time: /בבוקר|לקום/.test(line) ? 'morning' : /שינה|לישון|בלילה|ערב|19:00/.test(line) ? 'evening' : 'any',
      until: um ? `${um[3].length === 2 ? '20' + um[3] : um[3]}-${um[2].padStart(2, '0')}-${um[1].padStart(2, '0')}` : null
    });
  }
  const norm = s => s.replace(/[^\p{L}\p{N}]/gu, '');
  const seen = new Set();
  return { summary: `נמצאו ${items.length} שורות. לסידור חכם יותר, הוסף קוד גישה במסך "עוד".`, questions: [], items: items.filter(i => !seen.has(norm(i.name)) && seen.add(norm(i.name))) };
}

function openImport() {
  const ai = !!(AI_URL && localStorage.getItem(AIKEY));
  openSheet(`<h3>ייבוא מפתק</h3>
    <p class="sub">${ai ? 'הדבק את הפתק כמו שהוא, גם אם הוא מבולגן. נסדר אותו להרגלים ברורים ונשאל רק מה שלא ברור.' : 'הדבק את הפתק. במצב בסיסי הסידור פשוט יותר; לסידור חכם הוסף קוד גישה במסך "עוד".'}</p>
    <textarea id="itext" style="min-height:220px" placeholder="הדבק כאן..."></textarea>
    <div class="btns"><button class="btn" data-act="iparse">${ai ? 'סדר לי ✨' : 'המשך'}</button><button class="btn soft" data-act="close">ביטול</button></div>`);
}

function metaOf(it) { return [freqText(it.freq), TIMES[it.time], it.status !== 'active' ? STATUS[it.status] : ''].filter(Boolean).join(' · '); }

function renderImport() {
  const n = imp.items.filter(i => i.include).length;
  const open = imp.questions.filter(q => !q.answered).length;
  let html = `<h3>${n} הרגלים מוכנים</h3><p class="sub">${esc(imp.summary)}</p>`;
  if (imp.questions.length) {
    html += `<label>${open ? `כמה שאלות קצרות (${open})` : 'השאלות נענו ✓'}</label>`;
    imp.questions.forEach((q, qi) => {
      html += `<div class="q ${q.answered ? 'answered' : ''}"><div class="of">${esc(imp.items[q.habit_index].name)}</div><div class="qt">${esc(q.question)}</div>
        <div class="chips">${q.options.map((o, oi) => `<button class="chip ${q.answered === oi + 1 ? 'on' : ''}" data-act="answer" data-q="${qi}" data-o="${oi}">${esc(o.label)}</button>`).join('')}</div></div>`;
    });
  }
  for (const st of ['active', 'mastered', 'later']) {
    const list = imp.items.map((it, i) => [it, i]).filter(([it]) => it.status === st);
    if (!list.length) continue;
    html += `<label>${st === 'active' ? 'למעקב' : st === 'mastered' ? 'כבר הוטמעו' : 'לעתיד'}</label>`;
    for (const [it, i] of list) {
      html += `<div class="ii ${it.include ? '' : 'off'}" style="--c:${COLORS[i % COLORS.length]}"><div class="emo">${esc(it.emoji)}</div>
        <div class="t"><input type="text" data-in="${i}" value="${esc(it.name)}"><div class="meta">${metaOf(it)}</div></div>
        <input type="checkbox" class="chk" data-inc="${i}" ${it.include ? 'checked' : ''}></div>`;
    }
  }
  html += `<div class="btns"><button class="btn" data-act="igo" ${n ? '' : 'disabled'}>ייבוא ${n} הרגלים</button><button class="btn soft" data-act="close">ביטול</button></div>`;
  const top = sheet.scrollTop; sheet.innerHTML = `<div class="grab"></div>` + html; sheet.scrollTop = top;
}

function answer(qi, oi) {
  const q = imp.questions[qi], o = q.options[oi], it = imp.items[q.habit_index];
  if (o.field === 'frequency') it.freq = o.value.startsWith('weekly') ? { type: 'weekly', times: +(o.value.split(':')[1] || 1) } : { type: 'daily', times: 7 };
  if (o.field === 'time_of_day' && TIMES[o.value]) it.time = o.value;
  if (o.field === 'status' && STATUS[o.value]) it.status = o.value;
  if (o.field === 'name' && o.value) it.name = o.value;
  if (o.field === 'drop') it.include = false;
  q.answered = oi + 1;
  renderImport();
}

function doImport() {
  let n = 0;
  imp.items.forEach((it, i) => {
    if (!it.include || !it.name.trim()) return;
    S.habits.push(newHabit({ ...it, color: (S.habits.length + i) % COLORS.length })); n++;
  });
  save(); closeSheet(); view = 'today'; day = anchor = today(); render(); toast(`נוספו ${n} הרגלים`);
}

// ---------- backup ----------
async function exportJson() {
  const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
  const file = new File([blob], `steps-backup-${today()}.json`, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
}
function restoreJson(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result); if (!Array.isArray(d.habits)) throw 0;
      if (!confirm(`לשחזר ${d.habits.length} הרגלים? הנתונים הנוכחיים יוחלפו.`)) return;
      S = d; save(); render(); toast('שוחזר');
    } catch { toast('קובץ לא תקין'); }
  };
  r.readAsText(file);
}
function asText() {
  const out = [];
  for (const st of ['active', 'mastered', 'later']) {
    const list = S.habits.filter(h => h.status === st); if (!list.length) continue;
    out.push(st === 'active' ? 'בתהליך' : st === 'mastered' ? 'הוטמעו' : 'לעתיד');
    for (const h of list) out.push(`${h.emoji} ${h.name} · ${freqText(h.freq)}${st === 'active' ? ` · ${consistency(h).pct}%` : ''}`);
    out.push('');
  }
  return out.join('\n');
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const go = e.target.closest('[data-go]');
  if (go) { view = go.dataset.go; if (view === 'today') day = anchor = today(); render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-act]');
  if (!el) { if (e.target === veil) closeSheet(); return; }
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'quick': openQuick(); break;
    case 'close': closeSheet(); break;
    case 'day': day = el.dataset.d; if (day === today()) anchor = day; render(); break;
    case 'wk': {
      anchor = addDays(anchor, +el.dataset.n); if (anchor > today()) anchor = today();
      day = day > anchor || day < addDays(anchor, -6) ? anchor : day; render(); break;
    }
    case 'tick': {
      const h = byId(id);
      if (h.log[day]) delete h.log[day]; else { h.log[day] = true; popId = id; }
      save(); render(); break;
    }
    case 'edit': openEdit(id); break;
    case 'chip': {
      const g = el.dataset.g, v = el.dataset.v;
      if (g === 'freq') draft.freq = v === 'd' ? { type: 'daily', times: 7 } : { type: 'weekly', times: +v };
      else if (g === 'color') draft.color = +v;
      else draft[g] = v;
      el.parentElement.querySelectorAll('.chip,.sw').forEach(c => c.classList.toggle('on', c === el));
      break;
    }
    case 'add':
      if (!readForm()) { $('#fname').focus(); return; }
      S.habits.push(newHabit(draft)); save(); render();
      draft = { ...draft, name: '', emoji: '🌱', color: S.habits.length % COLORS.length };
      $('#fname').value = ''; $('#femoji').value = '🌱'; $('#fname').focus(); toast('נוסף ✓');
      break;
    case 'save': {
      if (!readForm()) return;
      Object.assign(byId(draft.id), draft); save(); closeSheet(); render(); break;
    }
    case 'del': if (confirm('למחוק את ההרגל וההיסטוריה שלו?')) { S.habits = S.habits.filter(h => h.id !== draft.id); save(); closeSheet(); render(); } break;
    case 'master': e.stopPropagation(); byId(id).status = 'mastered'; save(); render(); toast('כל הכבוד! הועבר להוטמעו'); break;
    case 'activate': byId(id).status = 'active'; save(); render(); toast('נוסף למעקב היומי'); break;
    case 'import': openImport(); break;
    case 'iparse': {
      const text = $('#itext').value; if (!text.trim()) return;
      if (!AI_URL || !localStorage.getItem(AIKEY)) { imp = basicParse(text); renderImport(); break; }
      sheet.innerHTML = `<div class="grab"></div><div class="spin"></div><p class="sub" style="text-align:center">מסדר את הפתק...<br>זה לוקח בערך חצי דקה</p>`;
      try { imp = await aiParse(text); renderImport(); }
      catch (err) { imp = basicParse(text); imp.summary = `הסידור החכם נכשל (${err.message}), אז סידרתי במצב בסיסי.`; renderImport(); }
      break;
    }
    case 'answer': answer(+el.dataset.q, +el.dataset.o); break;
    case 'igo': doImport(); break;
    case 'savekey': {
      const v = $('#aikey').value.trim(); if (!v) return;
      localStorage.setItem(AIKEY, v); render(); toast('קוד הגישה נשמר'); pull(); break;
    }
    case 'delkey': localStorage.removeItem(AIKEY); cloud = 'off'; render(); toast('המכשיר נותק מהענן'); break;
    case 'export': exportJson(); break;
    case 'restore': $('#rfile').click(); break;
    case 'astext': navigator.clipboard.writeText(asText()).then(() => toast('הועתק'), () => toast('ההעתקה נכשלה')); break;
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.in != null && imp) imp.items[t.dataset.in].name = t.value;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'rfile' && t.files[0]) restoreJson(t.files[0]);
  if (t.dataset.inc != null && imp) { imp.items[t.dataset.inc].include = t.checked; renderImport(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'fname') { e.preventDefault(); sheet.querySelector('[data-act=add],[data-act=save]').click(); }
});

if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
window.addEventListener('online', pull);
render();
pull();
