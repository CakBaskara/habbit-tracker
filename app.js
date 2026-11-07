"use strict";

// ---------- constants ----------
const CHALLENGE_DAYS = 40;
const DAY_MS = 86400000;
const RING_CIRCUMFERENCE = 2 * Math.PI * 80;

const KEY_HABITS = "habits:list";
const KEY_START = "meta:start";
const KEY_THEME = "meta:theme";
const DAY_PREFIX = "day:";
const TASKS_PREFIX = "tasks:";

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
const STATUS_MARKS = ["", "○", "△", "✕"];
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
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){}
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

const storedDayKeys = () => store.keys(DAY_PREFIX).map(k => k.slice(DAY_PREFIX.length)).sort();
const storedTaskKeys = () => store.keys(TASKS_PREFIX).map(k => k.slice(TASKS_PREFIX.length));

// ---------- dates ----------
function dateKey(d){
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}
function parseKey(k){ const [y,m,d] = k.split("-").map(Number); return new Date(y, m-1, d); }
function sameDay(a, b){ return dateKey(a) === dateKey(b); }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function daysBetween(fromKey, toKey){ return Math.floor((parseKey(toKey) - parseKey(fromKey)) / DAY_MS); }
function fmtShort(d){ return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }

// ---------- state ----------
let habits = [];
let startDate = null;       // dateKey
let sel = new Date();       // selected date
let editing = false;
let expanded = null;        // habit id currently expanded
let view = "daily";         // "daily" | "summary"
let sumFilter = {mode:"30d", from:"", to:""};
let dayCache = {};          // dateKey -> { habitId: {status:0..3, emotion, why, better} }
let taskCache = {};         // dateKey -> [ {id, text, done, rolled} ]  (one-off reminders)

function getDay(dk){
  if(!dayCache[dk]) dayCache[dk] = store.get(DAY_PREFIX+dk, {}) || {};
  return dayCache[dk];
}
function saveDay(dk){ store.set(DAY_PREFIX+dk, getDay(dk)); }
function getTasks(dk){
  if(!taskCache[dk]) taskCache[dk] = store.get(TASKS_PREFIX+dk, []);
  return taskCache[dk];
}
function saveTasks(dk){ store.set(TASKS_PREFIX+dk, getTasks(dk)); }
function saveHabits(){ store.set(KEY_HABITS, habits); }

function updateRecord(habitId, change){
  const dk = dateKey(sel), day = getDay(dk);
  change(day[habitId] || (day[habitId] = {}));
  saveDay(dk);
}

// ---------- stats ----------
function statusOf(rec, habitId){ return (rec[habitId] || {}).status || 0; }
function tally(rec){
  const t = {ok:0, warn:0, miss:0};
  habits.forEach(h => {
    const s = statusOf(rec, h.id);
    if(s === 1) t.ok++; else if(s === 2) t.warn++; else if(s === 3) t.miss++;
  });
  return t;
}
const tallyFor = dk => tally(getDay(dk));

