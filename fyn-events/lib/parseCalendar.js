const SOURCE_URL = "https://www.rivertechschool.com/pages/calendar.html";
const DEFAULT_LOCATION = "The Heart · 927 E Polston Ave, Post Falls";

function decode(html = "") {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&middot;/g, "·")
    .replace(/&Agrave;/g, "À")
    .replace(/&#10003;/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function generateCode(title, location) {
  const loc = (location || "")
    .replace(/The Heart.*/i, "")
    .replace(/No regular school/i, "")
    .replace(/Confirmed/i, "")
    .split("·")[0]
    .trim();
  if (loc && !/no school|ages|week/i.test(loc)) {
    const words = loc.split(/\s+/).filter((w) => /[A-Za-z]/.test(w) && w.length > 1);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    if (words.length === 1 && words[0].length >= 2) return words[0].slice(0, 2).toUpperCase();
  }
  const stop = new Set([
    "the",
    "and",
    "of",
    "a",
    "in",
    "day",
    "field",
    "trip",
    "&",
    "begins",
    "show",
  ]);
  const words = title
    .split(/[\s&/,:—-]+/)
    .filter((w) => w && !stop.has(w.toLowerCase()));
  if (!words.length) return "EV";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  if (words.length === 2) return (words[0][0] + words[1][0]).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function displayTitle(title) {
  return title
    .replace(/\s+Field Trip$/i, "")
    .replace(/\s+Musical$/i, "")
    .replace(/^Fun In The Sun:\s*/i, "")
    .trim();
}

function parseSubtitle(subtitle) {
  const parts = subtitle
    .split("·")
    .map((p) => p.replace(/Confirmed/gi, "").trim())
    .filter(Boolean);
  let time = "";
  let location = "";
  let notes = [];
  for (const part of parts) {
    if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(part) || /all day/i.test(part)) time = part;
    else if (/no school|ages|week|summer/i.test(part)) notes.push(part);
    else if (!location) location = part;
    else notes.push(part);
  }
  return { time, location, notes: notes.join(" · ") };
}

function colorFor(type, index) {
  const byType = {
    fieldtrip: "terracotta",
    performance: "gold",
    event: "olive",
    "no-school": "paper",
    quarter: "ink",
  };
  if (byType[type]) return byType[type];
  return ["terracotta", "gold", "ink", "paper", "olive"][index % 5];
}

function sourceKey(date, title, type) {
  return `${date}|${type}|${title.toLowerCase()}`;
}

function fingerprint(event) {
  return [event.date, event.endDate || "", event.title, event.subtitle || "", event.type].join(
    "||"
  );
}

function isHighSchoolEvent(event) {
  const hay = `${event.title} ${event.displayTitle || ""} ${event.notes || ""} ${event.subtitle || ""}`;
  return /audition|concert|musical|talent show|aladdin|peter pan|alice|senior|ages 12\+|9th|10th|11th|12th|high school/i.test(
    hay
  );
}

function parseCalendar(html) {
  const section = html.split('id="calTimeline"')[1] || html;
  const openRe = /<div class="cal-event"\s+data-date="([^"]+)"\s+data-type="([^"]+)">/g;
  const starts = [];
  let m;
  while ((m = openRe.exec(section))) {
    starts.push({ date: m[1], type: m[2], index: m.index + m[0].length });
  }
  const events = [];
  for (let i = 0; i < starts.length; i++) {
    const { date, type } = starts[i];
    const chunk = section.slice(
      starts[i].index,
      i + 1 < starts.length ? starts[i + 1].index : Math.min(starts[i].index + 1200, section.length)
    );
    const timeLabel = decode((chunk.match(/<time[^>]*>([\s\S]*?)<\/time>/) || [])[1] || "");
    const title = decode((chunk.match(/class="cal-title">([\s\S]*?)<\/div>/) || [])[1] || "");
    const subtitle = decode((chunk.match(/class="cal-subtitle">([\s\S]*?)<\/div>/) || [])[1] || "");
    if (!date || !title) continue;
    const parsed = parseSubtitle(subtitle);
    const location = parsed.location || (type === "no-school" ? "No school" : DEFAULT_LOCATION);
    const time = parsed.time || (type === "fieldtrip" ? "All Day" : type === "quarter" ? "" : "");
    const tags = [];
    if (type === "fieldtrip") tags.push("optional");
    const draft = { title, notes: parsed.notes, subtitle, displayTitle: displayTitle(title) };
    if (isHighSchoolEvent(draft) || type === "performance") tags.push("high-school");
    events.push({
      origin: "river-tech",
      sourceKey: sourceKey(date, title, type),
      fingerprint: fingerprint({ date, title, subtitle, type }),
      title,
      displayTitle: displayTitle(title),
      code: generateCode(title, location),
      date,
      endDate: "",
      timeLabel,
      time,
      location,
      notes: parsed.notes,
      subtitle,
      type,
      category: "river-tech",
      color: colorFor(type, i),
      tags,
      visible: true,
      isDivider: type === "quarter",
    });
  }
  return events;
}

module.exports = {
  SOURCE_URL,
  DEFAULT_LOCATION,
  parseCalendar,
  fingerprint,
  sourceKey,
  generateCode,
  displayTitle,
  isHighSchoolEvent,
};
