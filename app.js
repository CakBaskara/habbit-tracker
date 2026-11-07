"use strict";

// ---------- constants ----------
const CHALLENGE_DAYS = 40;
const DAY_MS = 86400000;
const RING_CIRCUMFERENCE = 2 * Math.PI * 80;

const NS = "disiplin40:";
const KEY_HABITS = NS + "habits";
const KEY_START = NS + "start";
const KEY_THEME = NS + "theme";
const DAY_PREFIX = NS + "day:";
const TASKS_PREFIX = NS + "tasks:";

const EMOS = [
  ["Happy","--happy","😊"],["Sad","--sad","😢"],["Fear","--fear","😨"],
  ["Anger","--anger","😡"],["Disgust","--disgust","🤢"],["Surprise","--surprise","😲"]
];
const DEFAULT_HABITS = [
  {id:"h1", name:"Wake up at 05:00", time:"05:00"},
  {id:"h2", name:"Morning prayer / reflection", time:"05:15"},
  {id:"h3", name:"Run / workout", time:"05:45"},
  {id:"h4", name:"Shower + breakfast", time:"06:45"},
  {id:"h5", name:"Deep work / coding", time:"08:00"},
  {id:"h6", name:"Create & edit content", time:"10:00"},
  {id:"h7", name:"Reading", time:"20:00"},
  {id:"h8", name:"Sleep on time", time:"22:30"},
];
const THEMES = [
  {id:"dark",    name:"Dark",    accent:"#A6B2C6", bg:"#0A0F20"},
  {id:"light",   name:"Light",   accent:"#DD8A46", bg:"#F6F4EF"},
  {id:"pink",    name:"Pink",    accent:"#E84B8A", bg:"#FFF0F6"},
  {id:"pastel",  name:"Pastel",  accent:"#8E7CE0", bg:"#F3F1FA"},
  {id:"hutan",   name:"Forest",  accent:"#8FD05A", bg:"#08140D"},
  {id:"samudra", name:"Ocean",   accent:"#5AC8DC", bg:"#05121A"},
];
const STATUS_DONE = 1, STATUS_MISSED = 3;   // 2 was "obstacle" in older data and now reads as missed
const STATUS_MARKS = {[STATUS_DONE]:"✓", [STATUS_MISSED]:"✕"};
const NEXT_STATUS = {0:STATUS_DONE, [STATUS_DONE]:STATUS_MISSED, [STATUS_MISSED]:0};
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];   // Mon..Sun as Date#getDay values
const AYYAMUL_BID = [13, 14, 15];
const DAYNAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEK_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ---------- storage (device localStorage; in-memory fallback) ----------
const memory = {};
const store = {
  get(key, fallback){
    try{ const raw = localStorage.getItem(key); if(raw != null) return JSON.parse(raw); }catch(e){}
    return key in memory ? memory[key] : fallback;
  },
  set(key, value){
    memory[key] = value;
    let ok = true;
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){ ok = false; }
    noteSave(ok);
    return ok;
  },
  probe(){
    try{ localStorage.setItem(NS+"probe", "1"); localStorage.removeItem(NS+"probe"); return true; }
    catch(e){ return false; }
  },
  remove(key){
    delete memory[key];
    try{ localStorage.removeItem(key); }catch(e){}
  },
  keys(prefix){
    const found = new Set();
    try{
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(k && k.startsWith(prefix)) found.add(k);
      }
    }catch(e){}
    Object.keys(memory).forEach(k => { if(k.startsWith(prefix)) found.add(k); });
    return [...found];
  }
};

const isPlainObject = v => v !== null && typeof v === "object" && !Array.isArray(v);
const isDateKey = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const storedDayKeys = () => store.keys(DAY_PREFIX).map(k => k.slice(DAY_PREFIX.length)).filter(isDateKey).sort();
const storedTaskKeys = () => store.keys(TASKS_PREFIX).map(k => k.slice(TASKS_PREFIX.length)).filter(isDateKey);

// Versions before the NS prefix stored data under bare names such as "day:2026-11-07".
function migrateLegacyKeys(){
  if(store.get(KEY_HABITS, null) !== null || !Array.isArray(store.get("habits:list", null))) return;
  const moves = [["habits:list", KEY_HABITS], ["meta:start", KEY_START], ["meta:theme", KEY_THEME]];
  [["day:", DAY_PREFIX], ["tasks:", TASKS_PREFIX]].forEach(([oldPrefix, newPrefix]) =>
    store.keys(oldPrefix).forEach(k => { const dk = k.slice(oldPrefix.length); if(isDateKey(dk)) moves.push([k, newPrefix+dk]); }));
  let copied = true;
  moves.forEach(([from, to]) => { const v = store.get(from, undefined); if(v !== undefined && !store.set(to, v)) copied = false; });
  if(copied) moves.forEach(([from]) => store.remove(from));
}

