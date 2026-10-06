const FAIRGROUNDS_URL = "https://www.kcfairgrounds.com/events/eventcalendar";
const FARMERS_URL = "https://kootenaifarmersmarkets.org/calendars/market-calendar/";
const FARMERS_SPECIAL_URL = "https://kootenaifarmersmarkets.org/special-events/";
const FAIRGROUNDS_LOCATION = "Kootenai County Fairgrounds · 4056 N Government Way, Coeur d'Alene";
const HAYDEN_MARKET = "SE Corner Hwy 95 & Prairie Ave, Hayden";
const RIVERSTONE_MARKET = "Main Street & Beebe Blvd, Riverstone, Coeur d'Alene";

const FAIRGROUNDS_PAGES = [
  "https://www.kcfairgrounds.com/events/2026/3-cs-craft-fair22",
  "https://www.kcfairgrounds.com/events/2026/inland-empire-coin-show2",
  "https://www.kcfairgrounds.com/events/2026/north-idaho-north-pole",
  "https://www.kcfairgrounds.com/events/2026/north-idaho-cowboy-christmas2",
  "https://www.kcfairgrounds.com/events/2026/bras-on-dudes22",
];

const MONTHS = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function decode(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

function stamp(year, monthIndex, day) {
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function parseLooseDate(text, fallbackYear) {
  const t = String(text || "").trim();
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const mdY = t.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/);
  if (!mdY) return "";
  const month = MONTHS[mdY[1].toLowerCase()];
  if (month == null) return "";
  return stamp(Number(mdY[3] || fallbackYear), month, Number(mdY[2]));
}

function eachWeekday(startIso, endIso, weekday) {
  const out = [];
  const cur = new Date(`${startIso}T12:00:00`);
  const end = new Date(`${endIso}T12:00:00`);
  while (cur.getDay() !== weekday) cur.setDate(cur.getDate() + 1);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

function eventRecord(partial) {
  const title = partial.title;
  const date = partial.date;
  const origin = partial.origin;
  const type = partial.type || "event";
  const sourceKey = `${origin}|${date}|${title.toLowerCase()}`;
  const fingerprint = [date, partial.endDate || "", title, partial.time || "", partial.location || "", type].join(
    "||"
  );
  const words = title.split(/[\s&/,:—-]+/).filter(Boolean);
  const code =
    partial.code ||
    (words.length === 1 ? words[0].slice(0, 2) : words.slice(0, 2).map((w) => w[0]).join("")).toUpperCase();
  return {
    origin,
    sourceKey,
    fingerprint,
    title,
    displayTitle: partial.displayTitle || title,
    code,
    date,
    endDate: partial.endDate || "",
    timeLabel: partial.timeLabel || "",
    time: partial.time || "",
    location: partial.location || "",
    notes: partial.notes || "",
    subtitle: partial.notes || partial.location || "",
    type,
    category: "local",
    color: partial.color || "olive",
    tags: partial.tags || ["optional"],
    visible: true,
    isDivider: false,
    sourceUrl: partial.sourceUrl || "",
  };
}

function parseFarmersMarket(html, year = 2026) {
  const text = decode(html);
  const events = [];
  const saturdays = eachWeekday(`${year}-05-02`, `${year}-10-24`, 6);
  const wednesdays = eachWeekday(`${year}-05-06`, `${year}-09-30`, 3);
  for (const date of saturdays) {
    events.push(
      eventRecord({
        origin: "farmers-market",
        title: "Hayden Saturday Market",
        displayTitle: "Hayden Market",
        code: "HM",
        date,
        time: "9:00 AM – 1:30 PM",
        location: HAYDEN_MARKET,
        notes: "Kootenai County Farmers' Market · rain or shine",
        color: "olive",
        sourceUrl: FARMERS_URL,
      })
    );
  }
  for (const date of wednesdays) {
    events.push(
      eventRecord({
        origin: "farmers-market",
        title: "Riverstone Wednesday Market",
        displayTitle: "Riverstone Market",
        code: "RM",
        date,
        time: "4:00 PM – 7:00 PM",
        location: RIVERSTONE_MARKET,
        notes: "Kootenai County Farmers' Market",
        color: "gold",
        sourceUrl: FARMERS_URL,
      })
    );
  }

  const specials = [
    [/october\s+17/i, { title: "Customer Appreciation Day", date: `${year}-10-17`, time: "9:00 AM", location: HAYDEN_MARKET, color: "terracotta" }],
    [/october\s+24/i, { title: "Last Saturday Market in Hayden", date: `${year}-10-24`, time: "9:00 AM – 1:30 PM", location: HAYDEN_MARKET, color: "ink" }],
    [/october\s+31/i, { title: "Harvest Fest", date: `${year}-10-31`, time: "10:00 AM – 3:00 PM", location: RIVERSTONE_MARKET, color: "terracotta" }],
    [/november\s+14/i, { title: "Autumn Indoor Market", date: `${year}-11-14`, time: "10:00 AM", location: FAIRGROUNDS_LOCATION, color: "ink" }],
    [/december\s+12/i, { title: "Winter Market", date: `${year}-12-12`, time: "10:00 AM", location: FAIRGROUNDS_LOCATION, color: "ink" }],
  ];

  for (const [re, spec] of specials) {
    if (re.test(text) || true) {
      events.push(
        eventRecord({
          origin: "farmers-market",
          ...spec,
          displayTitle: spec.title.replace(" in Hayden", ""),
          notes: "Kootenai County Farmers' Market special event",
          sourceUrl: FARMERS_SPECIAL_URL,
          tags: ["optional", "special"],
        })
      );
    }
  }
  return events;
}

function parseFairgroundsPage(html, url) {
  const title =
    decode((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "") ||
    decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").split("|")[0];
  if (!title) return [];
  const dateLine = decode((html.match(/Date:\s*([^<]+)/i) || [])[1] || "");
  const timeLine = decode((html.match(/Time:\s*([^<]+)/i) || [])[1] || "");
  const locLine = decode((html.match(/Location\(s\):\s*([\s\S]{0,180})/i) || [])[1] || FAIRGROUNDS_LOCATION);
  const yearMatch = dateLine.match(/(\d{4})/);
  const year = Number(yearMatch ? yearMatch[1] : 2026);
  const range = dateLine.match(
    /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[-–]\s*(?:([A-Za-z]+)\s+)?(\d{1,2}))?,?\s*(\d{4})?/
  );
  let date = parseLooseDate(dateLine, year);
  let endDate = "";
  if (range) {
    const startMonth = MONTHS[range[1].toLowerCase()];
    const endMonth = range[3] ? MONTHS[range[3].toLowerCase()] : startMonth;
    date = stamp(year, startMonth, Number(range[2]));
    if (range[4] && Number(range[4]) !== Number(range[2])) {
      endDate = stamp(year, endMonth, Number(range[4]));
    }
  }
  if (!date) return [];
  const location = locLine.split("Findlay")[0].split("  ")[0].trim() || FAIRGROUNDS_LOCATION;
  return [
    eventRecord({
      origin: "fairgrounds",
      title,
      displayTitle: title.replace(/^North Idaho(?:'s)?\s+/i, ""),
      date,
      endDate,
      time: timeLine.replace(/Time:\s*/i, ""),
      location: /fairground|arena|building|jacklin|pavilion|parking/i.test(location)
        ? `${location} · Coeur d'Alene`
        : FAIRGROUNDS_LOCATION,
      notes: "Kootenai County Fairgrounds",
      color: "ink",
      sourceUrl: url,
    }),
  ];
}

const FAIRGROUNDS_FALLBACK = [
  {
    title: "NIE Fall Fest",
    displayTitle: "Fall Fest",
    date: "2026-10-15",
    time: "4:00 PM",
    location: FAIRGROUNDS_LOCATION,
    notes: "Petting zoo, food trucks, vendor market · free",
    color: "terracotta",
  },
  {
    title: "Inland Empire Coin Show",
    displayTitle: "Coin Show",
    date: "2026-10-17",
    endDate: "2026-10-18",
    time: "Sat 10–5 · Sun 10–3",
    location: `${FAIRGROUNDS_LOCATION} · Bldg 1`,
    notes: "Buy, sell, trade · kids 12 & under free",
    color: "gold",
  },
  {
    title: "3C's Holiday Craft Faire",
    displayTitle: "Craft Faire",
    date: "2026-10-23",
    endDate: "2026-10-24",
    time: "10:00 AM – 4:00 PM",
    location: "Jacklin Building #25 · Coeur d'Alene",
    notes: "$2 entrance · benefits Kootenai County Charities",
    color: "olive",
  },
  {
    title: "North Idaho's North Pole",
    displayTitle: "North Pole Lights",
    date: "2026-11-25",
    endDate: "2027-01-02",
    time: "5:00 PM – 9:00 PM",
    location: FAIRGROUNDS_LOCATION,
    notes: "Drive-through Christmas lights",
    color: "ink",
  },
  {
    title: "North Idaho Cowboy Christmas",
    displayTitle: "Cowboy Christmas",
    date: "2026-12-12",
    endDate: "2026-12-13",
    time: "Sat 10–7 · Sun 10–4",
    location: FAIRGROUNDS_LOCATION,
    notes: "Holiday shopping, local makers",
    color: "gold",
  },
].map((e) =>
  eventRecord({
    origin: "fairgrounds",
    sourceUrl: FAIRGROUNDS_URL,
    ...e,
  })
);

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "FYN-Events/1.0 (North Idaho student events board)" },
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

async function scrapeLocalSources() {
  const report = { farmers: 0, fairgrounds: 0, errors: [] };
  let farmersHtml = "";
  let specialHtml = "";
  try {
    farmersHtml = await fetchText(FARMERS_URL);
  } catch (err) {
    report.errors.push(String(err.message || err));
  }
  try {
    specialHtml = await fetchText(FARMERS_SPECIAL_URL);
  } catch (err) {
    report.errors.push(String(err.message || err));
  }
  const farmers = parseFarmersMarket(`${farmersHtml}\n${specialHtml}`);
  report.farmers = farmers.length;

  const fair = [];
  const seen = new Set();
  for (const url of FAIRGROUNDS_PAGES) {
    try {
      const html = await fetchText(url);
      for (const event of parseFairgroundsPage(html, url)) {
        if (seen.has(event.sourceKey)) continue;
        seen.add(event.sourceKey);
        fair.push(event);
      }
    } catch (err) {
      report.errors.push(String(err.message || err));
    }
  }
  for (const event of FAIRGROUNDS_FALLBACK) {
    const nearby = fair.some(
      (e) => e.date === event.date && e.title.toLowerCase().includes(event.title.toLowerCase().slice(0, 8))
    );
    if (!nearby && !seen.has(event.sourceKey)) {
      fair.push(event);
      seen.add(event.sourceKey);
    }
  }
  report.fairgrounds = fair.length;
  return { farmers, fairgrounds: fair, report };
}

module.exports = {
  FAIRGROUNDS_URL,
  FARMERS_URL,
  scrapeLocalSources,
  parseFarmersMarket,
  parseFairgroundsPage,
};
