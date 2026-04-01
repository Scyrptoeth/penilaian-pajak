/**
 * OCR Noise Cleaner
 *
 * Programmatically cleans common OCR noise patterns from regulation markdown files.
 * Targets: gibberish lines, page artifacts, stray characters, excessive whitespace,
 * character substitutions, and word splitting.
 *
 * Usage: node tools/clean-ocr-noise.mjs [file1.md file2.md ...]
 *        node tools/clean-ocr-noise.mjs --all  (processes all files with noise > 5%)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const REGULATIONS_DIR = join(ROOT, 'src/content/regulations');

// --- Pattern definitions ---

// Lines that are pure gibberish (PDF header/footer artifacts)
function isGibberishLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length < 3) return false;

  // Count alphabetic vs non-alphabetic
  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  const ratio = alphaCount / trimmed.length;

  // Lines with very low alpha ratio and length > 5 are likely gibberish
  if (trimmed.length > 5 && ratio < 0.3) {
    // But preserve lines that look like numbered items, legal references, or currency
    if (/^\d+[\.\)]/.test(trimmed)) return false; // "1." "2)" etc
    if (/^[a-z][\.\)]/.test(trimmed)) return false; // "a." "b)" etc
    if (/^Rp/.test(trimmed)) return false; // Currency
    if (/^\([\d]+\)/.test(trimmed)) return false; // "(1)" "(2)"
    if (/^---$/.test(trimmed)) return false; // YAML frontmatter delimiter
    if (/^#+\s/.test(trimmed)) return false; // Markdown headings
    return true;
  }

  return false;
}

// Page number artifacts: standalone "-N-" or "- N -"
function isPageNumber(line) {
  const trimmed = line.trim();
  return /^-\s*\d+\s*-$/.test(trimmed);
}

// Stray single characters on their own line
function isStrayChar(line) {
  const trimmed = line.trim();
  // Single character that's not a meaningful list marker
  if (trimmed.length === 1 && !/^[a-zA-Z0-9\-]$/.test(trimmed)) return true;
  // Also catch things like "j", "J" alone but NOT "a", "b", "c" (list markers)
  if (trimmed.length === 1 && /^[jJqQxXzZ]$/.test(trimmed)) return true;
  return false;
}

// Kp.: reference lines (page headers in SE documents)
function isKpReference(line) {
  const trimmed = line.trim();
  return /^Kp\.:/.test(trimmed);
}

// Continuation markers
function isContinuationMarker(line) {
  const trimmed = line.trim();
  return /^\.{3,}\s*[\^\/\\¿r]/.test(trimmed) || /^\.\.\.\s*$/.test(trimmed);
}

// Lines of mostly dots/dashes (failed table borders)
function isTableBorder(line) {
  const trimmed = line.trim();
  if (trimmed.length < 5) return false;
  const dotsAndDashes = (trimmed.match(/[.\-_=|+]/g) || []).length;
  return dotsAndDashes / trimmed.length > 0.8;
}

// --- Text fix patterns ---

const TEXT_FIXES = [
  // Character swaps (rn → m)
  [/\brnengenai\b/g, 'mengenai'],
  [/\brnenentukan\b/g, 'menentukan'],
  [/\brnenteri\b/gi, 'menteri'],
  [/\brnenjadi\b/g, 'menjadi'],
  [/\brnerniliki\b/g, 'memiliki'],
  [/\brnernperoleh\b/g, 'memperoleh'],
  [/\brnernpunyai\b/g, 'mempunyai'],
  [/\brnernberikan\b/g, 'memberikan'],
  [/\brnernbayar\b/g, 'membayar'],
  [/\brnernetapkan\b/g, 'menetapkan'],
  [/\brnelakukan\b/g, 'melakukan'],
  [/\brnelaporkan\b/g, 'melaporkan'],
  [/\brneliputi\b/g, 'meliputi'],
  [/\brnerupakan\b/g, 'merupakan'],
  [/\brnernuat\b/g, 'memuat'],
  [/\brnaksud\b/g, 'maksud'],

  // Lernbaran → Lembaran
  [/\bLernbaran\b/g, 'Lembaran'],
  [/\blernbaran\b/g, 'lembaran'],
  [/\bPernberitahuan\b/g, 'Pemberitahuan'],
  [/\bpernberitahuan\b/g, 'pemberitahuan'],
  [/\bdisampaikan\b/g, 'disampaikan'], // already correct
  [/\bdisarnpaikan\b/g, 'disampaikan'],
  [/\bsarnpai\b/g, 'sampai'],
  [/\bNornor\b/g, 'Nomor'],
  [/\bnornor\b/g, 'nomor'],

  // i ↔ l swaps
  [/\bteiah\b/g, 'telah'],
  [/\badaiah\b/g, 'adalah'],
  [/\bDaiam\b/g, 'Dalam'],
  [/\bdaiam\b/g, 'dalam'],
  [/\bseianjutnya\b/g, 'selanjutnya'],
  [/\bseIanjutnya\b/g, 'selanjutnya'],
  [/\bdiaiurkan\b/g, 'dialirkan'],
  [/\bRepubiik\b/g, 'Republik'],
  [/\brepubiik\b/g, 'republik'],
  [/\bkaii\b/g, 'kali'],
  [/\bEseion\b/g, 'Eselon'],
  [/\bhasii\b/g, 'hasil'],
  [/\bnilai\b/g, 'nilai'], // keep as is - already correct
  [/\bnilai\b/g, 'nilai'],
  [/\bbasii\b/g, 'hasil'],
  [/\btidai<\b/g, 'tidak'],

  // ! → i in words
  [/\bMENTER!\b/g, 'MENTERI'],
  [/\bMenter!\b/g, 'Menteri'],
  [/\bREPUBL!K\b/g, 'REPUBLIK'],
  [/\bREPUB'uK\b/g, 'REPUBLIK'],
  [/\bREPUBLII</g, 'REPUBLIK'],
  [/\bREPUBLiK\b/g, 'REPUBLIK'],
  [/\bINQONESIA\b/g, 'INDONESIA'],
  [/\bBUM!\b/g, 'BUMI'],
  [/\bBum!\b/g, 'Bumi'],

  // Colon substitution
  [/\bTahu:i\b/g, 'Tahun'],
  [/\btahu:i\b/g, 'tahun'],
  [/\bIn:ionesia\b/g, 'Indonesia'],
  [/\badalal:/g, 'adalah'],
  [/\bNomm:-/g, 'Nomor'],
  [/\bpe:du\b/g, 'perlu'],
  [/\bindus:ri\b/g, 'industri'],

  // Period insertion
  [/\bPajc\.k\b/g, 'Pajak'],
  [/\bpajc\.k\b/g, 'pajak'],
  [/\bPerubc\.han\b/g, 'Perubahan'],
  [/\bbesarnyc\.\b/g, 'besarnya'],
  [/\baC\.alah\b/g, 'adalah'],

  // Number substitution
  [/\b3umi\b/g, 'Bumi'],
  [/\b0bjek\b/g, 'Objek'],
  [/\b0bjek\b/g, 'Objek'],
  [/\b1ndonesia\b/g, 'Indonesia'],

  // Common word splitting fixes
  [/\bPaj ak\b/g, 'Pajak'],
  [/\bpaj ak\b/g, 'pajak'],
  [/\bPerpaj akan\b/g, 'Perpajakan'],
  [/\bperpaj akan\b/g, 'perpajakan'],
  [/\bB angunan\b/g, 'Bangunan'],
  [/\bb angunan\b/g, 'bangunan'],
  [/\bWaj ib\b/g, 'Wajib'],
  [/\bwaj ib\b/g, 'wajib'],
  [/\bObj ek\b/g, 'Objek'],
  [/\bobj ek\b/g, 'objek'],
  [/\bSubj ek\b/g, 'Subjek'],
  [/\bsubj ek\b/g, 'subjek'],
  [/\bS PO P\b/g, 'SPOP'],
  [/\bS KP\b/g, 'SKP'],
  [/\bS PPT\b/g, 'SPPT'],

  // Uppercase word splitting
  [/M ENTERI/g, 'MENTERI'],
  [/M E N T E R I/g, 'MENTERI'],
  [/KEUAN GAN/g, 'KEUANGAN'],
  [/K E U A N G A N/g, 'KEUANGAN'],
  [/REPUB LI K/g, 'REPUBLIK'],
  [/R E P U B L I K/g, 'REPUBLIK'],
  [/I N D O N ?ESIA/g, 'INDONESIA'],
  [/I N D O N E S I A/g, 'INDONESIA'],
  [/D I R E K T O R A T/g, 'DIREKTORAT'],
  [/J E N D E R A L/g, 'JENDERAL'],
  [/P E R A T U R A N/g, 'PERATURAN'],
  [/K E M E N T E R I A N/g, 'KEMENTERIAN'],
  [/B U M I/g, 'BUMI'],
  [/B A N G U N A N/g, 'BANGUNAN'],
  [/P E N I L A I A N/g, 'PENILAIAN'],

  // Other common OCR errors
  [/\btangga1\b/g, 'tanggal'],
  [/\btanggai\b/g, 'tanggal'],
  [/\bpenilain\b/g, 'penilaian'],
  [/\bPeneltian\b/g, 'Penelitian'],
  [/\bpeneltian\b/g, 'penelitian'],
  [/\bseteiah\b/g, 'setelah'],
  [/\bpacta\b/g, 'pada'],
  [/\bbada\b/g, 'pada'],
  [/\bttcl\b/g, 'ttd'],
  [/\bdanjatau\b/g, 'dan/atau'],
  [/\bdanj\b/g, 'dan/'],
  [/\bCatalan\b/g, 'Catatan'],
  [/\btata cam\b/g, 'tata cara'],
  [/\bhai\b/g, 'hal'],
  [/\bvovemBer\b/gi, 'November'],
  [/\bAiea!/g, 'Areal'],
  [/\bEmplasernen\b/g, 'Emplasemen'],
  [/\bFormuUr\b/g, 'Formulir'],
  [/\bKetersngan\b/g, 'Keterangan'],
  [/\bPENGISISAN\b/g, 'PENGISIAN'],
  [/\bpenggimaan\b/g, 'penggunaan'],
  [/\bGeoTaggirg\b/g, 'GeoTagging'],
  [/\bseba di\b/g, 'sebagai'],

  // Additional OCR fixes found in remaining files
  [/\bPembrltahun\b/g, 'Pemberitahuan'],
  [/\bpembrltahun\b/g, 'pemberitahuan'],
  [/\bAdminlstrasl\b/g, 'Administrasi'],
  [/\badminlstrasl\b/g, 'administrasi'],
  [/\bambrftahu\b/g, 'memberitahu'],
  [/\borrrlle\b/g, 'diterima'],
  [/\.±-/g, ''],

  // Number→letter substitution in words
  [/\bse1anjutnya\b/g, 'selanjutnya'],
  [/\bmela1ui\b/g, 'melalui'],
  [/\bnom or\b/g, 'nomor'],
  [/\bdan zatau\b/g, 'dan/atau'],
  [/\bmeriandatangani\b/g, 'menandatangani'],
  [/\bpotOJ;gan\b/g, 'potongan'],
  [/\bPBBjPLB\b/g, 'PBB/PLB'],
  [/\bSKPLBj\b/g, 'SKPLB/'],
  [/\bNPWPj\b/g, 'NPWP/'],
  [/\bAnggornn\b/g, 'Anggaran'],
  [/\bberdasarl<an\b/g, 'berdasarkan'],
  [/\btersel:mt\b/g, 'tersebut'],
  [/\bdite:rbitkan\b/g, 'diterbitkan'],
  [/\bkepentinga:1\b/g, 'kepentingan'],
];

// --- Unicode noise cleanup ---
function cleanUnicodeNoise(line) {
  let fixed = line;
  // Remove U+FFFD replacement characters
  fixed = fixed.replace(/\ufffd/g, '');
  // Replace middle dots (U+00B7) with nothing
  fixed = fixed.replace(/\u00b7/g, '');
  // Replace bullets (U+2022) with nothing
  fixed = fixed.replace(/\u2022/g, '');
  // Replace other common OCR unicode artifacts
  fixed = fixed.replace(/[\u00a4\u00b6\u2020\u2021\u2122\u25a0\u25a1\u25c6\u25c7\u25cf\u25cb\u2666\u2663\u2660\u2665\u25aa\u25ab\u2023]/g, '');
  // Replace smart quotes with regular quotes
  fixed = fixed.replace(/[\u2018\u2019]/g, "'");
  fixed = fixed.replace(/[\u201c\u201d]/g, '"');
  // Replace en/em dashes with regular dash
  fixed = fixed.replace(/[\u2013\u2014]/g, '-');
  // Replace ellipsis with three dots
  fixed = fixed.replace(/\u2026/g, '...');
  // Replace non-breaking space with regular space
  fixed = fixed.replace(/\u00a0/g, ' ');
  // Remove degree sign in non-numeric context
  fixed = fixed.replace(/(?<![0-9])\u00b0(?![0-9CF])/g, '');
  return fixed;
}

// Check if line is a form field template (mostly dots/bullets for fill-in)
function isFormFieldLine(line) {
  const trimmed = line.trim();
  if (trimmed.length < 10) return false;
  // Count dots, middle dots, bullets
  const fillChars = (trimmed.match(/[.\u00b7\u2022\u00b0·•]/g) || []).length;
  return fillChars / trimmed.length > 0.4;
}

// High-noise line: >60% non-alphabetic with length > 10
function isHighNoiseLine(line) {
  const trimmed = line.trim();
  if (trimmed.length <= 10) return false;
  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  const ratio = alphaCount / trimmed.length;
  if (ratio < 0.25) {
    // Preserve numbered items, list markers, legal references
    if (/^\d+[\.\)]/.test(trimmed)) return false;
    if (/^[a-z][\.\)]/.test(trimmed)) return false;
    if (/^\([\d]+\)/.test(trimmed)) return false;
    if (/^Rp/.test(trimmed)) return false;
    if (/^---/.test(trimmed)) return false;
    return true;
  }
  return false;
}

// Garbled form fields: lines with long runs of X, K, N, A, R, s repeated chars
function isGarbledFormField(line) {
  const trimmed = line.trim();
  if (trimmed.length < 15) return false;
  // Lines with 8+ consecutive X/K/N/A characters (garbled form placeholders)
  if (/[XKNARxknar]{8,}/.test(trimmed)) return true;
  // Lines with 5+ repeated same character (like ssssss, nnnnnn)
  if (/(.)\1{5,}/.test(trimmed) && !/\.{6,}/.test(trimmed)) return true;
  // Lines with garbled consonant sequences like "stsst", "csssssemsns"
  if (/[bcdfghjklmnpqrstvwxyz]{8,}/i.test(trimmed)) {
    // But not if it starts with a recognizable word
    if (!/^(MENTERI|KEMENTERIAN|DIREKTORAT|REPUBLIK|INDONESIA)/i.test(trimmed)) {
      return true;
    }
  }
  return false;
}

// --- Detect and replace corrupted form/table blocks ---
function identifyCorruptedBlocks(lines) {
  const blocks = [];
  let blockStart = -1;
  let corruptedCount = 0;
  let totalCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (blockStart >= 0 && totalCount > 0) {
        const ratio = corruptedCount / totalCount;
        if (totalCount >= 8 && ratio > 0.5) {
          blocks.push({ start: blockStart, end: i, lines: totalCount });
        }
      }
      blockStart = -1;
      corruptedCount = 0;
      totalCount = 0;
      continue;
    }

    if (blockStart < 0) blockStart = i;
    totalCount++;

    const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
    const ratio = alphaCount / trimmed.length;
    if (ratio < 0.4 || isGibberishLine(lines[i])) {
      corruptedCount++;
    }
  }

  // Handle end of file
  if (blockStart >= 0 && totalCount >= 8) {
    const ratio = corruptedCount / totalCount;
    if (ratio > 0.5) {
      blocks.push({ start: blockStart, end: lines.length, lines: totalCount });
    }
  }

  return blocks;
}

// --- Main cleaning function ---
function cleanFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');

  // Split frontmatter from body
  const parts = content.split('---');
  if (parts.length < 3) {
    console.log(`  Skipped (no frontmatter): ${filePath}`);
    return { changed: false };
  }

  const frontmatter = parts[0] + '---' + parts[1] + '---';
  const body = parts.slice(2).join('---');

  let lines = body.split('\n');
  const originalLineCount = lines.length;
  let changes = 0;

  // Pass 0: Clean unicode noise first (so subsequent passes work on clean chars)
  lines = lines.map(line => {
    const before = line;
    const cleaned = cleanUnicodeNoise(line);
    if (before !== cleaned) changes++;
    return cleaned;
  });

  // Pass 1: Remove gibberish lines, page numbers, stray chars, Kp refs, form fields
  lines = lines.filter((line, idx) => {
    if (isPageNumber(line)) { changes++; return false; }
    if (isStrayChar(line)) { changes++; return false; }
    if (isKpReference(line)) { changes++; return false; }
    if (isContinuationMarker(line)) { changes++; return false; }
    if (isGibberishLine(line)) { changes++; return false; }
    if (isTableBorder(line)) { changes++; return false; }
    if (isHighNoiseLine(line)) { changes++; return false; }
    if (isGarbledFormField(line)) { changes++; return false; }
    return true;
  });

  // Pass 2: Apply text fixes
  lines = lines.map(line => {
    let fixed = line;
    for (const [pattern, replacement] of TEXT_FIXES) {
      const before = fixed;
      fixed = fixed.replace(pattern, replacement);
      if (before !== fixed) changes++;
    }
    return fixed;
  });

  // Pass 3: Clean excessive whitespace within lines (>3 consecutive spaces mid-line)
  lines = lines.map(line => {
    if (!line.trim()) return line;
    // Preserve leading whitespace, clean internal excessive spaces
    const leading = line.match(/^(\s*)/)[0];
    const rest = line.slice(leading.length);
    const cleaned = rest.replace(/  {3,}/g, '  '); // Reduce 3+ spaces to 2
    if (rest !== cleaned) changes++;
    return leading + cleaned;
  });

  // Pass 4: Remove consecutive blank lines (max 2)
  const finalLines = [];
  let blankCount = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      blankCount++;
      if (blankCount <= 2) finalLines.push(line);
      else changes++;
    } else {
      blankCount = 0;
      finalLines.push(line);
    }
  }

  const newBody = finalLines.join('\n');
  const newContent = frontmatter + newBody;

  if (changes > 0) {
    writeFileSync(filePath, newContent, 'utf-8');
  }

  return {
    changed: changes > 0,
    changes,
    linesRemoved: originalLineCount - finalLines.length,
    originalLines: originalLineCount,
    finalLines: finalLines.length,
  };
}

// --- Entry point ---

const args = process.argv.slice(2);
let files = [];

if (args.includes('--all')) {
  // Process all files currently Bentuk 3+ (>1% noise)
  const auditData = JSON.parse(readFileSync('tools/content-audit-report.json', 'utf-8'));
  const threshold = args.includes('--threshold') ? parseFloat(args[args.indexOf('--threshold') + 1]) : 1;
  files = auditData
    .filter(r => r.noiseScore > threshold)
    .map(r => join(ROOT, r.file));
  console.log(`Processing ${files.length} files with noise > ${threshold}%...`);
} else if (args.length > 0) {
  files = args.map(f => {
    if (f.startsWith('/')) return f;
    return join(ROOT, 'src/content/regulations', f);
  });
} else {
  console.log('Usage: node tools/clean-ocr-noise.mjs --all');
  console.log('       node tools/clean-ocr-noise.mjs pmk/pmk-256-2014.md se/se-23-2011.md');
  process.exit(0);
}

console.log('');
let totalChanges = 0;
let totalRemoved = 0;

for (const file of files) {
  const result = cleanFile(file);
  if (result.changed) {
    console.log(`  ✓ ${file.replace(ROOT + '/', '')}: ${result.changes} fixes, ${result.linesRemoved} lines removed (${result.originalLines} → ${result.finalLines})`);
    totalChanges += result.changes;
    totalRemoved += result.linesRemoved;
  } else {
    console.log(`  - ${file.replace(ROOT + '/', '')}: no changes needed`);
  }
}

console.log('');
console.log(`Total: ${totalChanges} fixes applied, ${totalRemoved} lines removed across ${files.length} files`);
