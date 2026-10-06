const http = require("http");
const fs = require("fs");
const path = require("path");
const { SOURCE_URL, parseCalendar, fingerprint } = require("./lib/parseCalendar");
const { scrapeLocalSources, FARMERS_URL, FAIRGROUNDS_URL } = require("./lib/localSources");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data", "content.json");
const PORT = Number(process.env.PORT) || 4173;

function readContent() {
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}

function writeContent(content) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  content.site.lastSaved = new Date().toISOString();
  fs.writeFileSync(DATA, JSON.stringify(content, null, 2));
}

function publicContent(content) {
  const clone = JSON.parse(JSON.stringify(content));
  if (clone.site) delete clone.site.editPin;
  return clone;
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".ico": "image/x-icon",
    }[ext] || "application/octet-stream"
  );
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const isObj = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, {
    "Content-Type": isObj ? "application/json; charset=utf-8" : headers["Content-Type"] || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function pinFrom(req, body) {
  return (
    req.headers["x-edit-pin"] ||
    (body && body.pin) ||
    ""
  );
}

function pinOk(req, content, body) {
  const expected = String(content.site.editPin || "north");
  return pinFrom(req, body) === expected;
}

function mergeOrigin(content, scraped, origin) {
  const incoming = new Map(scraped.map((e) => [e.sourceKey, e]));
  const existing = content.events || [];
  const seen = new Set();
  const next = [];
  const report = { new: [], edited: [], removed: [], unchanged: 0 };

  for (const event of existing) {
    if (event.origin !== origin) {
      next.push(event);
      continue;
    }
    const match = incoming.get(event.sourceKey);
    if (!match) {
      if (event.keepIfRemoved) {
        next.push({ ...event, change: event.change || null });
      } else {
        next.push({ ...event, change: "removed-at-source", visible: event.visible });
        report.removed.push({ id: event.id, title: event.title, date: event.date });
      }
      continue;
    }
    seen.add(event.sourceKey);
    const fp = fingerprint({
      date: match.date,
      title: match.title,
      subtitle: match.subtitle,
      type: match.type,
      endDate: match.endDate,
    });
    const matchFp = match.fingerprint || fp;
    if (event.fingerprint !== matchFp) {
      next.push({
        ...event,
        incoming: match,
        change: "edited",
      });
      report.edited.push({ id: event.id, title: match.title, date: match.date });
    } else {
      next.push({ ...event, change: event.change === "new" ? "new" : null });
      report.unchanged += 1;
    }
  }

  for (const [key, match] of incoming) {
    if (seen.has(key)) continue;
    const slug = `${origin}-${match.date}-${match.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    next.push({
      id: slug,
      ...match,
      change: "new",
    });
    report.new.push({ id: slug, title: match.title, date: match.date });
  }

  next.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.title).localeCompare(b.title));
  content.events = next;
  return report;
}

async function syncAll(content) {
  const combined = {
    riverTech: { new: [], edited: [], removed: [], unchanged: 0, count: 0 },
    farmers: { new: [], edited: [], removed: [], unchanged: 0, count: 0 },
    fairgrounds: { new: [], edited: [], removed: [], unchanged: 0, count: 0 },
    errors: [],
  };

  try {
    const html = await fetch(SOURCE_URL, {
      headers: { "User-Agent": "FYN-Events/1.0" },
    }).then((r) => {
      if (!r.ok) throw new Error(`School calendar returned ${r.status}`);
      return r.text();
    });
    const scraped = parseCalendar(html);
    combined.riverTech = { ...mergeOrigin(content, scraped, "river-tech"), count: scraped.length };
  } catch (err) {
    combined.errors.push(String(err.message || err));
  }

  try {
    const local = await scrapeLocalSources();
    combined.farmers = { ...mergeOrigin(content, local.farmers, "farmers-market"), count: local.farmers.length };
    combined.fairgrounds = {
      ...mergeOrigin(content, local.fairgrounds, "fairgrounds"),
      count: local.fairgrounds.length,
    };
    combined.errors.push(...(local.report.errors || []));
  } catch (err) {
    combined.errors.push(String(err.message || err));
  }

  content.site.lastSynced = new Date().toISOString();
  content.site.sourceUrl = SOURCE_URL;
  content.site.sources = [
    { id: "river-tech", label: "River Tech calendar", url: SOURCE_URL },
    { id: "farmers-market", label: "Kootenai Farmers Markets", url: FARMERS_URL },
    { id: "fairgrounds", label: "Kootenai County Fairgrounds", url: FAIRGROUNDS_URL },
  ];
  writeContent(content);
  return combined;
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(PUBLIC, urlPath));
  if (!file.startsWith(PUBLIC)) {
    send(res, 403, { error: "Forbidden" });
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      send(res, 404, { error: "Not found" });
      return;
    }
    res.writeHead(200, { "Content-Type": mime(file) });
    res.end(buf);
  });
}

function buildStandaloneHtml(content) {
  const html = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(PUBLIC, "styles.css"), "utf8");
  const js = fs.readFileSync(path.join(PUBLIC, "app.js"), "utf8");
  const safe = publicContent(content);
  return html
    .replace(`<link rel="stylesheet" href="/styles.css" />`, `<style>\n${css}\n</style>`)
    .replace(
      `<script src="/app.js"></script>`,
      `<script>window.FYN_EMBEDDED = ${JSON.stringify(safe)};</script>\n<script>\n${js}\n</script>`
    );
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url.split("?")[0];
    if (req.method === "GET" && url === "/api/content") {
      send(res, 200, publicContent(readContent()), { "Content-Type": "application/json; charset=utf-8" });
      return;
    }
    if (req.method === "POST" && url === "/api/unlock") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const content = readContent();
      if (String(body.pin || "") !== String(content.site.editPin || "north")) {
        send(res, 401, { error: "Wrong pin" });
        return;
      }
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === "PUT" && url === "/api/content") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const current = readContent();
      if (!pinOk(req, current, body)) {
        send(res, 401, { error: "Editor pin required to save" });
        return;
      }
      const incoming = body.content || body;
      if (!incoming.site || !Array.isArray(incoming.events)) {
        send(res, 400, { error: "Expected { site, events }" });
        return;
      }
      if (!incoming.site.editPin) incoming.site.editPin = current.site.editPin;
      writeContent(incoming);
      send(res, 200, { ok: true, lastSaved: incoming.site.lastSaved });
      return;
    }
    if (req.method === "POST" && url === "/api/sync") {
      const content = readContent();
      const report = await syncAll(content);
      send(res, 200, { ok: true, report, lastSynced: content.site.lastSynced });
      return;
    }
    if (req.method === "GET" && (url === "/download" || url === "/fyn-events.html")) {
      const html = buildStandaloneHtml(readContent());
      send(res, 200, html, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": 'attachment; filename="fyn-events.html"',
      });
      return;
    }
    serveStatic(req, res);
  } catch (err) {
    send(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`Find Your North events → http://localhost:${PORT}`);
});
