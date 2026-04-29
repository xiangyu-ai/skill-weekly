// Add new fetchers here — no changes needed elsewhere
import skillsSh from './skills-sh.js';
import githubTrending from './github-trending.js';
import hackernews from './hackernews.js';

const REGISTRY = {
  'skills-sh': skillsSh,
  'github-trending': githubTrending,
  'hackernews': hackernews,
};

export function loadFetcher(type) {
  const fetcher = REGISTRY[type];
  if (!fetcher) throw new Error(`Unknown fetcher type: "${type}". Available: ${Object.keys(REGISTRY).join(', ')}`);
  return fetcher;
}

export function listFetchers() {
  return Object.keys(REGISTRY);
}
