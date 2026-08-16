/**
 * audit-export.js — Denetim günlüğü dışa aktarma (v3.18 C-2)
 *
 * JSON-lines, CSV ve SARIF (Static Analysis Results Interchange Format,
 * OASIS standardı) biçimlerinde dışa aktarım. SARIF, kurumsal SIEM ve
 * denetim araçlarının (GitHub Code Scanning, DefectDojo vb.) tükettiği
 * standart biçimdir — v3.20 kurumsal katmanının temeli.
 *
 * Not: ham satırlardaki hash zinciri bütünlüğü JSON/CSV'de korunur;
 * SARIF'te denetim kanıtı olarak rules/results'ta taşınır.
 */
'use strict';
const fs = require('fs');
const { auditLogPath } = require('./config/config-store');

function readLines() {
  try {
    const file = auditLogPath();
    if (!fs.existsSync(file)) return [];
    const body = fs.readFileSync(file, 'utf8');
    return body
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function exportAsJson() {
  const lines = readLines();
  return {
    count: lines.length,
    payload: lines.map((e) => ({
      ts: e.ts,
      actor: e.actor,
      action: e.action,
      detail: e.detail || null,
      duration_ms: e.duration_ms || null,
      prev_hash: e.prev_hash || null,
      hash: e.hash || null,
    })),
  };
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportAsCsv() {
  const lines = readLines();
  const header = 'ts,actor,action,detail,duration_ms,prev_hash,hash';
  const rows = lines.map(
    (e) =>
      [
        e.ts,
        csvEscape(e.actor),
        csvEscape(e.action),
        csvEscape(e.detail == null ? '' : JSON.stringify(e.detail)),
        e.duration_ms == null ? '' : e.duration_ms,
        csvEscape(e.prev_hash || ''),
        csvEscape(e.hash || ''),
      ].join(','),
  );
  return { count: lines.length, payload: [header, ...rows].join('\n') };
}

/**
 * SARIF 2.1.0 çıktısı. Her denetim satırı bir "result" olarak
 * map edilir; action türleri SARIF rule'lara dönüştürülür.
 */
function exportAsSarif() {
  const lines = readLines();
  const actions = new Map();
  for (const e of lines) {
    if (e.action && !actions.has(e.action)) {
      actions.set(e.action, actions.size + 1);
    }
  }
  const rules = Array.from(actions.entries()).map(([action, idx]) => ({
    id: `KRVX-${idx}`,
    shortDescription: { text: action },
  }));
  const results = lines.map((e) => ({
    ruleId: actions.get(e.action) != null ? `KRVX-${actions.get(e.action)}` : 'KRVX-0',
    level: e.actor === 'agent' ? 'warning' : 'note',
    message: {
      text: `${e.actor}: ${e.action}${e.detail ? ` — ${JSON.stringify(e.detail).slice(0, 300)}` : ''}`,
    },
    properties: {
      ts: e.ts,
      duration_ms: e.duration_ms || null,
      prev_hash: e.prev_hash || null,
      hash: e.hash || null,
    },
  }));
  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Krevyx Audit',
            informationUri: 'https://github.com/yasinkaya701/OllamaX',
            version: '3.18.0',
            rules,
          },
        },
        results,
      },
    ],
  };
  return { count: lines.length, payload: sarif };
}

function exportAs(format) {
  switch (format) {
    case 'csv':
      return exportAsCsv();
    case 'sarif':
      return exportAsSarif();
    case 'json':
    default:
      return exportAsJson();
  }
}

module.exports = {
  exportAs,
  exportAsJson,
  exportAsCsv,
  exportAsSarif,
  readLines,
};
