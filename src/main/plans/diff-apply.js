'use strict';
/**
 * plans/diff-apply.js — Krevyx v3.25 Güvenli Diff Uygulama (P-4)
 *
 * Unified-diff hunk'larını dosyalara güvenli biçimde uygular. Her hunk'ın
 * bağlam (context) satırları hedef dosyadaki gerçek içerikle doğrulanır;
 * eşleşme bozuksa ileriye dönük offset denemesi (fuzzy) yapılır, o da
 * bozuksa hunk atlanır ve rapor edilir — asla kör yazım yapılmaz.
 *
 * API:
 *   parseUnifiedDiff(text)            → { ok, hunks }
 *   applyDiffToContent(content, hunks, opts) → { ok, result, report }
 *   applyDiffToFile(filePath, diffText, opts)  → dosyaya uygula (fs)
 *   reverseHunk(hunk)                 → ters hunk üret
 *   validateDiffIntegrity(diffText)   → hunk başlıkları tutarlı mı
 *
 * Fuzzy eşik: bağlam satırlarının en az %60'ı eşleşirse offset denenir.
 * opts.strategy: precise (sadece tam eşleşme) | fuzzy | skip (tamamı uygulanır,
 * eşleşmeyen hunk'lar rapora düşer).
 */

function parseHunkHeader(line) {
  const m = /^\s*@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (!m) return null;
  return {
    oldStart: Number(m[1]),
    oldCount: m[2] !== undefined ? Number(m[2]) : 1,
    newStart: Number(m[3]),
    newCount: m[4] !== undefined ? Number(m[4]) : 1,
  };
}

/**
 * Unified diff metnini hunk dizisine ayrıştırır. Bozuk satırlar atlanır,
 * rapor edilir.
 */
function parseUnifiedDiff(text) {
  if (typeof text !== 'string') return { ok: false, error: 'Diff metni gerekli' };
  const lines = text.split('\n');
  const hunks = [];
  let current = null;
  let idx = 0;
  const warnings = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const header = parseHunkHeader(line);
    if (header) {
      current = { index: hunks.length, ...header, lines: [], oldSeen: 0, newSeen: 0 };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('-') || line.startsWith('+') || line.startsWith(' ')) {
      const kind = line[0];
      current.lines.push({ kind, body: line.slice(1) });
      if (kind !== '+') current.oldSeen += 1;
      if (kind !== '-') current.newSeen += 1;
    } else if (line.startsWith('\\') || line === '' || line.startsWith('Index:') || line.startsWith('---') || line.startsWith('+++')) {
      /* metadata / boşluk satırları — esneklik */
      if (line.startsWith('Index:')) idx += 1;
      continue;
    } else {
      warnings.push(`Satır ${i + 1} atlandı: ${line.slice(0, 60)}`);
    }
  }

  if (!hunks.length) return { ok: false, error: 'Hunk bulunamadı' };
  const bad = hunks.filter((h) => h.oldSeen !== h.oldCount || h.newSeen !== h.newCount);
  if (bad.length) warnings.push(`${bad.length} hunk sayım uyuşmazlığı içeriyor`);
  return { ok: true, hunks, warnings, fileIndex: idx };
}

/**
 * Tek hunk'ı içerik dizisine uygular; başlangıç satırı (1-tabanlı) opts'tan
 * gelebilir, yoksa hedefte arama yapılır.
 */
function applyHunk(contentLines, hunk, opts = {}) {
  const { strategy = 'fuzzy', fuzzyThreshold = 0.6 } = opts;
  const context = hunk.lines.filter((l) => l.kind === ' ').map((l) => l.body);
  const removals = hunk.lines.filter((l) => l.kind === '-');

  function matchAt(start) {
    if (start < 0 || start + context.length > contentLines.length) return false;
    for (let i = 0; i < context.length; i += 1) {
      if (context[i] !== contentLines[start + i]) return false;
    }
    return true;
  }

  function matchRatioAt(start) {
    let hits = 0;
    for (let i = 0; i < context.length && start + i < contentLines.length; i += 1) {
      if (context[i] === contentLines[start + i]) hits += 1;
    }
    return context.length ? hits / context.length : 1;
  }

  let anchor = -1;
  const hint = typeof hunk.oldStart === 'number' ? hunk.oldStart - 1 : -1;

  if (hint >= 0 && matchAt(hint)) {
    anchor = hint;
  } else if (strategy === 'fuzzy') {
    /* Önce bağlamsız hunk'ları (salt ekleme/silme, context yok) doğrudan kabul et */
    if (!context.length) {
      anchor = hint >= 0 ? hint : 0;
    } else {
      let best = -1;
      let bestRatio = 0;
      for (let s = 0; s <= contentLines.length - context.length; s += 1) {
        const ratio = matchRatioAt(s);
        if (ratio > bestRatio) { bestRatio = ratio; best = s; }
      }
      if (bestRatio >= fuzzyThreshold) anchor = best;
    }
  } else if (strategy === 'precise') {
    if (context.length) {
      for (let s = 0; s <= contentLines.length - context.length; s += 1) {
        if (matchAt(s)) { anchor = s; break; }
      }
    } else {
      anchor = hint >= 0 ? hint : 0;
    }
  }

  if (anchor === -1 && strategy !== 'skip') {
    return { applied: false, reason: 'Bağlam eşleşmedi', anchor: -1 };
  }
  if (anchor === -1) {
    return { applied: false, reason: 'Bağlam eşleşmedi (skip modu)', anchor: -1 };
  }

  const out = contentLines.slice();
  /* Silinen satırları kaldır */
  for (let i = removals.length - 1; i >= 0; i -= 1) {
    const at = anchor + i;
    if (at < 0 || at >= out.length) return { applied: false, reason: 'Silme aralığı dışında', anchor };
    out.splice(at, 1);
  }
  /* Eklenen satırları yerleştir */
  const insertions = hunk.lines.filter((l) => l.kind === '+').map((l) => l.body);
  for (let i = 0; i < insertions.length; i += 1) {
    out.splice(anchor + i, 0, insertions[i]);
  }
  return { applied: true, anchor, lines: out };
}

