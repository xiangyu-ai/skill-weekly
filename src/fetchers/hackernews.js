export default {
  async fetch(config) {
    const topN = config.topN || 15;
    const query = encodeURIComponent(config.query || 'AI agent tools');
    const url = `https://hn.algolia.com/api/v1/search?tags=story&query=${query}&hitsPerPage=${topN}`;

    const res = await fetch(url, { headers: { 'User-Agent': 'skill-weekly-tracker/1.0' } });
    if (!res.ok) throw new Error(`HN API HTTP ${res.status}`);
    const json = await res.json();

    const items = (json.hits || []).map((hit, i) => {
      let domain = '';
      try { domain = new URL(hit.url).hostname.replace('www.', ''); } catch {}

      const bodyText = stripHtml(hit.story_text || '');
      const description = buildDescription(hit.title, domain, bodyText);

      return {
        id: `hn-${hit.objectID}`,
        name: hit.title,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        score: hit.points || 0,
        scoreLabel: `${hit.points ?? 0} pts · ${hit.num_comments ?? 0} comments`,
        description,
        tags: domain ? [domain] : [],
        rank: i + 1,
      };
    });

    return {
      source: 'hackernews',
      label: config.label || 'Hacker News',
      fetchedAt: new Date().toISOString(),
      items,
    };
  },
};

function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDescription(title, domain, bodyText) {
  const parts = [];
  if (bodyText) parts.push(bodyText.slice(0, 500));
  if (domain && !bodyText) parts.push(`来源：${domain}。本文由 Hacker News 社区推荐，讨论主题为「${title}」。`);
  const result = parts.join(' ').trim();
  if (result.length < 80) {
    return `Hacker News 热门讨论：「${title}」。${domain ? `来源：${domain}。` : ''}该帖子在 HN 社区引发讨论，欢迎点击链接查看完整内容与评论。`;
  }
  return result;
}
