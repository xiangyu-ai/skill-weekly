import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';

function weekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function saveSnapshot(snapshot, dataDir = './data') {
  const id = weekId();
  const path = resolve(dataDir, `${id}.json`);
  writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf8');
  return path;
}

export function loadLastSnapshot(dataDir = './data') {
  if (!existsSync(dataDir)) return null;
  const files = readdirSync(dataDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  // Skip current week, take the one before
  const currentId = weekId();
  const last = files.find(f => f.replace('.json', '') < currentId);
  if (!last) return null;

  try {
    return JSON.parse(readFileSync(resolve(dataDir, last), 'utf8'));
  } catch {
    return null;
  }
}

export function saveReport(content, outputDir = './reports') {
  const id = weekId();
  const path = resolve(outputDir, `${id}.md`);
  writeFileSync(path, content, 'utf8');
  return path;
}

export function saveHtmlReport(content, outputDir = './reports') {
  const id = weekId();
  const path = resolve(outputDir, `${id}.html`);
  writeFileSync(path, content, 'utf8');
  return path;
}