// ---------- dates ----------
function dateKey(d){
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}
function parseKey(k){ const [y,m,d] = k.split("-").map(Number); return new Date(y, m-1, d); }
function sameDay(a, b){ return dateKey(a) === dateKey(b); }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
// Count through UTC: a local day is 23 or 25 hours long at a daylight-saving change.
function daysBetween(fromKey, toKey){
  const utc = k => { const [y,m,d] = k.split("-").map(Number); return Date.UTC(y, m-1, d); };
  return (utc(toKey) - utc(fromKey)) / DAY_MS;
}
function fmtShort(d){ return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }

// ---------- state ----------
let habits = [];
let startDate = null;       // dateKey
let sel = new Date();       // selected date
let todayKey = dateKey(new Date());
let editing = false;
let expanded = null;        // habit id currently expanded
let view = "daily";         // "daily" | "summary"
let sumFilter = {mode:"30d", from:"", to:""};
let dayCache = {};          // dateKey -> { habitId: {status:0..3, emotion, why, better} }
let taskCache = {};         // dateKey -> [ {id, text, done, rolled} ]  (one-off reminders)
let saveFailed = false;

const defaultHabits = () => DEFAULT_HABITS.map(h => ({...h}));

function getDay(dk){
  if(!dayCache[dk]){ const v = store.get(DAY_PREFIX+dk, {}); dayCache[dk] = isPlainObject(v) ? v : {}; }
  return dayCache[dk];
}
function saveDay(dk){ store.set(DAY_PREFIX+dk, getDay(dk)); }
function getTasks(dk){
  if(!taskCache[dk]){ const v = store.get(TASKS_PREFIX+dk, []); taskCache[dk] = Array.isArray(v) ? v.filter(isPlainObject) : []; }
  return taskCache[dk];
}
function saveTasks(dk){ store.set(TASKS_PREFIX+dk, getTasks(dk)); }
function saveHabits(){ store.set(KEY_HABITS, habits); }

function updateRecord(habitId, change){
  const dk = dateKey(sel), day = getDay(dk);
  if(!isPlainObject(day[habitId])) day[habitId] = {};
  change(day[habitId]);
  saveDay(dk);
}

// ---------- schedule ----------
// Umm al-Qura can differ by a day from a local Hijri calendar; marking a habit makes it count that day anyway.
const hijriFormat = (() => { try{ return new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {day:"numeric"}); }catch(e){ return null; } })();
const hijriCache = {};
function hijriDay(dk){
  if(!(dk in hijriCache)){
    const part = hijriFormat && hijriFormat.formatToParts(parseKey(dk)).find(p => p.type === "day");
    hijriCache[dk] = part ? Number(part.value) : 0;
  }
  return hijriCache[dk];
}
const habitDays = h => Array.isArray(h.days) ? h.days : [];
function isScheduled(h, dk){
  const days = habitDays(h);
  if(!days.length && !h.hijri) return true;
  return days.includes(parseKey(dk).getDay()) || (!!h.hijri && AYYAMUL_BID.includes(hijriDay(dk)));
}
function scheduleLabel(h){
  const days = habitDays(h);
  const parts = days.length ? [WEEKDAY_ORDER.filter(n => days.includes(n)).map(n => WEEK_LABELS[WEEKDAY_ORDER.indexOf(n)]).join(", ")] : [];
  if(h.hijri) parts.push("13–15 Hijri");
  return parts.join(" + ");
}

// ---------- stats ----------
function statusOf(rec, habitId){ const s = (rec[habitId] || {}).status || 0; return s === 2 ? STATUS_MISSED : s; }
const dueHabits = (dk, rec = getDay(dk)) => habits.filter(h => isScheduled(h, dk) || statusOf(rec, h.id) > 0);
function tally(dk, rec = getDay(dk)){
  const t = {ok:0, miss:0, due:0};
  dueHabits(dk, rec).forEach(h => {
    const s = statusOf(rec, h.id);
    t.due++;
    if(s === STATUS_DONE) t.ok++; else if(s === STATUS_MISSED) t.miss++;
  });
  return t;
}
const tallyFor = dk => tally(dk);

const dayComplete = dk => { const t = tallyFor(dk); return t.due > 0 && t.ok === t.due; };

