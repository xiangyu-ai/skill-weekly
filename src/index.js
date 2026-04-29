import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { loadFetcher } from './fetchers/registry.js';
import { saveSnapshot, loadLastSnapshot, saveReport, saveHtmlReport } from './storage.js';
import { generateReport } from './reporter.js';
import { generateHtmlReport } from './html-reporter.js';
import { generateIndexPage } from './index-page.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '../config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const reportOnly = process.argv.includes('--report-only');
const doPush = process.argv.includes('--push');
const dataDir = resolve(__dirname, '../data');
const reportsDir = resolve(__dirname, '..', config.report.outputDir || './reports');

async function main() {
  const lastSnapshot = loadLastSnapshot(dataDir);

  let snapshot;
  if (reportOnly) {
    const { readdirSync } = await import('fs');
    const files = readdirSync(dataDir).filter(f => f.endsWith('.json')).sort().reverse();
    if (!files.length) { console.error('No snapshots found. Run without --report-only first.'); process.exit(1); }
    snapshot = JSON.parse(readFileSync(resolve(dataDir, files[0]), 'utf8'));
    console.log(`Using existing snapshot: ${files[0]}`);
  } else {
    console.log('Fetching data from all enabled sources...\n');
    const sources = [];

    for (const srcConfig of config.sources.filter(s => s.enabled)) {
      process.stdout.write(`  Fetching ${srcConfig.label}... `);
      try {
        const fetcher = loadFetcher(srcConfig.type);
        const data = await fetcher.fetch(srcConfig);
        sources.push(data);
        console.log(`OK (${data.items.length} items)`);
      } catch (err) {
        console.log(`FAILED: ${err.message}`);
        sources.push({ source: srcConfig.type, label: srcConfig.label || srcConfig.type, fetchedAt: new Date().toISOString(), items: [], error: err.message });
      }
    }

    // Enforce global item cap proportionally across active sources
    const maxTotal = config.report.maxTotal || 20;
    const activeSources = sources.filter(s => s.items?.length > 0);
    if (activeSources.length > 0) {
      const base = Math.floor(maxTotal / activeSources.length);
      const extra = maxTotal - base * activeSources.length;
      activeSources.forEach((src, i) => {
        src.items = src.items.slice(0, base + (i < extra ? 1 : 0));
      });
    }

    snapshot = { fetchedAt: new Date().toISOString(), sources };
    const snapshotPath = saveSnapshot(snapshot, dataDir);
    console.log(`\nSnapshot saved: ${snapshotPath}`);
  }

  // Generate both Markdown and HTML reports
  const mdReport = generateReport(snapshot, lastSnapshot, config.report);
  const htmlReport = generateHtmlReport(snapshot, lastSnapshot, config.report);

  const mdPath = saveReport(mdReport, reportsDir);
  const htmlPath = saveHtmlReport(htmlReport, reportsDir);

  const indexPath = generateIndexPage();

  console.log(`Markdown:  ${mdPath}`);
  console.log(`HTML:      ${htmlPath}`);
  console.log(`Index:     ${indexPath}\n`);
  console.log('='.repeat(60));
  console.log(mdReport);

  if (doPush) {
    const rootDir = resolve(__dirname, '..');
    const weekTag = htmlPath.replace(/.*[/\\](.+)\.html$/, '$1');
    console.log('\nPushing to Gitee...');
    try {
      execSync('git add index.html reports/', { cwd: rootDir, stdio: 'inherit' });
      execSync(`git commit -m "report: ${weekTag}"`, { cwd: rootDir, stdio: 'inherit' });
      execSync('git push origin main', { cwd: rootDir, stdio: 'inherit' });
      console.log('Pushed OK.');
    } catch (e) {
      console.error('Git push failed:', e.message);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
