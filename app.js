const KEY = 'steps-v1';
const BUCKETS = { daily: 'יומי', building: 'בהטמעה', existing: 'קיימים', wish: 'נחשקים' };
const ORDER = ['daily', 'building', 'existing', 'wish'];
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

let S = load();
let view = 'today';
let day = today();
let addBucket = 'daily';
let checkQueue = null;
let importItems = null;
let importLastCheck = null;

const $ = s => document.querySelector(s);
const main = $('#main'), veil = $('#veil'), sheet = $('#sheet');

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { habits: [], lastCheck: null }; }
  catch { return { habits: [], lastCheck: null }; }
}
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function today() { return iso(new Date()); }
function addDays(s, n) { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); }
function fmt(s) { if (!s) return ''; const [y, m, d] = s.split('-'); return `${+d}.${+m}.${y.slice(2)}`; }
function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5); }
function ago(s) { const n = daysBetween(s, today()); return n === 0 ? 'היום' : n === 1 ? 'אתמול' : `לפני ${n} ימים`; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const byId = id => S.habits.find(h => h.id === id);

function newHabit(name, bucket, extra = {}) {
  return {
    id: uid(), name, bucket,
    percent: bucket === 'building' ? 0 : null,
    start: bucket === 'building' ? today() : null,
    end: null, updated: null, track: bucket === 'daily', log: {}, note: '',
    ...extra
  };
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---------- render ----------
function render() {
  document.querySelectorAll('nav [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === view));
  main.innerHTML = view === 'today' ? viewToday() : view === 'habits' ? viewHabits() : viewCheck();
}

function dayLabel(d) {
  const n = daysBetween(d, today());
  if (n === 0) return 'היום';
  if (n === 1) return 'אתמול';
  return `יום ${DAYS[new Date(d + 'T12:00').getDay()]}, ${fmt(d)}`;
}

function weekCount(h, d) {
  let c = 0;
  for (let i = 0; i < 7; i++) if (h.log[addDays(d, -i)]) c++;
  return c;
}

function viewToday() {
  const list = S.habits.filter(h => h.track && h.bucket !== 'wish');
  const done = list.filter(h => h.log[day]).length;
  let html = `<div class="daynav">
    <button class="btn link" data-act="day" data-n="-1">→ יום קודם</button>
    <strong>${dayLabel(day)}</strong>
    <button class="btn link" data-act="day" data-n="1" ${day >= today() ? 'disabled' : ''}>יום הבא ←</button>
  </div>`;
  if (!list.length) {
    return html + `<div class="empty">אין עדיין הרגלים למעקב יומי.<br>לחץ על + להוספה, או ייבא את הפתק דרך "עוד".</div>`;
  }
  html += `<p class="sub">${done} מתוך ${list.length} בוצעו</p>`;
  for (const h of list) {
    const on = !!h.log[day];
    html += `<div class="row">
      <button class="check ${on ? 'on' : ''}" data-act="tick" data-id="${h.id}" aria-label="סמן">${on ? '✓' : ''}</button>
      <div class="t" data-act="edit" data-id="${h.id}"><div class="n">${esc(h.name)}</div>
      <div class="meta">השבוע ${weekCount(h, day)}/7</div></div></div>`;
  }
  return html;
}

function habitRow(h) {
  let meta = [];
  let late = false;
  if (h.percent != null) meta.push(`${h.percent}%`);
  if (h.end) { meta.push(`יעד ${fmt(h.end)}`); late = h.end < today() && h.bucket === 'building'; }
  if (h.bucket === 'building' && h.updated) meta.push(`עודכן ${ago(h.updated)}`);
  if (h.track) meta.push('מעקב יומי');
  return `<button class="row" data-act="edit" data-id="${h.id}"><div class="t">
    <div class="n">${esc(h.name)}</div>
    ${meta.length ? `<div class="meta ${late ? 'late' : ''}">${meta.join(' · ')}</div>` : ''}
    ${h.percent != null ? `<div class="bar"><i style="width:${h.percent}%"></i></div>` : ''}
  </div></button>`;
}

function viewHabits() {
  if (!S.habits.length) return `<h1>הרגלים</h1><div class="empty">עוד אין הרגלים.<br>לחץ על + או ייבא את הפתק דרך "עוד".</div>`;
  let html = `<h1>הרגלים</h1>`;
  for (const b of ORDER) {
    const list = S.habits.filter(h => h.bucket === b);
    html += `<h2><span>${BUCKETS[b]}</span><span>${list.length}</span></h2>`;
    html += list.map(habitRow).join('') || `<p class="sub">ריק</p>`;
  }
  return html;
}

function viewCheck() {
  const building = S.habits.filter(h => h.bucket === 'building');
  let html = `<h1>בדיקת סטטוס</h1>`;
  if (checkQueue) {
    const h = byId(checkQueue[0]);
    if (!h) { checkQueue.shift(); return checkQueue.length ? viewCheck() : finishCheck(); }
    const total = building.length, pos = total - checkQueue.length + 1;
    return html + `<p class="sub">${pos} מתוך ${total}</p>
    <div class="card">
      <div class="n" style="font-size:18px;font-weight:600">${esc(h.name)}</div>
      <div class="meta">${h.start ? 'התחלה ' + fmt(h.start) : ''}${h.updated ? ' · עודכן ' + ago(h.updated) : ''}</div>
      <div class="big" id="cpct">${h.percent ?? 0}%</div>
      <input type="range" min="0" max="100" step="5" value="${h.percent ?? 0}" id="crange">
      <label>תאריך יעד</label>
      <input type="date" id="cend" value="${h.end || ''}">
      <div class="btns">
        <button class="btn" data-act="cnext" data-id="${h.id}">שמור והמשך</button>
        <button class="btn ghost" data-act="cdone" data-id="${h.id}">הוטמע ← לקיימים</button>
      </div>
      <div class="btns"><button class="btn link" data-act="cskip">דלג</button>
      <button class="btn link" data-act="cstop">סיים עכשיו</button></div>
    </div>`;
  }
  html += `<p class="sub">${S.lastCheck ? `בדיקה אחרונה: ${fmt(S.lastCheck)} (${ago(S.lastCheck)})` : 'עוד לא בוצעה בדיקה'}</p>`;
  if (!building.length) return html + `<div class="empty">אין הרגלים בהטמעה.</div>`;
  html += `<p>עוברים על כל הרגל בהטמעה, מעדכנים אחוז ותאריך יעד.</p>
    <button class="btn" style="width:100%" data-act="cstart">התחל בדיקה (${building.length})</button>
    <h2><span>לפי עדכון אחרון</span></h2>`;
  const sorted = [...building].sort((a, b) => (a.updated || '').localeCompare(b.updated || ''));
  return html + sorted.map(habitRow).join('');
}

function finishCheck() {
  checkQueue = null;
  S.lastCheck = today(); save();
  toast('הבדיקה נשמרה');
  return viewCheck();
}

// ---------- sheets ----------
function openSheet(html) { sheet.innerHTML = html; veil.classList.add('open'); }
function closeSheet() { veil.classList.remove('open'); sheet.innerHTML = ''; importItems = null; }

function chips(cur, act) {
  return `<div class="chips">${ORDER.map(b => `<button class="chip ${b === cur ? 'on' : ''}" data-act="${act}" data-b="${b}">${BUCKETS[b]}</button>`).join('')}</div>`;
}

function openQuick() {
  openSheet(`<h3>הרגל חדש</h3>
    <input type="text" id="qname" placeholder="למשל: Don't multitask" enterkeyhint="done" autocomplete="off">
    <label>לאן?</label>${chips(addBucket, 'qb')}
    <div class="btns"><button class="btn" data-act="qadd">הוסף</button><button class="btn ghost" data-act="close">סגור</button></div>`);
  $('#qname').focus();
}

function quickAdd() {
  const inp = $('#qname'); const name = inp.value.trim();
  if (!name) return;
  S.habits.push(newHabit(name, addBucket)); save(); render();
  inp.value = ''; inp.focus(); toast('נוסף ✓');
}

function openEdit(id) {
  const h = byId(id); if (!h) return;
  openSheet(`<h3>עריכת הרגל</h3>
    <input type="text" id="ename" value="${esc(h.name)}">
    <label>קטגוריה</label><select id="ebucket">${ORDER.map(b => `<option value="${b}" ${b === h.bucket ? 'selected' : ''}>${BUCKETS[b]}</option>`).join('')}</select>
    <label>סטטוס: <span id="epv">${h.percent ?? '—'}</span>%</label>
    <input type="range" min="0" max="100" step="5" id="epct" value="${h.percent ?? 0}">
    <div class="two"><div><label>התחלה</label><input type="date" id="estart" value="${h.start || ''}"></div>
    <div><label>יעד</label><input type="date" id="eend" value="${h.end || ''}"></div></div>
    <label class="toggle"><input type="checkbox" id="etrack" ${h.track ? 'checked' : ''}> מעקב יומי (מופיע במסך "היום")</label>
    <label>הערה</label><textarea id="enote">${esc(h.note)}</textarea>
    <div class="btns"><button class="btn" data-act="esave" data-id="${id}">שמור</button><button class="btn ghost" data-act="close">ביטול</button></div>
    <div class="btns"><button class="btn danger" data-act="edel" data-id="${id}">מחק הרגל</button></div>`);
  sheet.dataset.pctTouched = h.percent == null ? '' : '1';
}

function saveEdit(id) {
  const h = byId(id);
  const name = $('#ename').value.trim(); if (!name) return toast('צריך שם');
  const bucket = $('#ebucket').value;
  const pct = +$('#epct').value;
  const touched = sheet.dataset.pctTouched === '1';
  if (touched && pct !== h.percent) { h.percent = pct; h.updated = today(); }
  if (bucket === 'building' && h.bucket !== 'building') {
    if (h.percent == null) { h.percent = 0; h.updated = today(); }
    if (!$('#estart').value) $('#estart').value = today();
  }
  Object.assign(h, { name, bucket, start: $('#estart').value || null, end: $('#eend').value || null, track: $('#etrack').checked, note: $('#enote').value });
  save(); closeSheet(); render();
}

function openMenu() {
  openSheet(`<h3>עוד</h3>
    <button class="row" data-act="import"><div class="t"><div class="n">ייבוא מטקסט</div><div class="meta">הדבק פתק הרגלים, האפליקציה תסדר אותו</div></div></button>
    <button class="row" data-act="export"><div class="t"><div class="n">גיבוי</div><div class="meta">שמירת קובץ עם כל הנתונים</div></div></button>
    <button class="row" data-act="restore"><div class="t"><div class="n">שחזור מגיבוי</div><div class="meta">טעינת קובץ גיבוי (מחליף את הקיים)</div></div></button>
    <button class="row" data-act="astext"><div class="t"><div class="n">העתק כטקסט</div><div class="meta">בפורמט הפתק, להדבקה בפתקים</div></div></button>
    <input type="file" id="rfile" accept=".json,application/json" hidden>
    <div class="btns"><button class="btn ghost" data-act="close">סגור</button></div>`);
}

// ---------- import ----------
const DATE_RE = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g;
function toIso(s) {
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/); if (!m) return null;
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function headerOf(line) {
  const head = line.slice(0, 30);
  if (/^בדיקת סטטוס/.test(line)) return 'skip';
  if (/^שיפורים בעצמי/.test(line)) return 'stop';
  if (!/^(הרגלי|הרגלים|habits?\b|morning|daily|in progress|building|existing|current|wish)/i.test(line)) return null;
  if (/בהטמעה|in progress|building/i.test(head)) return 'building';
  if (/קיימים|מיושמים|existing|current/i.test(head)) return 'existing';
  if (/נחשקים|רצויים|עתידיים|wish/i.test(head)) return 'wish';
  if (/בוקר|יומי|במהלך היום|morning|daily/i.test(head)) return 'daily';
  return null;
}

function parseItem(line, bucket) {
  let percent = null, start = null, end = null;
  const pm = line.match(/(\d{1,3})\s*%/);
  if (pm) percent = Math.min(100, +pm[1]);
  for (const m of line.matchAll(DATE_RE)) {
    const d = toIso(m[0]);
    if (pm && m.index < pm.index) start = start || d; else end = d;
  }
  let name = line
    .replace(/\s*\((?=[^)]*(%|\d{1,2}\.\d{1,2}\.\d{2,4}))[^)]*\)\s*\.?$/, '')
    .replace(/\s+\d{1,3}\s*%\s*$/, '')
    .replace(/^(?:[-–•*]|\d+[.)])\s+/, '')
    .replace(/[\s\-–:]+$/, '')
    .trim();
  return { name: name || line, bucket, percent, start, end, track: bucket === 'daily' };
}

