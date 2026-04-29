function weekLabel(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

function buildIndex(snapshot) {
  const index = new Map();
  if (!snapshot) return index;
  for (const src of snapshot.sources || []) {
    for (const item of src.items || []) {
      index.set(`${src.source}::${item.id}`, item);
    }
  }
  return index;
}

function trendIcon(current, last) {
  if (!last) return '🆕';
  const diff = current.score - last.score;
  if (diff > current.score * 0.1) return '🔥';
  if (diff > 0) return '↑';
  if (diff < 0) return '↓';
  return '→';
}

export function generateReport(snapshot, lastSnapshot, reportConfig = {}) {
  const { title = 'Weekly Skills & Tools Digest', topN = 10 } = reportConfig;
  const lastIndex = buildIndex(lastSnapshot);
  const now = weekLabel(snapshot.fetchedAt);

  const lines = [
    `# ${title}`,
    ``,
    `> 生成时间：${now}`,
    ``,
  ];

  for (const src of snapshot.sources) {
    if (!src.items || src.items.length === 0) {
      lines.push(`## ${src.label}`, ``, `> 本期无数据`, ``);
      continue;
    }

    lines.push(`## ${src.label}`, ``);

    const top = src.items.slice(0, topN);
    for (const item of top) {
      const lastItem = lastIndex.get(`${src.source}::${item.id}`);
      const icon = trendIcon(item, lastItem);
      const rankStr = item.rank ? `**#${item.rank}**` : '';
      const scoreStr = item.scoreLabel ? `\`${item.scoreLabel}\`` : '';
      const deltaStr = item.delta ? `(+${item.delta} this week)` : '';
      const desc = item.description ? ` — ${item.description.slice(0, 80)}` : '';
      const nameLink = item.url ? `[${item.name}](${item.url})` : item.name;

      lines.push(`${icon} ${rankStr} ${nameLink} ${scoreStr} ${deltaStr}${desc}`.trim());
    }

    // Highlight new entries vs last week
    if (lastSnapshot) {
      const newEntries = top.filter(item => !lastIndex.has(`${src.source}::${item.id}`));
      if (newEntries.length > 0) {
        lines.push(``, `**本周新进榜：** ${newEntries.map(i => i.name).join('、')}`);
      }
    }

    lines.push(``);
  }

  lines.push(
    `---`,
    ``,
    `*由 skill-weekly-tracker 自动生成 | 数据来源：${snapshot.sources.map(s => s.label).join('、')}*`,
  );

  return lines.join('\n');
}
