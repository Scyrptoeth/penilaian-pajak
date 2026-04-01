/**
 * Content Audit Script
 *
 * Scans all regulation .md files and categorizes them by text quality:
 *   - Bentuk 1: Text only, no lampiran, clean OCR
 *   - Bentuk 2: Text + lampiran, lampiran is all text, clean OCR
 *   - Bentuk 3: Mixed text + image content (tables/forms/graphics), partial OCR noise
 *   - Bentuk 4: Mostly image lampiran, heavy OCR noise
 *
 * Outputs:
 *   - tools/content-audit-report.json (raw data)
 *   - tools/content-audit-report.md  (readable report)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const REGULATIONS_DIR = 'src/content/regulations';
const ROOT = process.cwd();

// --- Helpers ---

function walkDir(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkDir(full));
    } else if (entry.endsWith('.md')) {
      files.push(full);
    }
  }
  return files.sort();
}

function extractBody(content) {
  const parts = content.split('---');
  if (parts.length < 3) return content;
  return parts.slice(2).join('---');
}

// Unicode ranges for "weird" characters common in bad OCR
const WEIRD_CHARS = /[\u2022\u2023\u25aa\u25ab\u25a0\u25a1\u25c6\u25c7\u25cf\u25cb\u2666\u2663\u2660\u2665\u00b7\u00a4\u00a7\u00b6\u2020\u2021\u00ae\u2122\u00a9\u00b0\u00b1\u00b2\u00b3\u00b9\u2018\u2019\u201c\u201d\u2013\u2014\u2026\ufffd\u00a0]/g;

function computeNoiseScore(body) {
  const lines = body.split('\n');
  let noiseChars = 0;
  let totalChars = 0;
  const indicators = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    totalChars += trimmed.length;

    // 1. Long runs of non-alphanumeric chars (>5 consecutive)
    const nonAlphaRuns = trimmed.match(/[^a-zA-Z0-9\s.,;:'"()\-\/]{5,}/g);
    if (nonAlphaRuns) {
      for (const run of nonAlphaRuns) noiseChars += run.length;
    }

    // 2. Weird unicode characters
    const weirdMatches = trimmed.match(WEIRD_CHARS);
    if (weirdMatches) {
      noiseChars += weirdMatches.length;
    }

    // 3. Consonant-only sequences > 4 chars (no vowels — likely OCR garbage)
    // Known legitimate Indonesian tax abbreviations (consonant-heavy)
    const TAX_ABBREVS = /^(SKPKPP|SPMKP|PPnBM|SKPLB|SKPPKP|SKTPBB|NPWPj?|KPPNy?|LHPdK|NJOPTKP|NJKP|SPPT|STTS|DHKP|RKPPBB|BPHTB|PPHTB|SKBKB|SKBKBT|SKBLB|SKKP|SKPKB|SKPKBT|STB|STPD|BBNKB|STPBB|STRP|SSPBB|SPPTPBB|SKPBB|SKPPBB|SPMBB|SPMKP|SPMPKP)$/i;
    const consonantRuns = trimmed.match(/[bcdfghjklmnpqrstvwxyz]{5,}/gi);
    if (consonantRuns) {
      for (const run of consonantRuns) {
        // Allow common Indonesian consonant clusters and tax abbreviations
        if (!/^(ngk|ngg|str|mpr|ntr)/i.test(run) && !TAX_ABBREVS.test(run)) {
          noiseChars += run.length;
        }
      }
    }

    // 4. Lines that are >80% non-alphanumeric
    const alphaCount = (trimmed.match(/[a-zA-Z0-9]/g) || []).length;
    if (trimmed.length > 10 && alphaCount / trimmed.length < 0.2) {
      noiseChars += trimmed.length;
      if (!indicators.includes('high-noise-lines')) indicators.push('high-noise-lines');
    }

    // 5. Common OCR confusions: "rn" for "m", "l" for "I", etc.
    // Only flag if there's a pattern of "rn." replacing "m."
    const rnDot = (trimmed.match(/\brn\./g) || []).length;
    if (rnDot >= 2) {
      noiseChars += rnDot * 3;
      if (!indicators.includes('rn-for-m')) indicators.push('rn-for-m');
    }
  }

  if (totalChars === 0) return { score: 0, indicators: ['empty'] };

  const score = (noiseChars / totalChars) * 100;
  return { score: Math.round(score * 100) / 100, indicators };
}

function classifyBentuk(hasLampiran, noiseScore) {
  if (noiseScore > 5) return 4;
  if (noiseScore > 1) return hasLampiran ? 3 : 3; // moderate noise = mixed content
  // Clean
  return hasLampiran ? 2 : 1;
}

// --- Main ---

const files = walkDir(REGULATIONS_DIR);
const results = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const body = extractBody(content);
  const relPath = relative(ROOT, file);

  const totalChars = body.length;
  const totalLines = body.split('\n').length;
  const hasLampiran = /LAMPIRAN|Lampiran/i.test(body);
  const { score: noiseScore, indicators } = computeNoiseScore(body);
  const bentuk = classifyBentuk(hasLampiran, noiseScore);

  // Extract nomor from frontmatter
  const nomorMatch = content.match(/^nomor:\s*"?([^"\n]+)"?/m);
  const nomor = nomorMatch ? nomorMatch[1].trim() : relPath;

  results.push({
    file: relPath,
    nomor,
    totalChars,
    totalLines,
    hasLampiran,
    noiseScore,
    indicators,
    bentuk,
  });
}

// Sort by noise score descending
results.sort((a, b) => b.noiseScore - a.noiseScore);

// --- Write JSON ---

writeFileSync('tools/content-audit-report.json', JSON.stringify(results, null, 2), 'utf-8');

// --- Write Markdown report ---

const now = new Date().toISOString().split('T')[0];
const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
for (const r of results) counts[r.bentuk]++;

const bentuk3 = results.filter((r) => r.bentuk === 3);
const bentuk4 = results.filter((r) => r.bentuk === 4);

let md = `# Content Audit Report

Generated: ${now}
Total documents: ${results.length}

## Summary

- **Bentuk 1** (teks tanpa lampiran, clean): **${counts[1]}** dokumen
- **Bentuk 2** (teks + lampiran teks, clean): **${counts[2]}** dokumen
- **Bentuk 3** (campuran teks + image, moderate noise): **${counts[3]}** dokumen
- **Bentuk 4** (lampiran image, heavy noise): **${counts[4]}** dokumen

`;

if (bentuk4.length > 0) {
  md += `## Dokumen Bentuk 4 (heavy noise — prioritas perbaikan)\n\n`;
  md += `| File | Nomor | Noise % | Lampiran | Indikasi |\n`;
  md += `|------|-------|---------|----------|----------|\n`;
  for (const r of bentuk4) {
    md += `| ${r.file} | ${r.nomor} | ${r.noiseScore}% | ${r.hasLampiran ? 'Ya' : 'Tidak'} | ${r.indicators.join(', ') || '-'} |\n`;
  }
  md += '\n';
}

if (bentuk3.length > 0) {
  md += `## Dokumen Bentuk 3 (moderate noise — perlu review)\n\n`;
  md += `| File | Nomor | Noise % | Lampiran | Indikasi |\n`;
  md += `|------|-------|---------|----------|----------|\n`;
  for (const r of bentuk3) {
    md += `| ${r.file} | ${r.nomor} | ${r.noiseScore}% | ${r.hasLampiran ? 'Ya' : 'Tidak'} | ${r.indicators.join(', ') || '-'} |\n`;
  }
  md += '\n';
}

md += `## Detail Semua Dokumen\n\n`;
md += `| File | Nomor | Chars | Lines | Noise % | Lampiran | Bentuk |\n`;
md += `|------|-------|-------|-------|---------|----------|--------|\n`;

// Sort by file path for the full list
const sorted = [...results].sort((a, b) => a.file.localeCompare(b.file));
for (const r of sorted) {
  md += `| ${r.file} | ${r.nomor} | ${r.totalChars.toLocaleString()} | ${r.totalLines} | ${r.noiseScore}% | ${r.hasLampiran ? 'Ya' : 'Tidak'} | ${r.bentuk} |\n`;
}

writeFileSync('tools/content-audit-report.md', md, 'utf-8');

// --- Console summary ---

console.log(`Content Audit Complete`);
console.log(`Total: ${results.length} documents`);
console.log(`  Bentuk 1 (clean, no lampiran):    ${counts[1]}`);
console.log(`  Bentuk 2 (clean, with lampiran):   ${counts[2]}`);
console.log(`  Bentuk 3 (moderate noise):         ${counts[3]}`);
console.log(`  Bentuk 4 (heavy noise):            ${counts[4]}`);
console.log('');

if (bentuk4.length > 0) {
  console.log('Heavy noise files (Bentuk 4):');
  for (const r of bentuk4) {
    console.log(`  ${r.noiseScore.toFixed(1).padStart(5)}%  ${r.nomor}`);
  }
  console.log('');
}

if (bentuk3.length > 0) {
  console.log('Moderate noise files (Bentuk 3):');
  for (const r of bentuk3) {
    console.log(`  ${r.noiseScore.toFixed(1).padStart(5)}%  ${r.nomor}`);
  }
}

console.log('\nReports saved to:');
console.log('  tools/content-audit-report.json');
console.log('  tools/content-audit-report.md');