const norm = s => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

function parseNote(text) {
  const items = []; let bucket = null, lastCheck = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const lc = line.match(/בדיקה אחרונה:?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/);
    if (lc) { lastCheck = toIso(lc[1]); continue; }
    const h = headerOf(line);
    if (h) { bucket = h; continue; }
    if (bucket === 'stop' || bucket === 'skip') continue;
    if (/^(הערה|הטמעת הרגלים)/.test(line)) continue;
    items.push(parseItem(line, bucket));
  }
  const merged = [];
  for (const it of items) {
    const dup = merged.find(m => norm(m.name) === norm(it.name));
    if (!dup) { merged.push(it); continue; }
    if (it.bucket === 'building') dup.bucket = 'building';
    dup.track = dup.track || it.track;
    dup.percent = it.percent ?? dup.percent; dup.start = it.start || dup.start; dup.end = it.end || dup.end;
  }
  const have = new Set(S.habits.map(h => norm(h.name)));
  merged.forEach(m => { m.include = !have.has(norm(m.name)); m.exists = have.has(norm(m.name)); });
  return { items: merged, lastCheck };
}

function openImport() {
  openSheet(`<h3>ייבוא מטקסט</h3>
    <p class="sub">הדבק את פתק ההרגלים. כותרות כמו "הרגלי בוקר", "הרגלים בהטמעה", "קיימים", "נחשקים" ממיינות אוטומטית, ואחוזים ותאריכים (70% - 30.6.26) נקלטים.</p>
    <textarea id="itext" style="min-height:200px" placeholder="הדבק כאן..."></textarea>
    <div class="btns"><button class="btn" data-act="iparse">המשך</button><button class="btn ghost" data-act="close">ביטול</button></div>`);
}