function currentStreak(){
  let d = new Date();
  // today is still in progress, so an unfinished today does not break the streak
  if(!dayComplete(dateKey(d))) d = addDays(d, -1);
  let streak = 0;
  for(let i = 0; i < 400 && dayComplete(dateKey(d)); i++){ streak++; d = addDays(d, -1); }
  return streak;
}
function bestStreak(){
  let best = 0, run = 0, prev = null;
  storedDayKeys().filter(dayComplete).forEach(dk => {
    run = (prev !== null && daysBetween(prev, dk) === 1) ? run + 1 : 1;
    best = Math.max(best, run); prev = dk;
  });
  return best;
}
function taskTotals(){
  let total = 0, done = 0;
  storedTaskKeys().forEach(dk => { const tasks = getTasks(dk); total += tasks.length; done += tasks.filter(t => t.done).length; });
  return {total, done};
}

// ---------- render: daily ----------
const $ = id => document.getElementById(id);

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
function emoLabel(name){ const e = EMOS.find(x => x[0] === name); return e ? `${e[2]} ${name}` : escapeHtml(name); }

function render(){
  renderHeader();
  renderRing();
  renderWeek();
  renderHabits();
  renderTasks();
  document.querySelector(".barwrap").style.display = (view === "daily" && editing) ? "block" : "none";
  $("addBtn").style.display = editing ? "block" : "none";
  if(view === "summary") renderSummary();
}

function renderHeader(){
  const dayNo = daysBetween(startDate, dateKey(sel)) + 1;
  $("dateBig").textContent = `${sel.getDate()} ${MONTHS[sel.getMonth()]}`;
  $("weekday").textContent = DAYNAMES[sel.getDay()] + " " + sel.getFullYear();
  $("dayNo").textContent = (dayNo >= 1 && dayNo <= CHALLENGE_DAYS) ? String(dayNo).padStart(2,"0") : (dayNo < 1 ? "–" : CHALLENGE_DAYS + "+");
  $("streak").textContent = currentStreak();
  $("navDate").textContent = `${DAYNAMES[sel.getDay()]}, ${sel.getDate()} ${MONTHS[sel.getMonth()]}`;
  $("todayBtn").style.display = sameDay(sel, new Date()) ? "none" : "block";
}

function renderRing(){
  const c = tallyFor(dateKey(sel));
  const ratio = c.due ? c.ok/c.due : 0;
  $("pctNum").textContent = Math.round(ratio*100) + "%";
  $("ringFg").style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - ratio));
  $("cOk").textContent = c.ok;
  $("cMiss").textContent = c.miss;
}

function renderWeek(){
  const week = $("week"); week.innerHTML = "";
  const monday = addDays(sel, -((sel.getDay()+6) % 7));
  const today = new Date();
  for(let i = 0; i < 7; i++){
    const d = addDays(monday, i), c = tallyFor(dateKey(d));
    let dotColor = "var(--line)";
    if(c.ok + c.miss > 0){
      const r = c.ok/c.due;
      dotColor = r >= .8 ? "var(--ok)" : r >= .4 ? "var(--warn)" : (c.ok > 0 ? "var(--ember)" : "var(--miss)");
    }
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "wc" + (sameDay(d, sel) ? " sel" : "") + (sameDay(d, today) ? " today" : "");
    cell.setAttribute("aria-label", `${DAYNAMES[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`);
    cell.innerHTML = `<span class="wd">${WEEK_LABELS[i]}</span>
      <span class="wn">${d.getDate()}</span><span class="wdot" style="background:${dotColor}"></span>`;
    cell.onclick = () => selectDate(d);
    week.appendChild(cell);
  }
}

function renderHabits(){
  const list = $("list"); list.innerHTML = "";
  if(habits.length === 0){
    list.innerHTML = `<div class="empty">No habits yet.<br>Tap “Edit habits” and add one to begin.</div>`;
    return;
  }
  const dk = dateKey(sel), day = getDay(dk);
  const due = new Set(dueHabits(dk, day).map(h => h.id));
  const indexed = habits.map((h, idx) => [h, idx]);
  const ordered = editing ? indexed : [...indexed.filter(([h]) => due.has(h.id)), ...indexed.filter(([h]) => !due.has(h.id))];
  ordered.forEach(([h, idx]) => {
    const rec = day[h.id] || {};
    const st = statusOf(day, h.id);
    const card = document.createElement("div");
    card.className = "habit" + (editing ? " editing" : "") + (expanded === h.id ? " expanded" : "")
      + (st === STATUS_DONE ? " done" : "") + (!editing && !due.has(h.id) ? " offday" : "");
    if(editing) card.append(habitEditRow(h, idx), scheduleRow(h));
    else card.append(habitRow(h, rec, st), habitDetail(h, rec));
    list.appendChild(card);
  });
}

