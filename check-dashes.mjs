#!/usr/bin/env node
// Pre-publish punctuation check for Yea I.
// Fails (exit 1) if it finds an em dash, en dash, horizontal bar, or curly quote.
// Usage:
//   node check-dashes.mjs                 scan every .html file under the current folder
//   node check-dashes.mjs index.html ...  scan only the files you name
// Wire into Netlify by prefixing your build command:
//   node check-dashes.mjs && <your existing build>

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Characters that should never reach the live site, with plain-English names.
const BANNED = {
  "\u2014": "em dash",
  "\u2013": "en dash",
  "\u2015": "horizontal bar",
  "\u2018": "curly single quote (open)",
  "\u2019": "curly single quote (close)",
  "\u201C": "curly double quote (open)",
  "\u201D": "curly double quote (close)",
};

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
        const start = Math.max(0, col - 30);
        const snippet = line.slice(start, col + 30).trim();
        console.log(`${file}:${i + 1}:${col + 1}  ${BANNED[ch]}  …${snippet}…`);
      }
    });
  });
}

if (hits) {
  console.error(`\nFAILED: found ${hits} banned character${hits === 1 ? "" : "s"} across ${files.length} file${files.length === 1 ? "" : "s"}.`);
  process.exit(1);
} else {
  console.log(`Clean. Scanned ${files.length} file${files.length === 1 ? "" : "s"}, no em dashes or curly quotes.`);
}
