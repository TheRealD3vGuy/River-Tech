const fs = require("fs");
const t = fs.readFileSync("calendar-source.html", "utf8");
const re =
  /<div class="cal-event" data-date="([^"]+)" data-type="([^"]+)">([\s\S]*?)<\/div>\s*<\/div>/g;
const dec = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&middot;/g, "·")
    .replace(/&Agrave;/g, "À")
    .replace(/<[^>]+>/g, "")
    .trim();
let m;
const rows = [];
while ((m = re.exec(t))) {
  const block = m[3];
  const title = (block.match(/cal-title">([\s\S]*?)<\/div>/) || [])[1] || "";
  const sub = (block.match(/cal-subtitle">([\s\S]*?)<\/div>/) || [])[1] || "";
  rows.push({ date: m[1], type: m[2], title: dec(title), subtitle: dec(sub) });
}
console.log(JSON.stringify(rows, null, 2));
console.error("count", rows.length);