function renderImportPreview() {
  const need = importItems.filter(i => i.include && !i.bucket).length;
  const n = importItems.filter(i => i.include).length;
  let html = `<h3>בדיקה לפני ייבוא</h3>
    <p class="sub">${importItems.length} פריטים זוהו${importLastCheck ? ` · בדיקה אחרונה ${fmt(importLastCheck)}` : ''}.
    ${need ? `<strong style="color:var(--warn)">לאן שייכים ${need} פריטים? בחר קטגוריה.</strong>` : 'אפשר לתקן שם או קטגוריה לפני הייבוא.'}</p>`;
  importItems.forEach((it, i) => {
    const meta = [it.percent != null ? it.percent + '%' : '', it.start ? 'התחלה ' + fmt(it.start) : '', it.end ? 'יעד ' + fmt(it.end) : '', it.exists ? 'קיים כבר' : ''].filter(Boolean).join(' · ');
    html += `<div class="imp ${it.include && !it.bucket ? 'need' : ''}">
      <input type="text" data-in="${i}" value="${esc(it.name)}">
      <div class="two"><label class="toggle" style="margin:0;flex:none"><input type="checkbox" data-inc="${i}" ${it.include ? 'checked' : ''}></label>
      <select data-ib="${i}"><option value="">— בחר —</option>${ORDER.map(b => `<option value="${b}" ${b === it.bucket ? 'selected' : ''}>${BUCKETS[b]}</option>`).join('')}</select></div>
      ${meta ? `<div class="meta">${meta}</div>` : ''}</div>`;
  });
  html += `<div class="btns"><button class="btn" data-act="igo" ${need || !n ? 'disabled' : ''}>ייבא ${n} הרגלים</button><button class="btn ghost" data-act="close">ביטול</button></div>`;
  const top = sheet.scrollTop;
  sheet.innerHTML = html; sheet.scrollTop = top;
}

