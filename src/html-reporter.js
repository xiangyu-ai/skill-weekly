/* ─── Category definitions ──────────────────────────────────────── */
const CATEGORIES = [
  { id: 'ai',       label: 'AI & Agent 自动化', icon: '🤖', accent: '#7c3aed', light: '#f5f3ff', border: '#c4b5fd' },
  { id: 'frontend', label: '前端 & 界面设计',   icon: '🎨', accent: '#0891b2', light: '#ecfeff', border: '#67e8f9' },
  { id: 'devtools', label: '开发工具',           icon: '🔧', accent: '#d97706', light: '#fffbeb', border: '#fcd34d' },
  { id: 'backend',  label: '后端 & 数据',        icon: '🗄', accent: '#059669', light: '#ecfdf5', border: '#6ee7b7' },
  { id: 'mobile',   label: '移动端开发',         icon: '📱', accent: '#dc2626', light: '#fef2f2', border: '#fca5a5' },
  { id: 'other',    label: '其他',               icon: '📌', accent: '#6b7280', light: '#f9fafb', border: '#d1d5db' },
];
const CAT_KEYWORDS = {
  ai:       ['ai', 'agent', 'llm', 'gpt', 'claude', 'gemini', 'model', 'browser', 'automation', 'anthropic', 'openai', 'skill', 'mcp', 'copilot'],
  frontend: ['react', 'vue', 'css', 'design', 'ui', 'ux', 'frontend', 'next', 'svelte', 'tailwind', 'animation', 'component', 'html', 'interface', 'layout', 'theme', 'web', 'shadcn', 'composition', 'patterns', 'impeccable', 'sleek'],
  devtools: ['tool', 'cli', 'vscode', 'ide', 'workflow', 'deploy', 'ci', 'cd', 'test', 'debug', 'build', 'lint', 'git', 'docker', 'kubernetes', 'infra', 'devops'],
  backend:  ['backend', 'server', 'database', 'postgres', 'redis', 'api', 'cloud', 'storage', 'supabase', 'mongodb', 'sql', 'graphql', 'rest'],
  mobile:   ['ios', 'android', 'mobile', 'react-native', 'native', 'swift', 'kotlin', 'flutter'],
};

