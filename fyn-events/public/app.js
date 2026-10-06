const TYPE_LABELS = {
  fieldtrip: "Field trip",
  performance: "Performance",
  event: "School event",
  "no-school": "No school",
  quarter: "Quarter",
};

const DEFAULT_HS = {
  title: "High School",
  eyebrow: "9TH–12TH · THE HEART, POST FALLS",
  updated: "2026–27 · Quarter 1 · Updated September 17, 2026",
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  rows: [
    { time: "8:30–8:45", kind: "span", cells: ["Assembly"] },
    {
      time: "8:45–9:35",
      cells: [
        "English (CA) · Cafe",
        "English (CA) · Cafe",
        "English (CA) · Cafe",
        "English (CA) · Cafe",
        "English (KI) · Cafe",
      ],
    },
    {
      time: "9:35–10:25",
      cells: [
        "Math (LU) · Cafe",
        "Math (JO) · Cafe",
        "Math (JO) · Cafe",
        "Math (JO) · Cafe",
        "Math (JO) · Cafe",
      ],
    },
    {
      time: "10:25–11:05",
      kind: "prod-start",
      cells: [
        "“Aladdin” & Christmas Concert · Stage\nCostumes AN & CA · Props KA",
        "Organizational Design & Management (PE) · Cafe",
        "Coding / AI (JO) · Cafe",
        "Coding / A.I. (JO) · Cafe",
        "Fine Arts (TI) · Cafe",
      ],
    },
    {
      time: "11:05–11:45",
      kind: "prod-end",
      cells: [
        "",
        "Leadership Mindset (PE) · Cafe",
        "Soc. Studies (CA) · Dance Hall",
        "Year Book (JO) · Cafe",
        "Python (PH) · Cafe",
      ],
    },
    { time: "Lunch", kind: "span", cells: ["Lunch rotation"] },
    {
      time: "1:00–1:40",
      kind: "prod-start",
      cells: [
        "“Peter & Alice — The Way Home” · Stage\nTalent Show & Summer Concert",
        "Filmmaking (RY & LU) · Dance Hall",
        "(A) Dance (CA) · (B) Piano (DA) · (C) Ukulele (LU)",
        "Literature (CA) · Dance Hall",
        "Bible (KI) · Dance Hall",
      ],
    },
    {
      time: "1:40–2:20",
      kind: "prod-end",
      cells: [
        "",
        "Filmmaking (RY & LU) · Dance Hall",
        "Physics (JO) · Cafe",
        "(A) Spanish (CR) · (B) Study Hall (DA)",
        "Robotics (PH) · Robotics",
      ],
    },
  ],
};

const STORAGE_KEY = "fyn-events-draft";
const PIN_KEY = "fyn-edit-pin";
const STANDALONE = Boolean(window.FYN_EMBEDDED) || location.protocol === "file:";

let content = null;
let filterId = "river-tech";
let editing = false;
let editingEventId = null;
let saveTimer = null;
let lastSavedJson = "";
let editPin = sessionStorage.getItem(PIN_KEY) || "";

const $ = (id) => document.getElementById(id);

function todayStamp() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function parseDate(stamp) {
  return new Date(`${stamp}T12:00:00`);
}