function doImport() {
  const base = importLastCheck || today();
  let n = 0;
  for (const it of importItems) {
    if (!it.include || !it.bucket) continue;
    S.habits.push(newHabit(it.name, it.bucket, {
      percent: it.percent ?? (it.bucket === 'building' ? 0 : null),
      start: it.start || null, end: it.end || null,
      updated: it.percent != null ? base : null,
      track: it.track || it.bucket === 'daily'
    }));
    n++;
  }
  if (importLastCheck && (!S.lastCheck || importLastCheck > S.lastCheck)) S.lastCheck = importLastCheck;
  save(); closeSheet(); view = 'habits'; render(); toast(`יובאו ${n} הרגלים`);
}

// ---------- backup ----------
async function exportJson() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
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
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.habits)) throw 0;
      if (!confirm(`לשחזר ${d.habits.length} הרגלים? הנתונים הנוכחיים יוחלפו.`)) return;
      S = d; save(); closeSheet(); render(); toast('שוחזר');
    } catch { toast('קובץ לא תקין'); }
  };
  r.readAsText(file);
}

function asText() {
  const lines = ['הטמעת הרגלים 👣', ''];
  const title = { daily: 'הרגלי בוקר ו/או במהלך היום', existing: 'הרגלים קיימים', building: 'הרגלים בהטמעה (תחילת ביצוע - סטטוס[%] - סוף ביצוע)', wish: 'הרגלים נחשקים' };
  for (const b of ['daily', 'existing', 'building', 'wish']) {
    const list = S.habits.filter(h => h.bucket === b); if (!list.length) continue;
    lines.push(title[b]);
    for (const h of list) {
      const parts = [h.start && fmt(h.start), h.percent != null && h.percent + '%', h.end && fmt(h.end)].filter(Boolean);
      lines.push(parts.length ? `${h.name} (${parts.join(' - ')})` : h.name);
    }
    lines.push('');
  }
  if (S.lastCheck) lines.push('בדיקה אחרונה: ' + fmt(S.lastCheck));
  return lines.join('\n');
}

