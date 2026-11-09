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
    until: f.until || null, note: f.note || '', target: f.target || null, unit: f.unit || '', remind: f.remind || null,
    log: {}, created: today()
  };
}

function freqText(f) {
  if (f.type === 'daily') return 'כל יום';
  return f.times === 1 ? 'פעם בשבוע' : `${f.times} פעמים בשבוע`;
}
// ---------- features (each can be switched off in "עוד") ----------
const FEATURES = {
  reminders: ['תזכורות', 'התראה בשעה שבחרת לכל הרגל, וסיכום ערב'],
  quantity: ['יעד כמותי', 'למשל 8 כוסות מים או 20 עמודים, לחיצה מוסיפה 1'],
  skip: ['דילוג על יום', 'יום מחלה או חופש לא פוגע באחוזים וברצף'],
  streaks: ['רצפים 🔥', 'כמה ימים ברצף עמדת בהרגל']
};
const F = k => (S.settings?.features?.[k]) ?? (k !== 'streaks');
function setFeature(k, on) { S.settings = S.settings || {}; S.settings.features = { ...(S.settings.features || {}), [k]: on }; save(); }

// log[d]: true = done, number = amount toward a target, 's' = skipped
const tgt = h => F('quantity') && h.target > 1 ? h.target : 1;
const amount = (h, d) => { const v = h.log[d]; return v === true ? tgt(h) : typeof v === 'number' ? v : 0; };
const isDone = (h, d) => amount(h, d) >= tgt(h);
const isSkip = (h, d) => F('skip') && h.log[d] === 's';

function weekCount(h, d) {
  const s = weekStart(d); let c = 0;
  for (let i = 0; i < 7; i++) if (isDone(h, addDays(s, i))) c++;
  return c;
}
function activeOn(h, d) { return h.status === 'active' && (!h.until || d <= h.until); }
function metForWeek(h, d) { return h.freq.type === 'weekly' && !isDone(h, d) && weekCount(h, d) >= h.freq.times; }

function dayRatio(d) {
  const items = S.habits.filter(h => activeOn(h, d) && !metForWeek(h, d) && !isSkip(h, d));
  if (!items.length) return 0;
  return Math.round(100 * items.filter(h => isDone(h, d)).length / items.length);
}

function streak(h) {
  const t = today();
  if (h.freq.type === 'weekly') {
    let n = 0, w = weekCount(h, t) >= h.freq.times ? t : addDays(t, -7);
    while (n < 200 && weekCount(h, w) >= h.freq.times) { n++; w = addDays(w, -7); }
    return n >= 2 ? `🔥 ${n} שבועות` : '';
  }
  let n = 0, d = isDone(h, t) || isSkip(h, t) ? t : addDays(t, -1);
  for (let i = 0; i < 1000 && (isDone(h, d) || isSkip(h, d)); i++) { if (isDone(h, d)) n++; d = addDays(d, -1); }
  return n >= 2 ? `🔥 ${n}` : '';
}