function currentStreak(){
  let d = new Date();
  // if today has nothing yet, start counting from yesterday
  const t = tallyFor(dateKey(d));
  if(t.ok + t.warn + t.miss === 0) d = addDays(d, -1);
  let streak = 0;
  for(let i = 0; i < 400 && tallyFor(dateKey(d)).ok > 0; i++){ streak++; d = addDays(d, -1); }
  return streak;
}
function bestStreak(){
  let best = 0, run = 0, prev = null;
  storedDayKeys().filter(dk => tallyFor(dk).ok > 0).forEach(dk => {
    const cur = parseKey(dk).getTime();
    run = (prev != null && cur - prev === DAY_MS) ? run + 1 : 1;
    best = Math.max(best, run); prev = cur;
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
function emoLabel(name){ const e = EMOS.find(x => x[0] === name); return e ? `${e[2]} ${name}` : name; }

function render(){
  renderHeader();
  renderRing();
  renderWeek();
  renderHabits();
  renderTasks();
  document.querySelector(".barwrap").style.display = (view === "daily" && editing) ? "block" : "none";
  $("addBtn").style.display = editing ? "block" : "none";
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
  const total = habits.length || 1;
  $("pctNum").textContent = Math.round(c.ok/total*100) + "%";
  $("ringFg").style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - c.ok/total));
  $("cOk").textContent = c.ok;
  $("cWarn").textContent = c.warn;
  $("cMiss").textContent = c.miss;
}

function renderWeek(){
  const week = $("week"); week.innerHTML = "";
  const monday = addDays(sel, -((sel.getDay()+6) % 7));
  const today = new Date();
  const total = habits.length || 1;
  for(let i = 0; i < 7; i++){
    const d = addDays(monday, i), c = tallyFor(dateKey(d));
    let dotColor = "var(--line)";
    if(c.ok + c.warn + c.miss > 0){
      const r = c.ok/total;
      dotColor = r >= .8 ? "var(--ok)" : r >= .4 ? "var(--warn)" : (c.ok > 0 ? "var(--ember)" : "var(--miss)");
    }
    const cell = document.createElement("div");
    cell.className = "wc" + (sameDay(d, sel) ? " sel" : "") + (sameDay(d, today) ? " today" : "");
    cell.innerHTML = `<div class="wd">${WEEK_LABELS[i]}</div>
      <div class="wn">${d.getDate()}</div><div class="wdot" style="background:${dotColor}"></div>`;
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
  const day = getDay(dateKey(sel));
  habits.forEach((h, idx) => {
    const rec = day[h.id] || {};
    const st = rec.status || 0;
    const card = document.createElement("div");
    card.className = "habit" + (editing ? " editing" : "") + (expanded === h.id ? " expanded" : "") + (st === 1 ? " done" : "");
    if(editing) card.appendChild(habitEditRow(h, idx));
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
  row.querySelector(".del").onclick = () => { habits.splice(idx, 1); saveHabits(); render(); };
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
    updateRecord(h.id, r => { r.status = ((r.status||0) + 1) % 4; });
    render();
  };

  const emotion = rec.emotion ? emoLabel(rec.emotion) : "";
  const body = document.createElement("div"); body.className = "hbody";
  body.innerHTML = `<div class="hname">${escapeHtml(h.name)}</div>` +
    (h.time ? `<div class="htime">◷ ${escapeHtml(h.time)}${emotion ? "&nbsp;·&nbsp;"+emotion : ""}</div>`
            : (emotion ? `<div class="htime">${emotion}</div>` : ""));
  body.onclick = toggle;

  const caret = document.createElement("div"); caret.className = "caret"; caret.textContent = "▾";
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

// ---------- data: export / reset ----------
function exportData(){
  const dump = {app:"disiplin-40", version:1, exported:new Date().toISOString(),
    habits:store.get(KEY_HABITS, []), start:store.get(KEY_START, null), days:{}, tasks:{}};
  store.keys(DAY_PREFIX).forEach(k => { dump.days[k.slice(DAY_PREFIX.length)] = store.get(k); });
  store.keys(TASKS_PREFIX).forEach(k => { dump.tasks[k.slice(TASKS_PREFIX.length)] = store.get(k); });
  const blob = new Blob([JSON.stringify(dump, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = `disiplin-backup-${dateKey(new Date())}.json`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 150);
}

function resetAllData(){
  [...store.keys(DAY_PREFIX), ...store.keys(TASKS_PREFIX), KEY_HABITS, KEY_START].forEach(k => store.remove(k));
  dayCache = {}; taskCache = {}; expanded = null; editing = false; sumFilter = {mode:"30d", from:"", to:""};
  habits = DEFAULT_HABITS.slice(); saveHabits();
  startDate = dateKey(new Date()); store.set(KEY_START, startDate);
  sel = new Date(); render();
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
  return `<div class="hbar"><div class="top"><span class="nm">${label}</span><span class="ct">${count}</span></div><div class="track"><div class="bar" style="${fillStyle}"></div></div></div>`;
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

  let ok = 0, warn = 0, miss = 0;
  const emoCount = {}; EMOS.forEach(([n]) => emoCount[n] = 0);
  const perHabit = {}; habits.forEach(h => perHabit[h.id] = 0);
  active.forEach(d => habits.forEach(h => {
    const r = d.rec[h.id] || {}, s = r.status || 0;
    if(s === 1){ ok++; perHabit[h.id]++; } else if(s === 2) warn++; else if(s === 3) miss++;
    if(r.emotion && emoCount[r.emotion] != null) emoCount[r.emotion]++;
  }));
  const logged = ok + warn + miss;
  const rate = logged ? Math.round(ok/logged*100) : 0;
  const total = habits.length || 1;
  const tasks = taskTotals();

  const dayBars = active.map(d => {
    const pct = Math.round(tally(d.rec).ok/total*100), dd = parseKey(d.date);
    return `<div class="vbar" title="${d.date}: ${pct}%"><div class="fill" style="height:${Math.max(pct,3)}%"></div><div class="vlab">${dd.getDate()}</div></div>`;
  }).join("");

  const habitBars = habits.map(h => {
    const o = perHabit[h.id] || 0, pct = Math.round(o/active.length*100);
    return hbar(escapeHtml(h.name || "—"), `${o}/${active.length} · ${pct}%`, `width:${pct}%`);
  }).join("");

  const emoMax = Math.max(1, ...Object.values(emoCount));
  const emoBars = EMOS.map(([n, v, emoji]) => {
    const c = emoCount[n] || 0, pct = Math.round(c/emoMax*100);
    return hbar(`${emoji} ${n}`, c, `width:${Math.max(pct, c > 0 ? 6 : 0)}%; background:var(${v})`);
  }).join("");

  el.innerHTML = filterCard + `
    <div class="sum-hero">
      <div class="big disp">${rate}%</div>
      <div class="lbl">on time · ${range.label}</div>
      <div class="sub">${active.length} days logged · ${ok} ○ out of ${logged} marked</div>
    </div>
    <div class="statgrid">
      <div class="stat"><div class="n disp" style="color:var(--ok)">${ok}</div><div class="k">○ on time</div></div>
      <div class="stat"><div class="n disp" style="color:var(--warn)">${warn}</div><div class="k">△ obstacle</div></div>
      <div class="stat"><div class="n disp" style="color:var(--miss)">${miss}</div><div class="k">✕ missed</div></div>
    </div>
    <div class="statgrid">
      <div class="stat"><div class="n disp">${currentStreak()}</div><div class="k">current streak</div></div>
      <div class="stat"><div class="n disp">${bestStreak()}</div><div class="k">best streak</div></div>
      <div class="stat"><div class="n disp">${tasks.done}/${tasks.total}</div><div class="k">tasks done</div></div>
    </div>
    <div class="card"><h3>Daily progress</h3><div class="hint">${active.length} days logged · % on time</div><div class="vbars">${dayBars}</div></div>
    <div class="card"><h3>Habit consistency</h3><div class="hint">how often each habit is ○</div>${habitBars}</div>
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
    habits = habits.filter(h => h.name.trim() !== "");
    saveHabits(); render();
  };
  $("addBtn").onclick = () => {
    habits.push({id:"h"+Date.now(), name:"", time:""}); saveHabits(); render();
    setTimeout(() => { const inputs = document.querySelectorAll(".edit-inp"); if(inputs.length) inputs[inputs.length-2].focus(); }, 30);
  };
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
  habits = store.get(KEY_HABITS, null);
  if(!habits){ habits = DEFAULT_HABITS.slice(); saveHabits(); }
  startDate = store.get(KEY_START, null);
  if(!startDate){ startDate = dateKey(new Date()); store.set(KEY_START, startDate); }
  const theme = store.get(KEY_THEME, "dark");
  document.body.setAttribute("data-theme", theme);
  buildThemeGrid(theme);
  bindControls();
  rolloverTasks();
  render();
}

if("serviceWorker" in navigator){ window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {})); }

init();
