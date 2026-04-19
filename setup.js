#!/usr/bin/env node
/**
 * Updates the bundled PDF.js viewer to a new version.
 *
 * Usage:
 *   node setup.js [version]
 *   node setup.js 5.6.205
 *
 * What it does:
 *   1. Downloads pdfjs-<version>-dist.zip from GitHub releases
 *   2. Replaces pdfjs/build/ and pdfjs/web/ with the new files
 *   3. Re-applies patches the extension requires:
 *      a) Clears the default sample PDF URL in viewer.mjs
 *      b) Injects the translate bubble HTML + script tag into viewer.html
 *   4. Copies src/translate-overlay.js into pdfjs/web/
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const ROOT    = path.dirname(fileURLToPath(import.meta.url));
const PDFJS   = path.join(ROOT, 'pdfjs');

const { version: CURRENT_VERSION } = JSON.parse(
  readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);

const version = process.argv[2] || CURRENT_VERSION;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version format: "${version}". Expected x.y.z`);
  process.exit(1);
}

const zipUrl = `https://github.com/mozilla/pdf.js/releases/download/v${version}/pdfjs-${version}-dist.zip`;
const tmpZip = path.join(os.tmpdir(), `pdfjs-${version}-dist.zip`);
const tmpDir = path.join(os.tmpdir(), `pdfjs-${version}-dist`);

// ── 1. Download ───────────────────────────────────────────────────────────────

console.log(`Downloading PDF.js v${version}…`);
try {
  execSync(`curl -fsSL ${JSON.stringify(zipUrl)} -o ${JSON.stringify(tmpZip)}`, { stdio: 'inherit' });
} catch {
  console.error('Download failed. Check the version number and your internet connection.');
  process.exit(1);
}

// ── 2. Extract and replace pdfjs/ ────────────────────────────────────────────

console.log('Extracting…');
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });
execSync(`unzip -q ${JSON.stringify(tmpZip)} -d ${JSON.stringify(tmpDir)}`);

console.log('Replacing pdfjs/build and pdfjs/web…');
fs.rmSync(path.join(PDFJS, 'build'), { recursive: true, force: true });
fs.rmSync(path.join(PDFJS, 'web'),   { recursive: true, force: true });
execSync(`cp -r ${JSON.stringify(path.join(tmpDir, 'build'))} ${JSON.stringify(path.join(PDFJS, 'build'))}`);
execSync(`cp -r ${JSON.stringify(path.join(tmpDir, 'web'))}   ${JSON.stringify(path.join(PDFJS, 'web'))}`);

// ── 3a. Patch viewer.mjs — clear default sample PDF ──────────────────────────

console.log('Patching viewer.mjs…');
const viewerMjsPath = path.join(PDFJS, 'web', 'viewer.mjs');
const mjs = fs.readFileSync(viewerMjsPath, 'utf8');
const mjsPatched = mjs.replace(
  /value:\s*"compressed\.tracemonkey-pldi-09\.pdf"/,
  'value: ""'
);
if (mjsPatched === mjs) {
  console.warn('WARN: defaultUrl pattern not found in viewer.mjs — patch may be needed manually.');
}
fs.writeFileSync(viewerMjsPath, mjsPatched);

// ── 3b. Patch viewer.html — inject translate bubble + script ─────────────────

console.log('Patching viewer.html…');
const viewerHtmlPath = path.join(PDFJS, 'web', 'viewer.html');
const html = fs.readFileSync(viewerHtmlPath, 'utf8');

// Read current bubble HTML from the shipped viewer.html (maintained by hand)
// so setup.js never gets out of sync with the actual bubble structure.
const currentViewerHtml = fs.readFileSync(path.join(ROOT, 'pdfjs', 'web', 'viewer.html'), 'utf8');
const bubbleMatch = currentViewerHtml.match(/<!-- Translation overlay[\s\S]+?<\/div>\n    <script type="module" src="translate-overlay\.js"><\/script>/);
if (!bubbleMatch) {
  console.error('ERROR: Could not extract bubble HTML from existing viewer.html. Aborting patch.');
  process.exit(1);
}
const bubbleHtml = bubbleMatch[0];

const ANCHOR = '<div id="printContainer"></div>';
if (!html.includes(ANCHOR)) {
  console.error(`ERROR: Anchor "${ANCHOR}" not found in new viewer.html — patch may need updating.`);
  process.exit(1);
}

const htmlPatched = html.replace(
  `${ANCHOR}\n  </body>`,
  `${ANCHOR}\n\n    ${bubbleHtml}\n  </body>`
);
fs.writeFileSync(viewerHtmlPath, htmlPatched);

// ── 4. Copy translate-overlay.js ─────────────────────────────────────────────

fs.copyFileSync(
  path.join(ROOT, 'src', 'translate-overlay.js'),
  path.join(PDFJS, 'web', 'translate-overlay.js')
);

console.log(`\nDone! PDF.js updated to v${version}.`);