function consistency(h) {
  const end = today();
  const start = h.created > addDays(end, -27) ? h.created : addDays(end, -27);
  const days = between(start, end) + 1;
  if (h.freq.type === 'daily') {
    let c = 0, n = 0;
    for (let i = 0; i < days; i++) { const d = addDays(start, i); if (isSkip(h, d)) continue; n++; if (isDone(h, d)) c++; }
    return { pct: n ? Math.round(100 * c / n) : 0, days };
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
  const done = isDone(h, day), met = metForWeek(h, day), skip = isSkip(h, day), T = tgt(h), a = amount(h, day);
  const parts = [];
  if (skip) parts.push('דילוג היום');
  else if (T > 1) parts.push(`${a}/${T}${h.unit ? ' ' + esc(h.unit) : ''}`);
  if (!skip && h.freq.type === 'weekly') parts.push(met ? 'הושלם לשבוע 🎉' : `${weekCount(h, day)}/${h.freq.times} השבוע`);
  if (h.until && !skip) parts.push(`עד ${fmt(h.until)}`);
  if (F('streaks')) { const s = streak(h); if (s) parts.push(s); }
  if (F('reminders') && h.remind) parts.push(`⏰ ${h.remind}`);
  const fill = T > 1 && !done ? Math.round(100 * a / T) : 0;
  return `<div class="card ${done ? 'done' : ''} ${met ? 'met' : ''} ${skip ? 'skip' : ''}" data-id="${h.id}" style="--c:${COLORS[h.color]};--f:${fill}%">
    <button class="emo" data-act="edit" data-id="${h.id}">${esc(h.emoji)}</button>
    <div class="t" data-act="edit" data-id="${h.id}"><div class="n">${esc(h.name)}</div>${parts.length ? `<div class="meta">${parts.join(' · ')}</div>` : ''}</div>
    <button class="tick ${T > 1 && !done ? 'plus' : ''}" data-act="tick" data-id="${h.id}" aria-label="סמן">${T > 1 && !done ? '+1' : CHECK}</button></div>`;
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
  const counted = open.filter(h => !isSkip(h, day)), done = counted.filter(h => isDone(h, day)).length;
  html += `<div class="summary"><span>${done} מתוך ${counted.length}</span><span class="bar"><i style="width:${counted.length ? 100 * done / counted.length : 0}%"></i></span></div>`;
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
    cells += `<i class="${d > t ? 'fu' : isDone(h, d) ? 'on' : isSkip(h, d) ? 'sk' : amount(h, d) ? 'pa' : ''}"></i>`;
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
      <div class="meta">${[freqText(h.freq), TIMES[h.time], F('streaks') && streak(h)].filter(Boolean).join(' · ')}</div></div><div class="pct">${c.pct}%</div></div>
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
  ${F('reminders') ? remindersSection() : ''}
  <h2>הרגלים</h2><div class="group">
    <button data-act="order"><div>סידור ההרגלים</div><div class="s">שינוי הסדר שבו ההרגלים מופיעים</div></button></div>
  <h2>תכונות</h2><div class="group">
    ${Object.entries(FEATURES).map(([k, [t, s]]) => `<label class="sw-row"><span><div>${t}</div><div class="s">${s}</div></span>
      <input type="checkbox" class="switch" data-feat="${k}" ${F(k) ? 'checked' : ''}></label>`).join('')}</div>
  <h2>גיבוי</h2><div class="group">
    <button data-act="export"><div>שמירת גיבוי</div><div class="s">קובץ עם כל ההרגלים וההיסטוריה</div></button>
    <button data-act="restore"><div>שחזור מגיבוי</div><div class="s">מחליף את הנתונים הנוכחיים</div></button>
    <button data-act="astext"><div>העתקה כטקסט</div><div class="s">רשימה מסודרת להדבקה בפתקים</div></button></div>
  <input type="file" id="rfile" accept=".json,application/json" hidden>`;
}

// ---------- push reminders ----------
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const pushState = () => !('Notification' in window) || !('PushManager' in window) ? 'unsupported' : Notification.permission;

function remindersSection() {
  const sum = S.settings?.summary || {};
  const st = pushState(), on = st === 'granted' && localStorage.getItem('steps-push') === '1';
  let status;
  if (!cloudOn()) status = 'כדי לקבל התראות צריך להתחבר לענן (קוד גישה למעלה).';
  else if (!standalone() && /iPhone|iPad/.test(navigator.userAgent)) status = 'באייפון ההתראות עובדות רק מהאפליקציה שבמסך הבית.';
  else if (st === 'unsupported') status = 'הדפדפן הזה לא תומך בהתראות.';
  else if (st === 'denied') status = 'ההתראות חסומות. אפשר להפעיל ב: הגדרות ← צעדים ← עדכונים.';
  return `<h2>תזכורות</h2><div class="group">
    ${status ? `<div class="s" style="font-size:14px">${status}</div>` : on
      ? `<div>ההתראות פעילות במכשיר הזה ✓<div class="btns" style="margin-top:10px"><button class="btn sm soft" data-act="testpush">שלח בדיקה</button><button class="btn sm soft" data-act="pushoff">כבה במכשיר הזה</button></div></div>`
      : `<button data-act="pushon"><div style="color:var(--accent);font-weight:600">הפעלת התראות במכשיר הזה</div><div class="s">שעת תזכורת לכל הרגל בוחרים במסך העריכה שלו</div></button>`}
    <label class="sw-row"><span><div>סיכום ערב</div><div class="s">התראה אחת עם מה שנשאר פתוח היום</div></span>
      <input type="checkbox" class="switch" data-sum="on" ${sum.on ? 'checked' : ''}></label>
    ${sum.on ? `<div class="sw-row"><span>שעה</span><input type="time" id="sumtime" value="${sum.time || '21:00'}"></div>` : ''}</div>`;
}

async function pushOn() {
  try {
    if (await Notification.requestPermission() !== 'granted') { render(); return; }
    const { key } = await api('/push-key');
    if (!key) return toast('השרת עוד לא הוגדר להתראות');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await api('/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
    localStorage.setItem('steps-push', '1'); render(); toast('ההתראות הופעלו ✓');
  } catch { toast('לא הצלחתי להפעיל התראות'); }
}
async function pushOff() {
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await api('/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
  } catch {}
  localStorage.removeItem('steps-push'); render(); toast('ההתראות כובו במכשיר הזה');
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
  let html = `<h3>${isNew ? 'הרגל חדש' : 'עריכה'}</h3>`;
  if (!isNew && view === 'today' && F('skip') && activeOn(d, day)) {
    const sk = d.log[day] === 's';
    html += `<button class="btn soft full" style="margin-top:12px" data-act="skip">${sk ? `ביטול הדילוג (${dayLabel(day)})` : `דילוג על ${dayLabel(day)} ⏭`}</button>`;
  }
  html += `
    <div class="namerow" style="margin-top:12px"><input type="text" class="emoji-in" id="femoji" value="${esc(d.emoji)}" maxlength="4">
    <input type="text" id="fname" value="${esc(d.name)}" placeholder="למשל: לא לעשות כמה דברים במקביל" enterkeyhint="done" autocomplete="off"></div>
    <label>כמה פעמים</label>${chipRow('freq', FREQS, freqKey(d.freq))}
    <label>מתי</label>${chipRow('time', TIME_ORDER.map(t => [t, TIMES[t]]), d.time)}`;
  let extra = '';
  if (F('quantity')) extra += `<label>יעד ליום (לא חובה)</label><div class="namerow">
      <input type="number" id="ftarget" inputmode="numeric" min="1" max="999" value="${d.target > 1 ? d.target : ''}" placeholder="למשל 8" style="width:110px;flex:none">
      <input type="text" id="funit" value="${esc(d.unit || '')}" placeholder="יחידה: כוסות, עמודים, דקות"></div>`;
  if (F('reminders')) extra += `<label>תזכורת (לא חובה)</label><div class="namerow"><input type="time" id="fremind" value="${d.remind || ''}">
      ${d.remind ? '<button class="btn sm soft" data-act="clearremind">בלי תזכורת</button>' : ''}</div>`;
  if (!isNew) {
    html += extra + `<label>מצב</label>${chipRow('status', Object.entries(STATUS), d.status)}
      <label>צבע</label><div class="swatches">${COLORS.map((c, i) => `<button class="sw ${i === d.color ? 'on' : ''}" style="background:${c}" data-act="chip" data-g="color" data-v="${i}"></button>`).join('')}</div>
      <label>עד תאריך (לא חובה)</label><input type="date" id="funtil" value="${d.until || ''}">
      <label>הערה</label><textarea id="fnote" placeholder="למה זה חשוב לי, איך עושים את זה...">${esc(d.note)}</textarea>`;
  } else if (extra) html += `<details class="more"><summary>אפשרויות נוספות</summary>${extra}</details>`;
  html += `<div class="btns"><button class="btn" data-act="${isNew ? 'add' : 'save'}">${isNew ? 'הוסף' : 'שמור'}</button><button class="btn soft" data-act="close">ביטול</button></div>`;
  if (isNew) html += `<button class="btn link full" data-act="import">יש לך רשימה או פתק? ייבוא חכם</button>`;
  else html += `<button class="btn danger full" data-act="del">מחיקת ההרגל</button>`;
  return html;
}

function openQuick() {
  draft = { emoji: '🌱', name: '', freq: { type: 'daily', times: 7 }, time: 'any', color: S.habits.length % COLORS.length };
  openSheet(habitForm(true));
}
const dayLabel = d => d === today() ? 'היום' : d === addDays(today(), -1) ? 'אתמול' : `יום ${DAYS[dow(d)]}`;

function openOrder() {
  const list = S.habits.filter(h => h.status !== 'later');
  openSheet(`<h3>סידור ההרגלים</h3><p class="sub">החיצים מזיזים הרגל למעלה או למטה.</p>
    ${list.map((h, i) => `<div class="ii" style="--c:${COLORS[h.color]}"><div class="emo">${esc(h.emoji)}</div><div class="t"><div class="n">${esc(h.name)}</div></div>
      <button class="btn sm soft" data-act="mv" data-id="${h.id}" data-n="-1" ${i ? '' : 'disabled'} aria-label="למעלה">↑</button>
      <button class="btn sm soft" data-act="mv" data-id="${h.id}" data-n="1" ${i < list.length - 1 ? '' : 'disabled'} aria-label="למטה">↓</button></div>`).join('')}
    <div class="btns"><button class="btn" data-act="close">סיום</button></div>`);
}
function move(id, n) {
  const list = S.habits.filter(h => h.status !== 'later'), i = list.findIndex(h => h.id === id), other = list[i + n];
  if (!other) return;
  const a = S.habits.indexOf(list[i]), b = S.habits.indexOf(other);
  [S.habits[a], S.habits[b]] = [S.habits[b], S.habits[a]];
  save(); const top = sheet.scrollTop; openOrder(); sheet.scrollTop = top;
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
  if ($('#ftarget')) { const t = parseInt($('#ftarget').value, 10); draft.target = t > 1 ? Math.min(t, 999) : null; draft.unit = $('#funit').value.trim(); }
  if ($('#fremind')) draft.remind = $('#fremind').value || null;
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
      const h = byId(id), T = tgt(h);
      if (T > 1) {
        const next = isDone(h, day) ? 0 : amount(h, day) + 1;
        if (next) h.log[day] = next; else delete h.log[day];
        if (next >= T) popId = id;
      } else if (isDone(h, day)) delete h.log[day];
      else { h.log[day] = true; popId = id; }
      save(); render(); break;
    }
    case 'skip': {
      const h = byId(draft.id);
      if (h.log[day] === 's') delete h.log[day]; else h.log[day] = 's';
      save(); closeSheet(); render(); toast(h.log[day] === 's' ? 'דילגת, הרצף והאחוזים לא נפגעים' : 'הדילוג בוטל'); break;
    }
    case 'clearremind': $('#fremind').value = ''; el.remove(); break;
    case 'order': openOrder(); break;
    case 'mv': move(id, +el.dataset.n); break;
    case 'pushon': pushOn(); break;
    case 'pushoff': pushOff(); break;
    case 'testpush': api('/test-push', { method: 'POST' }).then(r => toast(r.sent ? 'נשלחה התראת בדיקה' : 'לא נמצא מכשיר רשום'), () => toast('השליחה נכשלה')); break;
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
      if (!readForm()) { toast('צריך לתת להרגל שם'); return; }
      S.habits.push(newHabit(draft)); save(); closeSheet(); render(); toast('נוסף ✓');
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
  if (t.dataset.feat) { setFeature(t.dataset.feat, t.checked); render(); }
  if (t.dataset.sum) { S.settings = S.settings || {}; S.settings.summary = { time: '21:00', ...(S.settings.summary || {}), on: t.checked }; save(); render(); }
  if (t.id === 'sumtime' && t.value) { S.settings.summary.time = t.value; save(); toast('נשמר'); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'fname') { e.preventDefault(); e.target.blur(); }
});

// Swipe the sheet down to close it, like native iOS sheets.
(() => {
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', e => { if (sheet.scrollTop <= 0 && !e.target.closest('input,textarea')) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0) { sheet.style.transition = 'none'; sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (y0 == null) return;
    sheet.style.transition = ''; sheet.style.transform = '';
    if (dy > 110) closeSheet();
    y0 = null;
  });
})();

if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
window.addEventListener('online', pull);
render();
pull();