function formatDay(event) {
  const start = parseDate(event.date);
  if (event.endDate) {
    const end = parseDate(event.endDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const short = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${short} – ${end}`;
  }
  return start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatWhen(event) {
  return [event.time, formatDay(event)].filter(Boolean).join(" · ");
}

function daysUntil(stamp) {
  const a = parseDate(todayStamp());
  const b = parseDate(stamp);
  return Math.round((b - a) / 86400000);
}

function countdownLabel(stamp) {
  const n = daysUntil(stamp);
  if (n === 0) return "TODAY";
  if (n === 1) return "TOMORROW";
  if (n < 0) return "PASSED";
  return `IN ${n} DAYS`;
}

function splitTitle(title) {
  const words = String(title || "").trim().split(/\s+/);
  if (words.length <= 1) return title;
  const mid = Math.ceil(words.length / 2);
  return `${words.slice(0, mid).join(" ")}<br />${words.slice(mid).join(" ")}`;
}

function splitCode(code) {
  const c = String(code || "EV");
  if (c.length === 1) return c;
  if (c.length === 2) return `${c[0]}<br />${c[1]}`;
  return `${c.slice(0, Math.ceil(c.length / 2))}<br />${c.slice(Math.ceil(c.length / 2))}`;
}

function hasTag(event, tag) {
  return Array.isArray(event.tags) && event.tags.includes(tag);
}

function isHighSchool(event) {
  if (event.category === "high-school" || hasTag(event, "high-school")) return true;
  const hay = `${event.title} ${event.displayTitle || ""} ${event.notes || ""} ${event.subtitle || ""}`;
  return /audition|concert|musical|talent show|aladdin|peter pan|alice|senior|ages 12\+/i.test(hay);
}

function visibleEvents() {
  return (content.events || []).filter((e) => e.visible !== false);
}

function filteredEvents() {
  const all = visibleEvents();
  if (filterId === "all") return all;
  if (filterId === "high-school") {
    return all.filter((e) => e.category === "high-school" || isHighSchool(e));
  }
  return all.filter((e) => e.category === filterId || e.origin === filterId);
}

function nextEvent() {
  const stamp = todayStamp();
  const upcoming = (list) =>
    list
      .filter((e) => !e.isDivider && e.date >= stamp)
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return upcoming(filteredEvents())[0] || upcoming(visibleEvents())[0];
}

function ensureSiteDefaults() {
  content.site = content.site || {};
  if (!content.site.hsSchedule) content.site.hsSchedule = JSON.parse(JSON.stringify(DEFAULT_HS));
  if (!Array.isArray(content.site.filters) || !content.site.filters.some((f) => f.id === "high-school")) {
    content.site.filters = [
      { id: "all", label: "ALL" },
      { id: "high-school", label: "HIGH SCHOOL" },
      { id: "local", label: "LOCAL" },
      { id: "private", label: "PRIVATE" },
      { id: "river-tech", label: "RIVER TECH" },
    ];
  }
  if (!content.site.heroImage || content.site.heroImage === "/hero.jpg") {
    content.site.heroImage =
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1800&q=80";
  }
  if (!content.site.sectionEyebrow) content.site.sectionEyebrow = "HIGH SCHOOL SPECIFIC";
}

function applySite() {
  ensureSiteDefaults();
  const s = content.site;
  $("brandShort").textContent = s.brandShort;
  $("brandName").textContent = s.brand;
  $("navLabel").textContent = s.navLabel;
  $("navLink").href = s.navHref || "#";
  $("heroKicker").textContent = s.heroKicker;
  $("heroTitle").innerHTML = String(s.heroTitle || "")
    .split("\n")
    .join("<br />");
  $("hero").style.setProperty("--hero-image", `url("${s.heroImage}")`);
  $("quarterLabel").textContent = s.quarterLabel;
  const eyebrow =
    filterId === "local"
      ? "NORTH IDAHO LOCAL"
      : filterId === "private"
        ? "PRIVATE EVENTS"
        : filterId === "all"
          ? "SCHOOL + LOCAL"
          : s.sectionEyebrow || "HIGH SCHOOL SPECIFIC";
  $("sectionEyebrow").textContent = eyebrow;
  $("footerNote").textContent = s.footerNote;
  document.title = `${s.brand} — Local Events`;
  renderFilters();
}

function renderFilters() {
  const nav = $("filters");
  nav.innerHTML = "";
  for (const f of content.site.filters) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = f.label;
    btn.className = f.id === filterId ? "active" : "";
    btn.addEventListener("click", () => {
      filterId = f.id;
      render();
    });
    nav.appendChild(btn);
  }
}

function renderNext() {
  const panel = $("nextPanel");
  const next = nextEvent();
  if (!next) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $("nextTitle").textContent = next.displayTitle || next.title;
  $("nextCountdown").textContent = countdownLabel(next.date);
  $("nextWhen").textContent = formatWhen(next);
  $("nextWhere").textContent = next.location || "TBA";
  $("nextWhat").textContent = [TYPE_LABELS[next.type] || next.type, next.notes].filter(Boolean).join(" · ");
}

function cellHtml(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("<br />");
}

function renderHs() {
  const section = $("hsSection");
  const show = filterId === "high-school" || filterId === "river-tech" || filterId === "all";
  section.hidden = !show;
  if (!show) return;
  const hs = content.site.hsSchedule || DEFAULT_HS;
  $("hsTitle").textContent = hs.title || "High School";
  $("hsEyebrow").textContent = hs.eyebrow || "9TH–12TH";
  $("hsUpdated").textContent = hs.updated || "";
  const days = hs.days || DEFAULT_HS.days;
  let html = `<table class="hs-table"><thead><tr><th>Time</th>${days
    .map((d) => `<th>${d}</th>`)
    .join("")}</tr></thead><tbody>`;
  for (const row of hs.rows || []) {
    if (row.kind === "span") {
      html += `<tr><td class="time">${row.time}</td><td class="span" colspan="${days.length}">${cellHtml(
        row.cells[0] || ""
      )}</td></tr>`;
      continue;
    }
    html += `<tr><td class="time">${row.time}</td>`;
    days.forEach((_, i) => {
      const cls = row.kind && row.kind.startsWith("prod") && i === 0 ? "prod" : "";
      html += `<td class="${cls}">${cellHtml(row.cells[i] || "")}</td>`;
    });
    html += "</tr>";
  }
  html += "</tbody></table>";
  $("hsTable").innerHTML = html;
}

function renderGrid() {
  const grid = $("grid");
  const events = filteredEvents().sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
  );
  const upcoming = events.filter((e) => e.date >= todayStamp() || editing);
  const list = upcoming.length ? upcoming : events;
  const next = nextEvent();
  $("eventCount").textContent = `${list.length} EVENT${list.length === 1 ? "" : "S"}`;
  grid.innerHTML = "";

  for (const event of list) {
    const wrap = document.createElement("div");
    wrap.className = "card-wrap";

    if (event.isDivider) {
      wrap.innerHTML = `
        <div class="divider">
          <div>
            <div class="divider-label">${(event.displayTitle || event.title).replace(/ /g, "<br />")}</div>
            <div class="divider-date">${formatWhen(event).toUpperCase()}</div>
          </div>
        </div>`;
      if (editing) wrap.addEventListener("click", () => openEvent(event.id));
      grid.appendChild(wrap);
      continue;
    }

    const tags = [];
    if (next && event.id === next.id) tags.push(`<span class="tag next">${content.site.nextEventLabel || "NEXT EVENT"}</span>`);
    if (hasTag(event, "optional")) tags.push(`<span class="tag">${content.site.optionalLabel || "OPTIONAL"}</span>`);
    if (isHighSchool(event) && filterId === "all") tags.push(`<span class="tag">HS</span>`);
    if (event.change === "new") tags.push(`<span class="tag change">NEW</span>`);
    if (event.change === "edited") tags.push(`<span class="tag change">UPDATED</span>`);
    if (event.change === "removed-at-source") tags.push(`<span class="tag change">REMOVED</span>`);

    const meta = [event.location, event.time, formatDay(event)].filter(Boolean);

    wrap.innerHTML = `
      <div class="tag-row">${tags.join("")}</div>
      <button class="card ${event.color} can-open" type="button">
        <div class="card-head">
          <div class="code">${splitCode(event.code)}</div>
          <h3 class="card-title">${splitTitle(event.displayTitle || event.title)}</h3>
        </div>
        <div class="rule"></div>
        <p class="card-meta">${meta.join("<br />")}</p>
      </button>`;
    wrap.querySelector(".card").addEventListener("click", () => {
      if (editing) openEvent(event.id);
      else openEventRead(event);
    });
    grid.appendChild(wrap);
  }
}

function renderSyncNote() {
  const s = content.site;
  const nNew = content.events.filter((e) => e.change === "new").length;
  const nEdit = content.events.filter((e) => e.change === "edited").length;
  const synced = s.lastSynced
    ? new Date(s.lastSynced).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "never";
  const bits = [`Watching River Tech, farmers markets, and the fairgrounds · last checked ${synced}`];
  if (nNew) bits.push(`${nNew} new`);
  if (nEdit) bits.push(`${nEdit} edited`);
  $("syncNote").textContent = bits.join(" · ");
}

function render() {
  applySite();
  renderNext();
  renderHs();
  renderGrid();
  renderSyncNote();
}

function persistLocal() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ savedAt: Date.now(), filterId, content })
    );
  } catch {
    /* quota */
  }
}

async function saveContent(reason = "saved") {
  persistLocal();
  lastSavedJson = JSON.stringify(content);
  if (STANDALONE) {
    $("syncNote").textContent = `Saved on this device · ${reason}`;
    return true;
  }
  if (!editPin) {
    $("syncNote").textContent = "Saved on this device. Enter the edit pin to publish.";
    return false;
  }
  try {
    const res = await fetch("/api/content", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Edit-Pin": editPin,
      },
      body: JSON.stringify(content),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Save failed");
    }
    $("syncNote").textContent = `Saved · ${reason}`;
    return true;
  } catch (err) {
    $("syncNote").textContent = err.message;
    return false;
  }
}

function scheduleSave() {
  persistLocal();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (JSON.stringify(content) !== lastSavedJson) saveContent("auto");
  }, 800);
}

function restoreLocalDraft(serverContent) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return serverContent;
    const draft = JSON.parse(raw);
    if (!draft.content || !draft.content.site) return serverContent;
    const serverTime = Date.parse(serverContent.site.lastSaved || serverContent.site.lastSynced || 0) || 0;
    if (draft.savedAt >= serverTime) {
      if (draft.filterId) filterId = draft.filterId;
      return draft.content;
    }
  } catch {
    /* ignore */
  }
  return serverContent;
}

function openEventRead(event) {
  $("eventDialogKicker").textContent = TYPE_LABELS[event.type] || event.type;
  $("eventDialogTitle").textContent = event.displayTitle || event.title;
  const form = $("eventForm");
  [...form.elements].forEach((el) => {
    if (el.name) el.disabled = true;
  });
  fillEventForm(event);
  $("incomingBox").hidden = true;
  $("deleteEventBtn").hidden = true;
  $("eventForm").querySelector(".primary").hidden = true;
  $("eventDialog").showModal();
}

function fillEventForm(event) {
  const form = $("eventForm");
  form.displayTitle.value = event.displayTitle || "";
  form.title.value = event.title || "";
  form.code.value = event.code || "";
  form.date.value = event.date || "";
  form.endDate.value = event.endDate || "";
  form.time.value = event.time || "";
  form.location.value = event.location || "";
  form.notes.value = event.notes || "";
  form.type.value = event.type || "event";
  form.category.value = event.category === "high-school" ? "high-school" : event.category || "river-tech";
  form.color.value = event.color || "terracotta";
  form.optional.checked = hasTag(event, "optional");
  form.highSchool.checked = isHighSchool(event);
  form.visible.checked = event.visible !== false;
  form.isDivider.checked = !!event.isDivider;
}

function openEvent(id) {
  editingEventId = id;
  const event = content.events.find((e) => e.id === id);
  if (!event) return;
  [...$("eventForm").elements].forEach((el) => {
    if (el.name) el.disabled = false;
  });
  $("eventDialogKicker").textContent = event.origin === "river-tech" ? "River Tech" : "Custom";
  $("eventDialogTitle").textContent = "Edit event";
  fillEventForm(event);
  $("deleteEventBtn").hidden = false;
  $("eventForm").querySelector(".primary").hidden = false;
  const box = $("incomingBox");
  if (event.incoming) {
    box.hidden = false;
    box.innerHTML = `<strong>Source calendar changed.</strong> ${event.incoming.title} · ${event.incoming.date} · ${
      event.incoming.subtitle || event.incoming.location || "updated details"
    }
      <div class="dialog-actions"><button type="button" id="acceptIncoming">Accept source version</button></div>`;
    box.querySelector("#acceptIncoming").addEventListener("click", () => {
      Object.assign(event, event.incoming, {
        id: event.id,
        change: null,
        incoming: undefined,
        visible: event.visible,
        color: event.color,
        tags: event.tags,
        displayTitle: event.incoming.displayTitle,
        code: event.incoming.code,
      });
      fillEventForm(event);
      box.hidden = true;
      scheduleSave();
    });
  } else {
    box.hidden = true;
    box.innerHTML = "";
  }
  $("eventDialog").showModal();
}

function readEventForm() {
  const form = $("eventForm");
  const tags = [];
  if (form.optional.checked) tags.push("optional");
  if (form.highSchool.checked) tags.push("high-school");
  return {
    displayTitle: form.displayTitle.value.trim(),
    title: form.title.value.trim(),
    code: form.code.value.trim().toUpperCase(),
    date: form.date.value,
    endDate: form.endDate.value,
    time: form.time.value.trim(),
    location: form.location.value.trim(),
    notes: form.notes.value.trim(),
    type: form.type.value,
    category: form.category.value,
    color: form.color.value,
    tags,
    visible: form.visible.checked,
    isDivider: form.isDivider.checked,
  };
}

function setEditing(on) {
  editing = on;
  document.body.classList.toggle("is-editing", on);
  $("editBanner").classList.toggle("hidden", !on);
  sessionStorage.setItem("fyn-editing", on ? "1" : "0");
  render();
}

async function enterEdit() {
  if (sessionStorage.getItem("fyn-unlocked") === "1") {
    setEditing(true);
    return;
  }
  $("pinDialog").showModal();
}

$("pinForm").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancel") return;
  e.preventDefault();
  const pin = $("pinInput").value;
  if (STANDALONE) {
    editPin = pin;
    sessionStorage.setItem(PIN_KEY, pin);
    sessionStorage.setItem("fyn-unlocked", "1");
    $("pinDialog").close();
    setEditing(true);
    return;
  }
  try {
    const res = await fetch("/api/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) {
      $("pinInput").style.borderColor = "#7a2e1f";
      return;
    }
    editPin = pin;
    sessionStorage.setItem(PIN_KEY, pin);
    sessionStorage.setItem("fyn-unlocked", "1");
    $("pinDialog").close();
    setEditing(true);
    saveContent("opened editor");
  } catch {
    $("pinInput").style.borderColor = "#7a2e1f";
  }
});

$("editToggle").addEventListener("click", enterEdit);
$("doneEditBtn").addEventListener("click", async () => {
  await saveContent("left editor");
  setEditing(false);
});
$("saveBtn").addEventListener("click", () => saveContent("manual"));

$("syncBtn").addEventListener("click", async () => {
  $("syncNote").textContent = "Checking River Tech, farmers markets, and the fairgrounds…";
  try {
    if (STANDALONE) throw new Error("Open the live site to sync online calendars.");
    const res = await fetch("/api/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sync failed");
    content = restoreLocalDraft(await (await fetch("/api/content")).json());
    ensureSiteDefaults();
    render();
    persistLocal();
    const r = data.report || {};
    const n = (block) => (block?.new || []).length;
    const e = (block) => (block?.edited || []).length;
    $("syncNote").textContent = `Synced school ${n(r.riverTech)} new / ${e(r.riverTech)} edited · markets ${
      r.farmers?.count || 0
    } dates · fairgrounds ${r.fairgrounds?.count || 0}`;
  } catch (err) {
    $("syncNote").textContent = err.message;
  }
});

$("addEventBtn").addEventListener("click", () => {
  const id = `local-${Date.now()}`;
  content.events.push({
    id,
    origin: "local",
    sourceKey: "",
    fingerprint: "",
    title: "New event",
    displayTitle: "New Event",
    code: "NE",
    date: todayStamp(),
    endDate: "",
    timeLabel: "",
    time: "",
    location: "",
    notes: "",
    subtitle: "",
    type: "event",
    category: filterId === "all" ? "local" : filterId,
    color: "olive",
    tags: ["optional"],
    visible: true,
    isDivider: false,
    change: "new",
  });
  scheduleSave();
  openEvent(id);
});

$("siteSettingsBtn").addEventListener("click", () => {
  const form = $("siteForm");
  const s = content.site;
  form.brandShort.value = s.brandShort;
  form.brand.value = s.brand;
  form.navLabel.value = s.navLabel;
  form.navHref.value = s.navHref;
  form.heroKicker.value = s.heroKicker;
  form.heroTitle.value = s.heroTitle;
  form.heroImage.value = s.heroImage;
  form.quarterLabel.value = s.quarterLabel;
  form.sectionEyebrow.value = s.sectionEyebrow;
  form.hsTitle.value = s.hsSchedule?.title || "";
  form.hsEyebrow.value = s.hsSchedule?.eyebrow || "";
  form.footerNote.value = s.footerNote;
  form.editPin.value = "";
  $("siteDialog").showModal();
});

$("siteForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = $("siteForm");
  Object.assign(content.site, {
    brandShort: form.brandShort.value,
    brand: form.brand.value,
    navLabel: form.navLabel.value,
    navHref: form.navHref.value,
    heroKicker: form.heroKicker.value,
    heroTitle: form.heroTitle.value,
    heroImage: form.heroImage.value,
    quarterLabel: form.quarterLabel.value,
    sectionEyebrow: form.sectionEyebrow.value,
    footerNote: form.footerNote.value,
  });
  content.site.hsSchedule = content.site.hsSchedule || JSON.parse(JSON.stringify(DEFAULT_HS));
  content.site.hsSchedule.title = form.hsTitle.value;
  content.site.hsSchedule.eyebrow = form.hsEyebrow.value;
  if (form.editPin.value.trim()) {
    content.site.editPin = form.editPin.value.trim();
    editPin = content.site.editPin;
    sessionStorage.setItem(PIN_KEY, editPin);
  }
  $("siteDialog").close();
  render();
  scheduleSave();
});

$("cancelSiteBtn").addEventListener("click", () => $("siteDialog").close());
$("cancelEventBtn").addEventListener("click", () => {
  $("eventDialog").close();
  render();
});

$("eventForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const event = content.events.find((x) => x.id === editingEventId);
  if (!event) return;
  Object.assign(event, readEventForm());
  if (event.change === "new" && event.origin === "local") event.change = null;
  $("eventDialog").close();
  render();
  scheduleSave();
});

$("deleteEventBtn").addEventListener("click", () => {
  content.events = content.events.filter((e) => e.id !== editingEventId);
  $("eventDialog").close();
  render();
  scheduleSave();
});

$("eventDialog").addEventListener("close", () => {
  [...$("eventForm").elements].forEach((el) => {
    if (el.name) el.disabled = false;
  });
  $("deleteEventBtn").hidden = false;
  $("eventForm").querySelector(".primary").hidden = false;
});

function openHsEditor() {
  const hs = content.site.hsSchedule || JSON.parse(JSON.stringify(DEFAULT_HS));
  $("hsUpdatedInput").value = hs.updated || "";
  const days = hs.days || DEFAULT_HS.days;
  const editor = $("hsEditor");
  editor.innerHTML = `<table class="hs-edit-table"><thead><tr><th>Time</th>${days
    .map((d) => `<th>${d}</th>`)
    .join("")}</tr></thead><tbody>${(hs.rows || [])
    .map((row, ri) => {
      const cells =
        row.kind === "span"
          ? `<td colspan="${days.length}"><textarea data-row="${ri}" data-cell="0">${row.cells[0] || ""}</textarea></td>`
          : days
              .map(
                (_, i) =>
                  `<td><textarea data-row="${ri}" data-cell="${i}">${row.cells[i] || ""}</textarea></td>`
              )
              .join("");
      return `<tr><td><input data-time="${ri}" value="${row.time || ""}" /></td>${cells}</tr>`;
    })
    .join("")}</tbody></table>`;
  $("hsDialog").showModal();
}

$("editHsBtn").addEventListener("click", openHsEditor);
$("cancelHsBtn").addEventListener("click", () => $("hsDialog").close());
$("hsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const hs = content.site.hsSchedule || JSON.parse(JSON.stringify(DEFAULT_HS));
  hs.updated = $("hsUpdatedInput").value;
  const editor = $("hsEditor");
  editor.querySelectorAll("input[data-time]").forEach((input) => {
    const ri = Number(input.dataset.time);
    hs.rows[ri].time = input.value;
  });
  editor.querySelectorAll("textarea[data-row]").forEach((area) => {
    const ri = Number(area.dataset.row);
    const ci = Number(area.dataset.cell);
    hs.rows[ri].cells[ci] = area.value;
  });
  content.site.hsSchedule = hs;
  $("hsDialog").close();
  render();
  scheduleSave();
});

async function downloadHtml() {
  persistLocal();
  if (!STANDALONE) {
    window.location.href = "/download";
    return;
  }
  const html = document.documentElement.outerHTML;
  const blob = new Blob([`<!DOCTYPE html>\n${html}`], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fyn-events.html";
  a.click();
  URL.revokeObjectURL(a.href);
}

$("downloadBtn").addEventListener("click", downloadHtml);

function onLeave() {
  persistLocal();
  if (JSON.stringify(content) !== lastSavedJson && (editing || sessionStorage.getItem("fyn-unlocked") === "1")) {
    if (STANDALONE || !editPin) return;
    try {
      fetch("/api/content", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Edit-Pin": editPin,
        },
        body: JSON.stringify(content),
        keepalive: true,
      });
    } catch {
      /* ignore */
    }
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") onLeave();
  if (document.visibilityState === "visible" && content) persistLocal();
});
window.addEventListener("pagehide", onLeave);

async function loadServerContent() {
  if (window.FYN_EMBEDDED) return window.FYN_EMBEDDED;
  const res = await fetch("/api/content");
  if (!res.ok) throw new Error("Could not load events");
  return res.json();
}

async function boot() {
  const serverContent = await loadServerContent();
  content = restoreLocalDraft(serverContent);
  ensureSiteDefaults();
  filterId = filterId || content.site.defaultFilter || "river-tech";
  lastSavedJson = JSON.stringify(content);
  persistLocal();
  if (sessionStorage.getItem("fyn-editing") === "1" && sessionStorage.getItem("fyn-unlocked") === "1") {
    setEditing(true);
  } else {
    render();
  }
  if (!STANDALONE) {
    fetch("/api/sync", { method: "POST" })
      .then((r) => r.json())
      .then(async () => {
        const fresh = await (await fetch("/api/content")).json();
        const liveIds = new Set((content.events || []).map((e) => e.id));
        const extras = (fresh.events || []).filter((e) => !liveIds.has(e.id));
        if (extras.length) {
          content.events = [...content.events, ...extras].sort(
            (a, b) => String(a.date).localeCompare(String(b.date))
          );
        }
        for (const incoming of fresh.events || []) {
          const cur = content.events.find((e) => e.id === incoming.id || e.sourceKey === incoming.sourceKey);
          if (cur && incoming.change && incoming.change !== cur.change) cur.change = incoming.change;
          if (cur && incoming.incoming) cur.incoming = incoming.incoming;
        }
        content.site.lastSynced = fresh.site.lastSynced;
        render();
        persistLocal();
      })
      .catch(() => {});
  }
}

boot().catch((err) => {
  document.body.innerHTML = `<p style="padding:2rem">Could not load events. Start the site with <code>node server.js</code>. ${err.message}</p>`;
});