function habitEditRow(h, idx){
  const row = document.createElement("div"); row.className = "hrow";
  row.innerHTML =
    `<input class="edit-inp" value="${escapeHtml(h.name)}" placeholder="Habit name">
     <input class="edit-inp edit-time mono" value="${escapeHtml(h.time||"")}" placeholder="00:00">
     <button class="del" aria-label="Delete">✕</button>`;
  const [nameInput, timeInput] = row.querySelectorAll("input");
  nameInput.oninput = () => { h.name = nameInput.value; saveHabits(); };
  timeInput.oninput = () => { h.time = timeInput.value; saveHabits(); };
  const del = row.querySelector(".del");
  let timer = null;
  const disarm = () => { del.classList.remove("arm"); del.textContent = "✕"; del.setAttribute("aria-label", "Delete"); };
  del.onclick = () => {
    if(!del.classList.contains("arm")){
      del.classList.add("arm"); del.textContent = "Delete?"; del.setAttribute("aria-label", "Tap again to delete");
      timer = setTimeout(disarm, 3500);
      return;
    }
    clearTimeout(timer); habits.splice(idx, 1); saveHabits(); render();
  };
  return row;
}

function scheduleRow(h){
  const row = document.createElement("div"); row.className = "sched";
  const hint = document.createElement("span"); hint.className = "sched-hint";
  const chips = [];
  const refresh = () => {
    chips.forEach(({b, on}) => { b.classList.toggle("on", on()); b.setAttribute("aria-pressed", String(on())); });
    hint.textContent = scheduleLabel(h) ? "" : "Every day";
  };
  const addChip = (label, on, toggle) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "schip"; b.textContent = label;
    b.onclick = () => { toggle(); refresh(); saveHabits(); };
    chips.push({b, on}); row.appendChild(b);
  };
  WEEKDAY_ORDER.forEach((n, i) => addChip(WEEK_LABELS[i], () => habitDays(h).includes(n), () => {
    const days = habitDays(h).includes(n) ? habitDays(h).filter(x => x !== n) : [...habitDays(h), n];
    if(days.length && !(days.length === 7 && !h.hijri)) h.days = days.sort(); else delete h.days;
  }));
  addChip("13–15 Hijri", () => !!h.hijri, () => {
    if(h.hijri) delete h.hijri; else h.hijri = true;
    if(habitDays(h).length === 7 && !h.hijri) delete h.days;
  });
  row.appendChild(hint);
  refresh();
  return row;
}

function habitRow(h, rec, st){
  const row = document.createElement("div"); row.className = "hrow";
  const toggle = () => { expanded = expanded === h.id ? null : h.id; render(); };

  const stBtn = document.createElement("button");
  stBtn.className = "status" + (st ? " s"+st : "");
  stBtn.textContent = STATUS_MARKS[st] || "";
  stBtn.setAttribute("aria-label", "Change status");
  stBtn.onclick = (e) => {
    e.stopPropagation();
    updateRecord(h.id, r => { r.status = NEXT_STATUS[r.status === 2 ? STATUS_MISSED : (r.status || 0)] || 0; });
    render();
  };

  const meta = [h.time ? "◷ " + escapeHtml(h.time) : "", escapeHtml(scheduleLabel(h)), rec.emotion ? emoLabel(rec.emotion) : ""].filter(Boolean);
  const body = document.createElement("div"); body.className = "hbody";
  body.innerHTML = `<div class="hname">${escapeHtml(h.name)}</div>` +
    (meta.length ? `<div class="htime">${meta.join("&nbsp;·&nbsp;")}</div>` : "");
  body.onclick = toggle;

  const caret = document.createElement("button"); caret.type = "button"; caret.className = "caret"; caret.textContent = "▾";
  caret.setAttribute("aria-label", "Feelings and notes");
  caret.setAttribute("aria-expanded", String(expanded === h.id));
  caret.onclick = toggle;

  row.append(stBtn, body, caret);
  return row;
}