function classify(item) {
  const text = `${item.name} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
  for (const [id, keywords] of Object.entries(CAT_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return CATEGORIES.find(c => c.id === id);
  }
  return CATEGORIES.find(c => c.id === 'other');
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function weekLabel(isoString) {
  const d = new Date(isoString);
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const w = Math.ceil(day / 7);
  return { week: `${y}年${m}月第${w}周`, date: `${y}年${m}月${day}日` };
}

function buildSummary(allItems) {
  const catCount = {};
  for (const item of allItems) {
    const cat = classify(item);
    catCount[cat.label] = (catCount[cat.label] || 0) + 1;
  }
  const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => l);
  return `本期精选 ${allItems.length} 个 skills.sh 高热技能，覆盖${topCats.join('、')}等方向，助你的 AI 编程工具快速获得垂直领域专业能力。`;
}

function buildIndex(snapshot) {
  const idx = new Map();
  if (!snapshot) return idx;
  for (const src of snapshot.sources || [])
    for (const item of src.items || [])
      idx.set(`${src.source}::${item.id}`, item);
  return idx;
}


function trendBadge(current, last) {
  if (!last) return `<span class="badge badge-new">首次上榜</span>`;
  const diff = current.score - last.score;
  if (diff > current.score * 0.1) return `<span class="badge badge-hot">🔥 热门上升</span>`;
  if (diff > 0) return `<span class="badge badge-up">↑ 上升</span>`;
  if (diff < 0) return `<span class="badge badge-down">↓ 下降</span>`;
  return `<span class="badge badge-flat">→ 持平</span>`;
}

/* ─── Description renderer ──────────────────────────────────────── */
function renderDescription(desc) {
  if (!desc) return '';
  // Highlight inline `code` spans
  const html = esc(desc).replace(/`([^`]+)`/g, '<code>$1</code>');
  return `<p class="card-desc">${html}</p>`;
}

function fmtStars(n) {
  if (n == null) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* ─── Card renderer ──────────────────────────────────────────────── */
function renderCard(item, lastItem, source) {
  const trend = trendBadge(item, lastItem);

  // Title: original English name (keep case as-is)
  const engName = item.name || item.fullId || item.id;
  const nameLink = item.url
    ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(engName)}</a>`
    : esc(engName);
  // Chinese subtitle (smaller, secondary)
  const subtitle = item.chineseName
    ? `<div class="card-subtitle">${esc(item.chineseName)}</div>`
    : '';

  const tags = (item.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');

  // Stars display: total + weekly delta vs last snapshot
  let starsHtml = '';
  if (item.githubStars != null) {
    const totalLabel = fmtStars(item.githubStars);
    let deltaHtml = '';
    if (lastItem?.githubStars != null) {
      const delta = item.githubStars - lastItem.githubStars;
      if (delta > 0) deltaHtml = `<span class="stars-delta">+${fmtStars(delta)} 较上期</span>`;
    }
    starsHtml = `<span class="stars-count">★ ${totalLabel} Stars${deltaHtml ? ' · ' : ''}</span>${deltaHtml}`;
  }

  return `
  <div class="card">
    <div class="card-head">
      <span class="card-rank">#${item.rank}</span>
      <div class="card-title-wrap">
        <div class="card-title">${nameLink}</div>
        ${subtitle}
      </div>
    </div>
    <div class="card-meta">
      <span class="score">${esc(item.scoreLabel)}</span>
      ${starsHtml}
      ${trend}
      ${tags ? `<span class="tags">${tags}</span>` : ''}
    </div>
    ${renderDescription(item.description)}
    ${item.url ? `<a class="card-url" href="${esc(item.url)}" target="_blank" rel="noopener">🔗 ${esc(item.url)}</a>` : ''}
  </div>`;
}

/* ─── Main export ────────────────────────────────────────────────── */
export function generateHtmlReport(snapshot, lastSnapshot, reportConfig = {}) {
  const { title = '技术热榜周报' } = reportConfig;
  const lastIndex = buildIndex(lastSnapshot);
  const { week, date } = weekLabel(snapshot.fetchedAt);

  const allItems = [];
  for (const src of snapshot.sources) {
    for (const item of src.items || []) allItems.push({ ...item, _source: src.source });
  }

  const summary = buildSummary(allItems);

  // Group by category
  const grouped = new Map(CATEGORIES.map(c => [c.id, { cat: c, items: [] }]));
  allItems.forEach((item, idx) => {
    grouped.get(classify(item).id).items.push({ item, globalRank: idx + 1 });
  });

  const sections = [...grouped.values()]
    .filter(g => g.items.length > 0)
    .map(({ cat, items }) => {
      const cards = items.map(({ item }) => {
        const lastItem = lastIndex.get(`${item._source}::${item.id}`);
        return renderCard(item, lastItem, item._source);
      }).join('');
      return `
  <section class="section" style="--accent:${cat.accent};--light:${cat.light};--border:${cat.border}">
    <h2 class="section-title">
      <span>${cat.icon}</span>${esc(cat.label)}
      <span class="section-count">${items.length} 个技能</span>
    </h2>
    ${cards}
  </section>`;
    }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(title)} · ${esc(week)}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;background:#f0f2f5;color:#1f2937;line-height:1.75;font-size:15px}
    a{color:inherit;text-decoration:none}

    .container{max-width:880px;margin:0 auto;padding:28px 16px 64px}

    /* Header */
    .header{background:#fff;border-radius:16px;padding:40px 36px 32px;margin-bottom:20px;border:1px solid #e5e7eb;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.04)}
    .header-eyebrow{font-size:12px;font-weight:600;letter-spacing:2px;color:#9ca3af;text-transform:uppercase;margin-bottom:10px}
    .header-title{font-size:30px;font-weight:800;color:#111827;letter-spacing:-0.5px;margin-bottom:10px}
    .header-summary{font-size:15px;color:#374151;max-width:560px;margin:0 auto 20px;line-height:1.7}
    .header-meta{font-size:13px;color:#9ca3af;margin-bottom:20px}
    .header-stats{display:inline-flex;gap:10px;flex-wrap:wrap;justify-content:center}
    .stat{background:#f3f4f6;border-radius:8px;padding:5px 14px;font-size:13px;color:#4b5563}
    .stat strong{color:#111827;font-weight:700}

    /* Sections */
    .section{background:#fff;border-radius:14px;padding:24px;margin-bottom:16px;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,.04)}
    .section-title{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700;color:#111827;padding-bottom:14px;margin-bottom:16px;border-bottom:2px solid var(--border)}
    .section-count{margin-left:auto;font-size:12px;font-weight:500;color:#9ca3af;background:#f3f4f6;border-radius:20px;padding:2px 10px}

    /* Cards */
    .card{padding:20px 0;border-bottom:1px solid #f3f4f6}
    .card:last-child{border-bottom:none;padding-bottom:4px}
    .card-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px}
    .card-rank{font-size:13px;font-weight:700;color:#d1d5db;flex-shrink:0;width:28px;text-align:right;padding-top:3px}
    .card-title-wrap{flex:1;min-width:0}
    .card-title{font-size:15px;font-weight:700;color:#1d4ed8;word-break:break-word;font-family:'SF Mono','Fira Code',monospace}
    .card-title a{color:#1d4ed8}
    .card-title a:hover{color:#1e40af;text-decoration:underline}
    .card-subtitle{font-size:12px;color:#9ca3af;margin-top:2px}

    /* Meta */
    .card-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding-left:38px}
    .score{font-size:12px;font-family:'SF Mono','Fira Code',monospace;background:#f3f4f6;border-radius:4px;padding:2px 8px;color:#374151}
    .stars-count{font-size:12px;color:#b45309;font-weight:600}
    .stars-delta{font-size:11px;color:#10b981;font-weight:500;margin-left:2px}
    .badge{font-size:11px;border-radius:4px;padding:2px 8px;font-weight:600}
    .badge-new {background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
    .badge-hot {background:#fff7ed;color:#c2410c;border:1px solid #fed7aa}
    .badge-up  {background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0}
    .badge-down{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
    .badge-flat{background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb}
    .tags{display:inline-flex;gap:4px;flex-wrap:wrap}
    .tag{font-size:11px;background:var(--light);color:var(--accent);border:1px solid var(--border);border-radius:4px;padding:1px 7px}

    /* Description */
    .card-desc{padding-left:38px;font-size:13px;color:#4b5563;line-height:1.8;margin-bottom:8px}
    .card-desc code{background:#f3f4f6;border-radius:3px;padding:1px 5px;font-family:'SF Mono','Fira Code',monospace;font-size:12px;color:#1f2937}

    /* URL */
    .card-url{display:inline-block;padding-left:38px;font-size:12px;color:#9ca3af;word-break:break-all;margin-top:2px}
    .card-url:hover{color:#1d4ed8;text-decoration:underline}

    /* Footer */
    .footer{text-align:center;padding:32px 0 8px;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:8px}
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="header-eyebrow">Skills Weekly</div>
      <div class="header-title">${esc(title)}</div>
      <p class="header-summary">${esc(summary)}</p>
      <div class="header-meta">${esc(week)} · 生成于 ${esc(date)}</div>
      <div class="header-stats">
        <span class="stat"><strong>${snapshot.sources.filter(s => s.items?.length).length}</strong> 个数据源</span>
        <span class="stat"><strong>${allItems.length}</strong> 个精选技能</span>
        <span class="stat"><strong>${[...grouped.values()].filter(g => g.items.length).length}</strong> 个分类</span>
      </div>
    </header>

    ${sections}

    <footer class="footer">
      由 skill-weekly-tracker 自动生成 · 数据来源：${snapshot.sources.filter(s => s.items?.length).map(s => esc(s.label)).join('、')}
    </footer>
  </div>
</body>
</html>`;
}