// ---------- events ----------
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) { view = go.dataset.go; if (view === 'today') day = today(); render(); return; }
  const el = e.target.closest('[data-act]'); if (!el) { if (e.target === veil) closeSheet(); return; }
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'quick': addBucket = view === 'today' ? 'daily' : addBucket; openQuick(); break;
    case 'qb': addBucket = el.dataset.b; sheet.querySelectorAll('[data-act=qb]').forEach(c => c.classList.toggle('on', c === el)); $('#qname').focus(); break;
    case 'qadd': quickAdd(); break;
    case 'close': closeSheet(); break;
    case 'menu': openMenu(); break;
    case 'day': day = addDays(day, +el.dataset.n); if (day > today()) day = today(); render(); break;
    case 'tick': { const h = byId(id); if (h.log[day]) delete h.log[day]; else h.log[day] = true; save(); render(); break; }
    case 'edit': openEdit(id); break;
    case 'esave': saveEdit(id); break;
    case 'edel': if (confirm('למחוק את ההרגל?')) { S.habits = S.habits.filter(h => h.id !== id); save(); closeSheet(); render(); } break;
    case 'cstart':
      checkQueue = S.habits.filter(h => h.bucket === 'building').sort((a, b) => (a.updated || '').localeCompare(b.updated || '')).map(h => h.id);
      render(); break;
    case 'cnext': case 'cdone': {
      const h = byId(id);
      h.percent = +$('#crange').value; h.end = $('#cend').value || null; h.updated = today();
      if (el.dataset.act === 'cdone') { h.bucket = 'existing'; h.percent = 100; }
      save(); checkQueue.shift();
      if (checkQueue.length) render(); else main.innerHTML = finishCheck();
      break;
    }
    case 'cskip': checkQueue.shift(); if (checkQueue.length) render(); else main.innerHTML = finishCheck(); break;
    case 'cstop': main.innerHTML = finishCheck(); break;
    case 'import': openImport(); break;
    case 'iparse': {
      const t = $('#itext').value; if (!t.trim()) return;
      const r = parseNote(t); importItems = r.items; importLastCheck = r.lastCheck;
      if (!importItems.length) return toast('לא זוהו הרגלים');
      renderImportPreview(); break;
    }
    case 'igo': doImport(); break;
    case 'export': exportJson(); break;
    case 'restore': $('#rfile').click(); break;
    case 'astext': navigator.clipboard.writeText(asText()).then(() => toast('הועתק'), () => toast('ההעתקה נכשלה')); break;
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'crange') $('#cpct').textContent = t.value + '%';
  if (t.id === 'epct') { $('#epv').textContent = t.value; sheet.dataset.pctTouched = '1'; }
  if (t.dataset.in != null) importItems[t.dataset.in].name = t.value;
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'rfile' && t.files[0]) restoreJson(t.files[0]);
  if (t.dataset.inc != null) { importItems[t.dataset.inc].include = t.checked; renderImportPreview(); }
  if (t.dataset.ib != null) { importItems[t.dataset.ib].bucket = t.value || null; renderImportPreview(); }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'qname') { e.preventDefault(); quickAdd(); }
});

if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
render();
