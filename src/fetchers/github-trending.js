export default {
  async fetch(config) {
    const topN = config.topN || 20;
    const since = config.since || 'weekly';
    const daysBack = since === 'daily' ? 1 : since === 'monthly' ? 30 : 7;
    const cutoff = new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const query = config.language
      ? `created:>${cutoff} language:${config.language}`
      : `created:>${cutoff}`;

    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${topN}`,
      {
        headers: {
          'User-Agent': 'skill-weekly-tracker/1.0',
          Accept: 'application/vnd.github+json',
          ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        },
      }
    );
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
    const json = await res.json();

    const base = (json.items || []).slice(0, topN).map((repo, i) => ({
      id: repo.full_name.toLowerCase().replace(/\//g, '--'),
      name: repo.full_name,
      url: repo.html_url,
      score: repo.stargazers_count,
      scoreLabel: `${repo.stargazers_count.toLocaleString()} stars`,
      description: repo.description || '',
      tags: repo.topics?.slice(0, 4) || [],
      rank: i + 1,
    }));

    // Fetch README for each repo in parallel (raw endpoint, higher rate limit)
    const items = await Promise.all(base.map(async item => {
      const readme = await fetchReadme(item.name);
      return readme
        ? { ...item, description: readme }
        : item;
    }));

    return {
      source: 'github-trending',
      label: config.label || 'GitHub Trending',
      fetchedAt: new Date().toISOString(),
      items,
    };
  },
};

async function fetchReadme(fullName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${fullName}/HEAD/README.md`,
      { signal: controller.signal, headers: { 'User-Agent': 'skill-weekly-tracker/1.0' } }
    );
    if (!res.ok) return '';
    return cleanMarkdown(await res.text(), 600);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function cleanMarkdown(raw, maxLen = 600) {
  const text = raw
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .replace(/>\s+/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const last = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return last > maxLen * 0.6 ? cut.slice(0, last + 1) : cut + '…';
}
