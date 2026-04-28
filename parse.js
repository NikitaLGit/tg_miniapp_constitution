#!/usr/bin/env node
// parse.js — parses Russian Constitution from kremlin.ru (static HTML)
// Anchors: id="#chapter-N" for chapters, id="article-N" for articles
// Run once: node parse.js
// Or with local file: node parse.js --file kremlin.html

const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const URL = "http://www.kremlin.ru/acts/constitution/item";

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120",
        "Accept": "text/html",
        "Accept-Language": "ru-RU,ru;q=0.9",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location.startsWith("http")
          ? res.headers.location
          : "http://www.kremlin.ru" + res.headers.location)
          .then(resolve).catch(reject);
        return;
      }
      const c = [];
      res.on("data", d => c.push(d));
      res.on("end", () => resolve(Buffer.concat(c).toString("utf8")));
    }).on("error", reject)
      .setTimeout(30000, function() { this.destroy(); reject(new Error("timeout")); });
  });
}

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ")
    .trim();
}

function parse(html) {
  const tokens = [];

  const chRe = /id="#chapter-(\d+)"/g;
  let cm;
  while ((cm = chRe.exec(html)) !== null) {
    const h2Start = html.lastIndexOf("<h2", cm.index);
    const h2End   = html.indexOf("</h2>", cm.index);
    if (h2Start === -1 || h2End === -1) continue;
    const title = stripTags(html.slice(h2Start, h2End + 5))
      .replace(/^.*?Глава\s+\d+[.\s]+/i, "")
      .trim();
    tokens.push({ type: "chapter", pos: h2Start, num: parseInt(cm[1], 10), title });
  }

  const artRe = /id="article-(\d+)"/g;
  let am;
  while ((am = artRe.exec(html)) !== null) {
    // skip sub-paragraph anchors like article-1-1
    if (/^-\d/.test(html.slice(am.index + am[0].length, am.index + am[0].length + 2))) continue;
    tokens.push({ type: "article", pos: am.index, num: parseInt(am[1], 10) });
  }

  // <p> tags live inside <div class="read"> which is AFTER the footer on kremlin.ru
  const readStart = html.indexOf('<div class="read"');
  const bodyHtml  = readStart > 0 ? html.slice(readStart) : html;

  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
  let pm;
  const readOffset = readStart > 0 ? readStart : 0;
  while ((pm = pRe.exec(bodyHtml)) !== null) {
    const text = stripTags(pm[1]);
    if (text.length < 3) continue;
    // offset back to full-html coordinates so sorting works correctly
    tokens.push({ type: "para", pos: pm.index + readOffset, text });
  }

  // Sort by position
  tokens.sort((a, b) => a.pos - b.pos);

  const articles = [];
  let curChapterNum = 1;
  let curArticleNum = null;
  let curLines = [];

  const chapTitles = {};
  for (const t of tokens) {
    if (t.type === "chapter") chapTitles[t.num] = t.title;
  }

  function flush() {
    if (curArticleNum === null) return;
    articles.push({
      article_number: curArticleNum,
      chapter: `Глава ${curChapterNum}`,
      title: chapTitles[curChapterNum] || "",
      text: curLines.join("\n").trim(),
    });
    curLines = [];
    curArticleNum = null;
  }

  for (const t of tokens) {
    if (t.type === "chapter") {
      flush();
      curChapterNum = t.num;
    } else if (t.type === "article") {
      flush();
      curArticleNum = t.num;
    } else if (t.type === "para" && curArticleNum !== null && t.text.length > 5) {
      curLines.push(t.text);
    }
  }
  flush();

  return articles;
}

async function main() {
  const fileIdx = process.argv.indexOf("--file");
  let html;

  if (fileIdx !== -1) {
    html = fs.readFileSync(process.argv[fileIdx + 1], "utf8");
    console.log("Parsing from local file...");
  } else {
    console.log("Fetching from kremlin.ru...");
    try { html = await fetchUrl(URL); }
    catch (e) {
      console.error("Fetch failed:", e.message);
      console.error("Fallback: curl -A 'Mozilla/5.0' '" + URL + "' -L -o kremlin.html");
      console.error("Then: node parse.js --file kremlin.html");
      process.exit(1);
    }
  }

  const articles = parse(html);

  if (articles.length < 30) {
    console.error(`Only ${articles.length} articles — something is wrong. Saving debug.html`);
    fs.writeFileSync("debug.html", html);
    process.exit(1);
  }

  fs.writeFileSync(
    path.resolve(__dirname, "articles.json"),
    JSON.stringify(articles, null, 2),
    "utf8"
  );
  console.log(`Parsed ${articles.length} articles → articles.json`);
}

main();
