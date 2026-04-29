import crypto from 'crypto';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir    = resolve(__dirname, '../data');
const reportsDir = resolve(__dirname, '../reports');

// ── Load .env ───────────────────────────────────────────────────────
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq < 1 || line.trimStart().startsWith('#')) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const WEBHOOK  = process.env.DINGTALK_WEBHOOK;
const SIGN_KEY = process.env.DINGTALK_SIGN_KEY;

if (!WEBHOOK || !SIGN_KEY) {
  console.error('缺少环境变量 DINGTALK_WEBHOOK / DINGTALK_SIGN_KEY');
  process.exit(1);
}

// ── 加签 ────────────────────────────────────────────────────────────
function makeSign(ts) {
  const raw = `${ts}\n${SIGN_KEY}`;
  return encodeURIComponent(
    crypto.createHmac('sha256', SIGN_KEY).update(raw).digest('base64')
  );
}

// ── 发送到钉钉（带签名） ─────────────────────────────────────────────
async function postToDingTalk(payload) {
  const ts  = Date.now();
  const url = `${WEBHOOK}&timestamp=${ts}&sign=${makeSign(ts)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ── 上传 HTML 到 transfer.sh，返回下载 URL ──────────────────────────
async function uploadHtml(htmlPath) {
  const filename = `skill-weekly-${Date.now()}.html`;
  const content  = readFileSync(htmlPath);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`https://transfer.sh/${filename}`, {
      method: 'PUT',
      signal: controller.signal,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Max-Days': '7' },
      body: content,
    });
    if (!res.ok) throw new Error(`transfer.sh HTTP ${res.status}`);
    return (await res.text()).trim();
  } finally {
    clearTimeout(timer);
  }
}

// ── 构建 Markdown 摘要 ──────────────────────────────────────────────
function buildSummary(snapshot, lastSnapshot) {
  const d    = new Date(snapshot.fetchedAt);
  const week = `${d.getFullYear()}年${d.getMonth() + 1}月第${Math.ceil(d.getDate() / 7)}周`;

  const lastIndex = new Map();
  for (const src of lastSnapshot?.sources || [])
    for (const item of src.items || [])
      lastIndex.set(`${src.source}::${item.id}`, item);

  let md = `## 📊 技术热榜周报 · ${week}\n\n`;

  for (const src of snapshot.sources) {
    if (!src.items?.length) continue;
    md += `### ${src.label}\n\n`;
    for (const item of src.items) {
      const last  = lastIndex.get(`${src.source}::${item.id}`);
      const isNew = !last;
      const isHot = !isNew && (item.score - last.score) > item.score * 0.1;
      const icon  = isNew ? '🆕 ' : isHot ? '🔥 ' : '';
      const name  = item.name || item.id;
      const link  = item.url ? `[${name}](${item.url})` : `**${name}**`;

      let starsStr = '';
      if (item.githubStars != null) {
        starsStr = `  ★ ${fmt(item.githubStars)} Stars`;
        if (last?.githubStars != null && item.githubStars > last.githubStars)
          starsStr += ` (+${fmt(item.githubStars - last.githubStars)} 较上期)`;
      }

      md += `${icon}**#${item.rank}** ${link}\n`;
      md += `> ${item.scoreLabel}${starsStr}\n\n`;
    }
  }
  return md.trimEnd();
}

function fmt(n) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }

// ── 主流程 ──────────────────────────────────────────────────────────
async function send() {
  // 找最新快照
  const snapFiles = existsSync(dataDir)
    ? readdirSync(dataDir).filter(f => f.endsWith('.json')).sort().reverse()
    : [];
  if (!snapFiles.length) {
    console.error('未找到快照，请先运行 node src/index.js');
    process.exit(1);
  }
  const snapshot     = JSON.parse(readFileSync(resolve(dataDir, snapFiles[0]), 'utf8'));
  const lastSnapshot = snapFiles[1]
    ? JSON.parse(readFileSync(resolve(dataDir, snapFiles[1]), 'utf8'))
    : null;

  // 找对应 HTML 文件
  const weekKey  = snapFiles[0].replace('.json', '');          // e.g. 2026-W18
  const htmlPath = resolve(reportsDir, `${weekKey}.html`);

  const d     = new Date(snapshot.fetchedAt);
  const week  = `${d.getFullYear()}年${d.getMonth() + 1}月第${Math.ceil(d.getDate() / 7)}周`;
  const title = `📊 技术热榜周报 · ${week}`;

  // 1️⃣ 尝试上传 HTML 并发链接卡片
  if (existsSync(htmlPath)) {
    console.log('上传 HTML 到 transfer.sh ...');
    try {
      const fileUrl = await uploadHtml(htmlPath);
      console.log(`上传成功：${fileUrl}`);

      const totalItems = snapshot.sources.reduce((n, s) => n + (s.items?.length ?? 0), 0);
      const desc = `本期精选 ${totalItems} 个热门技能，点击查看完整 HTML 周报（7 天有效）`;

      const json = await postToDingTalk({
        msgtype: 'link',
        link: { title, text: desc, picUrl: '', messageUrl: fileUrl },
      });

      if (json.errcode === 0) {
        console.log('✓ HTML 链接已推送到钉钉');
        return;
      }
      console.warn('链接卡片发送失败，降级为 Markdown 摘要：', json);
    } catch (err) {
      console.warn('上传失败，降级为 Markdown 摘要：', err.message);
    }
  }

  // 2️⃣ 降级：发 Markdown 摘要
  const text = buildSummary(snapshot, lastSnapshot);
  const json = await postToDingTalk({ msgtype: 'markdown', markdown: { title, text } });

  if (json.errcode === 0) {
    console.log('✓ Markdown 摘要已推送到钉钉');
  } else {
    console.error('✗ 钉钉错误：', JSON.stringify(json));
    process.exit(1);
  }
}

send().catch(err => { console.error(err); process.exit(1); });