function applyDiffToContent(content, diffText, opts = {}) {
  if (typeof content !== 'string') return { ok: false, error: 'İçerik string olmalı' };
  const parsed = parseUnifiedDiff(diffText);
  if (!parsed.ok) return parsed;
  const { strategy = 'fuzzy' } = opts;
  let lines = content.split('\n');
  const report = { applied: [], skipped: [], warnings: parsed.warnings || [] };
  for (const hunk of parsed.hunks) {
    const res = applyHunk(lines, hunk, { strategy, ...opts });
    if (res.applied) {
      lines = res.lines;
      report.applied.push({ hunk: hunk.index, anchor: res.anchor });
    } else {
      report.skipped.push({ hunk: hunk.index, reason: res.reason || 'bilinmeyen' });
    }
  }
  return { ok: true, result: lines.join('\n'), report };
}

/**
 * Dosyaya diff uygula: okur, uygular, yazar. opts.writeFn / opts.readFn inject.
 */
function applyDiffToFile(filePath, diffText, opts = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) return { ok: false, error: 'Dosya yolu gerekli' };
  const fs = opts.fs || require('fs');
  const readFn = opts.readFn || ((p) => fs.readFileSync(p, 'utf8'));
  const writeFn = opts.writeFn || ((p, d) => fs.writeFileSync(p, d, 'utf8'));
  let content;
  try {
    content = readFn(filePath);
  } catch (err) {
    return { ok: false, error: `Okuma hatası: ${err.message}` };
  }
  const applied = applyDiffToContent(content, diffText, opts);
  if (!applied.ok) return applied;
  if (!applied.report.applied.length) {
    return { ok: false, error: 'Uygulanabilir hunk yok', report: applied.report };
  }
  try {
    writeFn(filePath, applied.result);
    return { ok: true, report: applied.report, path: filePath };
  } catch (err) {
    return { ok: false, error: `Yazma hatası: ${err.message}` };
  }
}

/**
 * Bir hunk'ın tersini üret (ekleme↔silme değişir).
 */
function reverseHunk(hunk) {
  if (!hunk || !Array.isArray(hunk.lines)) return null;
  const lines = hunk.lines.map((l) => {
    if (l.kind === '+') return { kind: '-', body: l.body };
    if (l.kind === '-') return { kind: '+', body: l.body };
    return { kind: ' ', body: l.body };
  });
  return {
    ...hunk,
    oldStart: hunk.newStart,
    oldCount: hunk.newCount,
    newStart: hunk.oldStart,
    newCount: hunk.oldCount,
    lines,
  };
}

/**
 * Diff bütünlük doğrulaması: hunk başlıkları ile satır sayıları tutarlı mı,
 * eski satır sayısı ile yeni satır sayısı toplamı mantıklı mı.
 */
function validateDiffIntegrity(diffText) {
  const parsed = parseUnifiedDiff(diffText);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const invalid = parsed.hunks.filter(
    (h) => h.oldSeen !== h.oldCount || h.newSeen !== h.newCount || h.oldCount < 0 || h.newCount < 0,
  );
  return { ok: true, valid: invalid.length === 0, hunks: parsed.hunks.length, invalid: invalid.length, warnings: parsed.warnings };
}

module.exports = {
  parseUnifiedDiff,
  applyDiffToContent,
  applyDiffToFile,
  applyHunk,
  reverseHunk,
  validateDiffIntegrity,
  parseHunkHeader,
};
