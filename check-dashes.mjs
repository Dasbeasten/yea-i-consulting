#!/usr/bin/env node
// Pre-publish punctuation check for Yea I.
// Fails (exit 1) on an em dash, horizontal bar, or curly quote, whether written
// as a raw character or as its HTML entity. En dashes are allowed, because they
// are correct in number ranges such as 120k to 250k.
// Usage:
//   node check-dashes.mjs                 scan every html/js/css file under the current folder
//   node check-dashes.mjs index.html ...  scan only the files you name
// Wire into Netlify by making this the build command, or prefixing your existing one.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Raw characters that should never reach the live site, with plain-English names.
const BANNED = {
  "\u2014": "em dash",
  "\u2015": "horizontal bar",
  "\u2018": "curly single quote (open)",
  "\u2019": "curly single quote (close)",
  "\u201C": "curly double quote (open)",
  "\u201D": "curly double quote (close)",
};

// Entity forms are built at runtime from character codes, so this file holds no
// literal entity text and never flags itself.
const NAMED = { mdash: "\u2014", horbar: "\u2015", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D" };
const ENTITIES = {};
for (const [name, ch] of Object.entries(NAMED)) {
  const code = ch.codePointAt(0);
  for (const form of ["&" + name + ";", "&#" + code + ";", "&#x" + code.toString(16) + ";", "&#x" + code.toString(16).toUpperCase() + ";"]) {
    ENTITIES[form] = ch;
  }
}
const ENTITY_RE = new RegExp(
  Object.keys(ENTITIES).map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "gi"
);

const SCAN_EXTS = new Set([".html", ".htm", ".js", ".mjs", ".css"]);

function collectFiles(paths) {
  const out = [];
  const walk = (p) => {
    const s = statSync(p);
    if (s.isDirectory()) {
      if (/node_modules|\.git/.test(p)) return;
      for (const name of readdirSync(p)) walk(join(p, name));
    } else if (SCAN_EXTS.has(extname(p))) {
      out.push(p);
    }
  };
  for (const p of paths) walk(p);
  return out;
}

const args = process.argv.slice(2);
const targets = args.length ? args : ["."];
const files = collectFiles(targets);

let hits = 0;
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    [...line].forEach((ch, col) => {
      if (BANNED[ch]) {
        hits++;
        const snippet = line.slice(Math.max(0, col - 30), col + 30).trim();
        console.log(`${file}:${i + 1}:${col + 1}  ${BANNED[ch]} (raw)  ...${snippet}...`);
      }
    });
    let m;
    ENTITY_RE.lastIndex = 0;
    while ((m = ENTITY_RE.exec(line)) !== null) {
      hits++;
      const real = ENTITIES[m[0].toLowerCase()] ?? ENTITIES[m[0]];
      const snippet = line.slice(Math.max(0, m.index - 30), m.index + 30).trim();
      console.log(`${file}:${i + 1}:${m.index + 1}  ${BANNED[real]} (entity ${m[0]})  ...${snippet}...`);
    }
  });
}

if (hits) {
  console.error(`\nFAILED: found ${hits} banned character${hits === 1 ? "" : "s"} across ${files.length} file${files.length === 1 ? "" : "s"}.`);
  process.exit(1);
} else {
  console.log(`Clean. Scanned ${files.length} file${files.length === 1 ? "" : "s"}. No em dashes, curly quotes, or horizontal bars, raw or entity.`);
}
