#!/usr/bin/env node
// seed.js — reads articles.json and populates SQLite (with FTS5)
// Run once after parse.js: node seed.js

const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const JSON_PATH = path.resolve(__dirname, "articles.json");
const DB_PATH = path.resolve(__dirname, "backend", "constitution.db");

if (!fs.existsSync(JSON_PATH)) {
  console.error("articles.json not found. Run parse.js first.");
  process.exit(1);
}

const articles = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
const db = new Database(DB_PATH);

db.exec(`
  DROP TABLE IF EXISTS articles_fts;
  DROP TABLE IF EXISTS articles;

  CREATE TABLE articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_number INTEGER NOT NULL,
    chapter TEXT NOT NULL,
    title TEXT NOT NULL,
    text TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE articles_fts USING fts5(
    text,
    content=articles,
    content_rowid=id,
    tokenize="unicode61"
  );
`);

const insert = db.prepare(
  "INSERT INTO articles (article_number, chapter, title, text) VALUES (?, ?, ?, ?)"
);

const insertMany = db.transaction((rows) => {
  for (const a of rows) {
    insert.run(a.article_number, a.chapter, a.title, a.text);
  }
});

insertMany(articles);

// Populate FTS index
db.exec(`
  INSERT INTO articles_fts (rowid, text)
  SELECT id, text FROM articles;
`);

console.log(`Seeded ${articles.length} articles into ${DB_PATH}`);
db.close();