function habitDetail(h, rec){
  const det = document.createElement("div"); det.className = "detail";
  const inner = document.createElement("div"); inner.className = "detail-inner";
  inner.innerHTML = `<div class="dlabel">How it felt</div>`;

  const emos = document.createElement("div"); emos.className = "emos";
  EMOS.forEach(([name, cssVar, emoji]) => {
    const b = document.createElement("button");
    b.className = "emo" + (rec.emotion === name ? " on" : "");
    b.style.setProperty("--emoc", `var(${cssVar})`);
    b.innerHTML = `<span class="eemo">${emoji}</span>${name}`;
    b.onclick = () => { updateRecord(h.id, r => { r.emotion = r.emotion === name ? null : name; }); render(); };
    emos.appendChild(b);
  });

  const notesLabel = document.createElement("div"); notesLabel.className = "dlabel"; notesLabel.textContent = "Notes";
  inner.append(emos, notesLabel,
    noteField(h, rec, "why", "Why did it feel that way?"),
    noteField(h, rec, "better", "What could be better…"));
  det.appendChild(inner);
  det.inert = expanded !== h.id;
  return det;
}

function noteField(h, rec, field, placeholder){
  const ta = document.createElement("textarea"); ta.rows = 2; ta.placeholder = placeholder;
  ta.value = rec[field] || "";
  ta.oninput = () => updateRecord(h.id, r => { r[field] = ta.value; });
  return ta;
}

// ---------- additional tasks (one-off, per day) ----------
function renderTasks(){
  const dk = dateKey(sel), tasks = getTasks(dk);
  $("taskCount").textContent = `${tasks.filter(t => t.done).length} / ${tasks.length} done`;
  const el = $("taskList"); el.innerHTML = "";
  if(tasks.length === 0){ el.innerHTML = `<div class="tempty">No extra tasks for today yet.</div>`; return; }
  tasks.forEach((t, i) => {
    const row = document.createElement("div"); row.className = "task" + (t.done ? " done" : "");
    const chk = document.createElement("button"); chk.className = "tcheck" + (t.done ? " on" : "");
    chk.textContent = t.done ? "✓" : ""; chk.setAttribute("aria-label", "Mark done");
    chk.onclick = () => { t.done = !t.done; saveTasks(dk); render(); };
    const txt = document.createElement("div"); txt.className = "ttext";
    txt.innerHTML = (t.rolled && !t.done ? `<span class="rolled" title="Carried over from a previous day">↪</span> ` : "") + escapeHtml(t.text);
    const del = document.createElement("button"); del.className = "tdel"; del.textContent = "✕";
    del.setAttribute("aria-label", "Delete task");
    del.onclick = () => { tasks.splice(i, 1); saveTasks(dk); render(); };
    row.append(chk, txt, del); el.appendChild(row);
  });
}

function addTaskFromInput(){
  const input = $("taskInput"), text = input.value.trim();
  if(!text) return;
  const dk = dateKey(sel);
  getTasks(dk).push({id:"t"+Date.now(), text, done:false}); saveTasks(dk);
  input.value = ""; render(); input.focus();
}

// carry unfinished tasks from past days into today
function rolloverTasks(){
  const today = dateKey(new Date());
  const todayTasks = getTasks(today);
  let moved = 0;
  storedTaskKeys().forEach(dk => {
    if(dk >= today) return;                       // only strictly past days
    const tasks = getTasks(dk);
    const carry = tasks.filter(t => !t.done);
    if(!carry.length) return;
    carry.forEach(t => todayTasks.push({id:"t"+Date.now()+Math.random().toString(36).slice(2,6), text:t.text, done:false, rolled:true}));
    taskCache[dk] = tasks.filter(t => t.done); saveTasks(dk);
    moved += carry.length;
  });
  if(moved) saveTasks(today);
  return moved;
}

function checkNewDay(){
  const now = dateKey(new Date());
  if(now === todayKey) return;
  const wasOnToday = dateKey(sel) === todayKey;
  todayKey = now;
  rolloverTasks();
  if(wasOnToday){ sel = new Date(); expanded = null; }
  render();
}

// ---------- data: save warning / export / import / reset ----------
function noteSave(ok){
  if(saveFailed === !ok) return;
  saveFailed = !ok;
  const banner = $("saveWarn");
  if(banner) banner.hidden = !saveFailed;
}

