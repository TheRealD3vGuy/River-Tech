const fs = require("fs");
const path = require("path");
const { parseCalendar, SOURCE_URL } = require("./lib/parseCalendar");

const html = fs.readFileSync(path.join(__dirname, "calendar-source.html"), "utf8");
const scraped = parseCalendar(html);

const extras = {
  "2026-10-07|fieldtrip": { displayTitle: "Pumpkin Patch", code: "HA" },
  "2026-10-28|performance": { displayTitle: "Talent Show", code: "KC", tags: ["optional"] },
  "2026-11-04|fieldtrip": { displayTitle: "Bowling Day", code: "RC" },
  "2026-11-11|no-school": { displayTitle: "Veterans Day", code: "VD" },
  "2026-11-18|event": { displayTitle: "Parent-Teacher", code: "PTC" },
};

const schoolEvents = scraped.map((e) => ({
  id: `rt-${e.date}-${e.type}-${e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
  ...e,
  ...(extras[`${e.date}|${e.type}`] || {}),
  change: null,
}));

const localEvents = [
  {
    id: "local-farmers-market",
    origin: "local",
    sourceKey: "",
    fingerprint: "",
    title: "Post Falls Farmers Market",
    displayTitle: "Farmers Market",
    code: "PF",
    date: "2026-10-11",
    endDate: "",
    timeLabel: "Oct 11",
    time: "9:00 AM",
    location: "Downtown Post Falls",
    notes: "Saturdays through October",
    subtitle: "Downtown Post Falls",
    type: "event",
    category: "local",
    color: "olive",
    tags: ["optional"],
    visible: true,
    isDivider: false,
    change: null,
  },
];

const events = [...schoolEvents, ...localEvents];

const content = {
  site: {
    brand: "FIND YOUR NORTH",
    brandShort: "FYN",
    navLabel: "BACK TO MAIN STORE",
    navHref: "https://www.rivertechschool.com/",
    heroKicker: "YOUR ENTERTAINMENT",
    heroTitle: "LOCAL EVENTS\nIN ONE PLACE.",
    heroImage: "/hero.jpg",
    sectionEyebrow: "HIGH SCHOOL SPECIFIC",
    quarterLabel: "1st Quarter",
    filters: [
      { id: "all", label: "ALL" },
      { id: "local", label: "LOCAL" },
      { id: "private", label: "PRIVATE" },
      { id: "river-tech", label: "RIVER TECH" },
    ],
    defaultFilter: "river-tech",
    editPin: "north",
    sourceUrl: SOURCE_URL,
    lastSynced: new Date().toISOString(),
    footerNote: "River Tech Christian School · Post Falls, ID",
    nextEventLabel: "NEXT EVENT",
    optionalLabel: "OPTIONAL",
  },
  events,
};

fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "data", "content.json"), JSON.stringify(content, null, 2));
console.log("seeded", events.length, "events");
