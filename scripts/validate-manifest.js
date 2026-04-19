#!/usr/bin/env node
// Validates manifest.json for required fields and known pitfalls.
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT     = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8'));

const errors   = [];
const warnings = [];

// Required fields
for (const field of ['manifest_version', 'name', 'version', 'background']) {
  if (!manifest[field]) errors.push(`Missing required field: "${field}"`);
}

if (manifest.manifest_version !== 3) {
  errors.push(`manifest_version must be 3 (got ${manifest.manifest_version})`);
}

// Background service worker must exist
const sw = manifest.background?.service_worker;
if (sw && !existsSync(resolve(ROOT, sw))) {
  errors.push(`background.service_worker file not found: "${sw}"`);
}

// web_accessible_resources must be present for the viewer
const war = manifest.web_accessible_resources ?? [];
const coversViewer = war.some(entry =>
  (entry.resources ?? []).some(r => r.startsWith('pdfjs'))
);
if (!coversViewer) {
  errors.push('web_accessible_resources must include pdfjs/** for the viewer to load.');
}

// Warn about overly broad host_permissions
const hosts = manifest.host_permissions ?? [];
if (hosts.includes('<all_urls>')) {
  warnings.push('host_permissions includes <all_urls> — consider restricting to https://* if possible.');
}

// Permissions sanity
const perms = manifest.permissions ?? [];
if (!perms.includes('tabs')) {
  errors.push('Missing "tabs" permission — required for PDF interception.');
}
if (!perms.includes('storage')) {
  errors.push('Missing "storage" permission — required for API key and bookmarks.');
}

// Report
if (warnings.length) {
  warnings.forEach(w => console.warn('[manifest] WARN:', w));
}
if (errors.length) {
  errors.forEach(e => console.error('[manifest] ERROR:', e));
  process.exit(1);
}

console.log('[manifest] OK — manifest.json is valid.');