function exportData(){
  const dump = {app:"disiplin-40", version:1, exported:new Date().toISOString(),
    habits:store.get(KEY_HABITS, []), start:store.get(KEY_START, null), days:{}, tasks:{}};
  storedDayKeys().forEach(dk => { dump.days[dk] = store.get(DAY_PREFIX+dk); });
  storedTaskKeys().forEach(dk => { dump.tasks[dk] = store.get(TASKS_PREFIX+dk); });
  const blob = new Blob([JSON.stringify(dump, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = `disiplin-backup-${dateKey(new Date())}.json`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 150);
}

function readBackup(dump){
  if(!isPlainObject(dump) || dump.app !== "disiplin-40" || !Array.isArray(dump.habits)) return null;
  const datedEntries = (obj, valid) => isPlainObject(obj) ? Object.entries(obj).filter(([dk, v]) => isDateKey(dk) && valid(v)) : [];
  return {
    exported: typeof dump.exported === "string" ? dump.exported.slice(0, 10) : "",
    habits: dump.habits.filter(h => isPlainObject(h) && typeof h.id === "string"),
    start: isDateKey(dump.start) ? dump.start : dateKey(new Date()),
    days: datedEntries(dump.days, isPlainObject),
    tasks: datedEntries(dump.tasks, Array.isArray),
  };
}

async function importFromFile(file){
  let backup = null;
  try{ backup = readBackup(JSON.parse(await file.text())); }catch(e){}
  if(!backup){ alert("This file is not a Discipline backup."); return; }
  const from = backup.exported ? ` from ${backup.exported}` : "";
  if(!confirm(`Replace all current data with this backup${from}?\n${backup.habits.length} habits, ${backup.days.length} days of records.`)) return;
  clearAppData();
  habits = backup.habits; saveHabits();
  startDate = backup.start; store.set(KEY_START, startDate);
  backup.days.forEach(([dk, rec]) => store.set(DAY_PREFIX+dk, rec));
  backup.tasks.forEach(([dk, tasks]) => store.set(TASKS_PREFIX+dk, tasks));
  rolloverTasks();
  render();
}

function clearAppData(){
  storedDayKeys().forEach(dk => store.remove(DAY_PREFIX+dk));
  storedTaskKeys().forEach(dk => store.remove(TASKS_PREFIX+dk));
  [KEY_HABITS, KEY_START].forEach(k => store.remove(k));
  dayCache = {}; taskCache = {}; expanded = null; editing = false; sumFilter = {mode:"30d", from:"", to:""};
  sel = new Date();
}

function resetAllData(){
  clearAppData();
  habits = defaultHabits(); saveHabits();
  startDate = dateKey(new Date()); store.set(KEY_START, startDate);
  render();
}

// ---------- summary ----------
function summaryRange(){
  const today = new Date(); today.setHours(0,0,0,0);
  const f = sumFilter;
  if(f.mode === "7d")  return {from:addDays(today,-6),  to:today, label:"Last 7 days"};
  if(f.mode === "30d") return {from:addDays(today,-29), to:today, label:"Last 30 days"};
  if(f.mode === "month"){
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return {from, to:today, label:`${MONTHS[today.getMonth()]} ${today.getFullYear()}`};
  }
  if(f.mode === "custom"){
    const from = f.from ? parseKey(f.from) : null, to = f.to ? parseKey(f.to) : null;
    return {from, to, label:`${from ? fmtShort(from) : "…"} – ${to ? fmtShort(to) : "…"}`};
  }
  return {from:null, to:null, label:"All time"};
}

function hbar(label, count, fillStyle){
  return `<div class="hbar"><div class="top"><span class="nm">${label}</span><span class="ct">${count}</span></div><div class="track"><div class="meter" style="${fillStyle}"></div></div></div>`;
}

function renderSummary(){
  const el = $("viewSummary");
  const range = summaryRange();
  const inRange = dk => {
    const t = parseKey(dk).getTime();
    if(range.from && t < range.from.getTime()) return false;
    if(range.to && t > range.to.getTime()) return false;
    return true;
  };

  const chips = [["7d","7 Days"],["30d","30 Days"],["month","This Month"],["all","All"],["custom","Custom"]]
    .map(([m, lbl]) => `<button class="fchip${sumFilter.mode === m ? " on" : ""}" data-m="${m}">${lbl}</button>`).join("");
  const customUI = sumFilter.mode === "custom" ? `<div class="frange">
      <label>From<input type="date" id="fFrom" value="${sumFilter.from||""}"></label>
      <label>To<input type="date" id="fTo" value="${sumFilter.to||""}"></label></div>` : "";
  const filterCard = `<div class="filtercard">
      <div class="filttop"><span class="filtlbl">Period</span><span class="filtval">${range.label}</span></div>
      <div class="fchips">${chips}</div>${customUI}</div>`;

  const active = storedDayKeys().filter(inRange)
    .map(dk => ({date:dk, rec:getDay(dk)}))
    .filter(d => habits.some(h => statusOf(d.rec, h.id) > 0));

  const bind = () => {
    el.querySelectorAll(".fchip").forEach(b => b.onclick = () => { sumFilter.mode = b.dataset.m; renderSummary(); });
    const ff = el.querySelector("#fFrom"); if(ff) ff.onchange = () => { sumFilter.from = ff.value; renderSummary(); };
    const ft = el.querySelector("#fTo"); if(ft) ft.onchange = () => { sumFilter.to = ft.value; renderSummary(); };
  };

  if(active.length === 0){
    el.innerHTML = filterCard + `<div class="sum-empty">No data in this period.<br>Try another range, or start marking your habits.</div>`;
    bind(); return;
  }

  let ok = 0, miss = 0, possible = 0;
  const emoCount = {}; EMOS.forEach(([n]) => emoCount[n] = 0);
  const perHabit = {}, perHabitDue = {}; habits.forEach(h => { perHabit[h.id] = 0; perHabitDue[h.id] = 0; });
  active.forEach(d => {
    dueHabits(d.date, d.rec).forEach(h => {
      const s = statusOf(d.rec, h.id);
      possible++; perHabitDue[h.id]++;
      if(s === STATUS_DONE){ ok++; perHabit[h.id]++; } else if(s === STATUS_MISSED) miss++;
    });
    habits.forEach(h => { const r = d.rec[h.id] || {}; if(r.emotion && emoCount[r.emotion] != null) emoCount[r.emotion]++; });
  });
  const unmarked = possible - ok - miss;
  const rate = possible ? Math.round(ok/possible*100) : 0;
  const tasks = taskTotals();

  const dayBars = active.map(d => {
    const t = tally(d.date, d.rec), pct = t.due ? Math.round(t.ok/t.due*100) : 0, dd = parseKey(d.date);
    return `<div class="vbar" title="${d.date}: ${pct}%"><div class="fill" style="height:${Math.max(pct,3)}%"></div><div class="vlab">${dd.getDate()}</div></div>`;
  }).join("");

  const habitBars = habits.map(h => {
    const o = perHabit[h.id], due = perHabitDue[h.id], pct = due ? Math.round(o/due*100) : 0;
    return hbar(escapeHtml(h.name || "—"), `${o}/${due} · ${pct}%`, `width:${pct}%`);
  }).join("");

  const emoMax = Math.max(1, ...Object.values(emoCount));
  const emoBars = EMOS.map(([n, v, emoji]) => {
    const c = emoCount[n] || 0, pct = Math.round(c/emoMax*100);
    return hbar(`${emoji} ${n}`, c, `width:${Math.max(pct, c > 0 ? 6 : 0)}%; background:var(${v})`);
  }).join("");

  el.innerHTML = filterCard + `
    <div class="sum-hero">
      <div class="big disp">${rate}%</div>
      <div class="lbl">done · ${range.label}</div>
      <div class="sub">${active.length} days logged · ${ok} of ${possible} done</div>
    </div>
    <div class="statgrid">
      <div class="stat"><div class="n disp" style="color:var(--ok)">${ok}</div><div class="k">✓ done</div></div>
      <div class="stat"><div class="n disp" style="color:var(--miss)">${miss}</div><div class="k">✕ not done</div></div>
      <div class="stat"><div class="n disp">${unmarked}</div><div class="k">not marked</div></div>
    </div>
    <div class="statgrid">
      <div class="stat"><div class="n disp">${currentStreak()}</div><div class="k">current streak</div></div>
      <div class="stat"><div class="n disp">${bestStreak()}</div><div class="k">best streak</div></div>
      <div class="stat"><div class="n disp">${tasks.done}/${tasks.total}</div><div class="k">tasks done</div></div>
    </div>
    <div class="card"><h3>Daily progress</h3><div class="hint">${active.length} days logged · % done</div><div class="vbars">${dayBars}</div></div>
    <div class="card"><h3>Habit consistency</h3><div class="hint">done on the days it was due</div>${habitBars}</div>
    <div class="card"><h3>Emotion spread</h3><div class="hint">which feelings show up most</div>${emoBars}</div>
  `;
  bind();
}

// ---------- navigation ----------
function selectDate(d){ sel = d; expanded = null; render(); }

function setView(v){
  view = v;
  $("segDaily").classList.toggle("active", v === "daily");
  $("segSummary").classList.toggle("active", v === "summary");
  $("viewDaily").style.display = v === "daily" ? "block" : "none";
  $("viewSummary").style.display = v === "summary" ? "block" : "none";
  document.querySelector(".barwrap").style.display = (v === "daily" && editing) ? "block" : "none";
  if(v === "summary") renderSummary();
  window.scrollTo(0, 0);
}

// ---------- themes ----------
function buildThemeGrid(current){
  const grid = $("themeGrid"); grid.innerHTML = "";
  THEMES.forEach(t => {
    const b = document.createElement("button");
    b.className = "swatch" + (t.id === current ? " on" : "");
    b.innerHTML = `<span class="sw" style="background:${t.accent}"></span>${t.name}`;
    b.onclick = () => setTheme(t.id);
    grid.appendChild(b);
  });
}
function setTheme(id){ document.body.setAttribute("data-theme", id); store.set(KEY_THEME, id); buildThemeGrid(id); }

// ---------- controls ----------
function bindControls(){
  $("prev").onclick = () => selectDate(addDays(sel, -1));
  $("next").onclick = () => selectDate(addDays(sel, 1));
  $("todayBtn").onclick = () => selectDate(new Date());
  $("segDaily").onclick = () => setView("daily");
  $("segSummary").onclick = () => setView("summary");
  $("taskAdd").onclick = addTaskFromInput;
  $("taskInput").addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); addTaskFromInput(); } });
  $("doneBtn").onclick = () => {
    editing = false;
    habits = habits.filter(h => String(h.name || "").trim() !== "");
    saveHabits(); render();
  };
  $("addBtn").onclick = () => {
    habits.push({id:"h"+Date.now(), name:"", time:""}); saveHabits(); render();
    setTimeout(() => { const inputs = document.querySelectorAll(".edit-inp"); if(inputs.length) inputs[inputs.length-2].focus(); }, 30);
  };
  $("saveWarnExport").onclick = exportData;
  bindMenu();
}

function bindMenu(){
  const panel = $("menuPanel"), button = $("menuBtn");
  const main = $("menuMain"), addSub = $("menuAdd"), themeSub = $("menuTheme");
  const backToMain = () => { main.style.display = "block"; addSub.classList.remove("show"); themeSub.classList.remove("show"); };
  const showSub = el => { main.style.display = "none"; el.classList.add("show"); };
  const closeMenu = () => { panel.classList.remove("open"); backToMain(); };

  button.onclick = (e) => {
    e.stopPropagation();
    if(!panel.classList.contains("open")) backToMain();
    panel.classList.toggle("open");
  };
  document.addEventListener("click", (e) => {
    if(panel.classList.contains("open") && !panel.contains(e.target) && e.target !== button) closeMenu();
  });
  document.querySelectorAll("[data-back]").forEach(b => b.onclick = (e) => { e.stopPropagation(); backToMain(); });
  $("mAddNav").onclick = (e) => { e.stopPropagation(); showSub(addSub); setTimeout(() => $("taskInput").focus(), 80); };
  $("mThemeNav").onclick = (e) => { e.stopPropagation(); showSub(themeSub); };
  $("mEdit").onclick = (e) => {
    e.stopPropagation();
    if(view !== "daily") setView("daily");
    editing = true; expanded = null; closeMenu(); render();
  };
  $("mExport").onclick = () => { closeMenu(); exportData(); };
  $("mImport").onclick = () => { closeMenu(); $("importFile").click(); };
  $("importFile").onchange = (e) => { const file = e.target.files[0]; e.target.value = ""; if(file) importFromFile(file); };

  const reset = $("mReset"), label = reset.innerHTML;
  let armed = false, timer = null;
  const disarm = () => { armed = false; reset.innerHTML = label; reset.classList.remove("arm"); };
  reset.onclick = (e) => {
    e.stopPropagation();
    if(!armed){
      armed = true; reset.innerHTML = '<span class="mi">↺</span>Sure? Tap again'; reset.classList.add("arm");
      timer = setTimeout(disarm, 3500);
    } else {
      clearTimeout(timer); disarm(); closeMenu(); resetAllData();
    }
  };
}

// ---------- init ----------
function init(){
  migrateLegacyKeys();
  noteSave(store.probe());
  const savedHabits = store.get(KEY_HABITS, null);
  if(Array.isArray(savedHabits)) habits = savedHabits.filter(isPlainObject);
  else { habits = defaultHabits(); saveHabits(); }
  startDate = store.get(KEY_START, null);
  if(!isDateKey(startDate)){ startDate = dateKey(new Date()); store.set(KEY_START, startDate); }
  const theme = store.get(KEY_THEME, "dark");
  document.body.setAttribute("data-theme", theme);
  buildThemeGrid(theme);
  bindControls();
  rolloverTasks();
  render();
  document.addEventListener("visibilitychange", () => { if(!document.hidden) checkNewDay(); });
  setInterval(checkNewDay, 60000);
}

if("serviceWorker" in navigator){ window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {})); }

init();
