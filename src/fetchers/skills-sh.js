import { execSync } from 'child_process';

const QUERIES = ['agent', 'react', 'frontend', 'design', 'database', 'deploy', 'mobile', 'test'];

export default {
  async fetch(config) {
    const topN = config.topN || 20;
    const seen = new Map();

    for (const q of QUERIES) {
      let raw;
      try {
        raw = execSync(`npx --yes skills find "${q}"`, { encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) { raw = e.stdout || ''; }

      const clean = raw.replace(/\x1B\[[0-9;]*[mGKHF]/g, '');
      const lines = clean.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^([\w.\-]+\/[\w.\-]+@[\w.\-]+)\s+([\d.,]+[KMB]?)\s+installs/i);
        if (!m) continue;
        const id = m[1];
        const score = parseCount(m[2]);
        const installLabel = m[2];
        const urlLine = lines[i + 1]?.trim() || '';
        const url = urlLine.startsWith('└') ? urlLine.replace(/^└\s*/, '') : 'https://skills.sh/';
        const [owner, repo, skillName] = id.split(/[@/]/);

        if (!seen.has(id)) {
          const chineseName = toChineseName(skillName, owner);
          seen.set(id, {
            id,
            // Keep original English name as display title
            name: skillName,
            fullId: id,
            chineseName,
            _owner: owner,
            _repo: repo,
            url,
            score,
            installs: installLabel,
            scoreLabel: `${installLabel} 次安装`,
            description: buildDescription(skillName, owner, repo, installLabel, chineseName),
            tags: inferTags(skillName),
          });
        }
      }
      if (seen.size >= topN) break;
    }

    // Fetch GitHub stars for unique repos in parallel (cached to avoid duplicate calls)
    const repoStars = new Map();
    const uniqueRepos = [...new Set([...seen.values()].map(i => `${i._owner}/${i._repo}`))];
    await Promise.all(uniqueRepos.map(async repoKey => {
      const stars = await fetchRepoStars(repoKey);
      repoStars.set(repoKey, stars);
    }));

    const items = [...seen.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map((item, i) => {
        const stars = repoStars.get(`${item._owner}/${item._repo}`) ?? null;
        return { ...item, githubStars: stars, rank: i + 1 };
      });

    return {
      source: 'skills-sh',
      label: config.label || 'skills.sh 热门技能',
      fetchedAt: new Date().toISOString(),
      items,
    };
  },
};

async function fetchRepoStars(repoPath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://api.github.com/repos/${repoPath}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'skill-weekly-tracker/1.0',
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });
    if (!res.ok) return null;
    const { stargazers_count } = await res.json();
    return stargazers_count ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Chinese name translation ───────────────────────────────────── */
const TERM_ZH = {
  'best': '最佳', 'practices': '实践', 'best-practices': '最佳实践',
  'guidelines': '设计规范', 'design': '设计', 'frontend': '前端',
  'web': '网页', 'agent': 'Agent', 'browser': '浏览器',
  'composition': '组件组合', 'patterns': '设计模式',
  'native': 'Native', 'mobile': '移动端', 'postgres': 'PostgreSQL',
  'database': '数据库', 'deploy': '部署', 'extract': '提取',
  'system': '系统', 'skills': '技能', 'apps': '应用',
  'vercel': 'Vercel', 'supabase': 'Supabase', 'shadcn': 'shadcn/ui',
  'react': 'React', 'vue': 'Vue', 'next': 'Next.js',
  'sleek': '极简', 'impeccable': '精准', 'animation': '动效',
  'test': '测试', 'testing': '测试', 'lint': '代码检查',
  'api': 'API', 'auth': '认证', 'performance': '性能',
  'accessibility': '无障碍', 'typescript': 'TypeScript',
  'style': '样式', 'color': '色彩', 'layout': '布局',
  'component': '组件', 'hook': 'Hook', 'state': '状态管理',
  'workflow': '工作流', 'automation': '自动化',
};

function toChineseName(skillName = '', owner = '') {
  const parts = skillName.split('-');
  const translated = parts.map(p => TERM_ZH[p.toLowerCase()] ?? capitalize(p)).join(' ');
  // If owner is a known org, prepend it
  const prefix = { 'vercel-labs': 'Vercel', 'anthropics': 'Anthropic', 'supabase': 'Supabase', 'shadcn': 'shadcn' }[owner] ?? '';
  return (prefix && !translated.startsWith(prefix)) ? `${prefix} ${translated}` : translated;
}

/* ─── Description builder — single flowing paragraph ~300 chars ──── */
const ORG_NAMES = {
  'vercel-labs': 'Vercel 工程团队', 'anthropics': 'Anthropic 官方',
  'supabase': 'Supabase 官方', 'shadcn': 'shadcn/ui 作者',
  'pbakaus': '独立开发者 pbakaus', 'obra': '独立团队 obra',
};

function buildDescription(skillName, owner, repo, installLabel, chineseName) {
  const n = skillName.toLowerCase();
  const domain = inferDomain(n);
  const org = ORG_NAMES[owner] ?? `${owner} 团队`;
  const fn = inferFunction(n, domain, org);
  const users = inferUsers(n, domain);
  const innovation = inferInnovation(n, org);

  return `${chineseName}（${skillName}）由 ${org} 发布于 skills.sh，` +
    `是专注于${domain}的 AI Agent 技能包。${fn}` +
    `主要面向${users}，${innovation}` +
    `目前安装量已达 ${installLabel}，可通过 \`npx skills add ${owner}/${repo}@${skillName}\` 集成到 Claude Code、Cursor 等主流 AI 工具。`;
}

function inferFunction(n, domain, org) {
  if (n.includes('react') && n.includes('best-practices'))
    return `该技能将 ${org.includes('Vercel') ? 'Vercel' : org} 内部积累的 React/Next.js 工程规范系统化，覆盖 Server Components 使用方式、数据获取策略与性能优化要点，AI 助手加载后可在代码生成时自动遵循这些生产级标准，无需开发者反复提示。`;
  if (n.includes('frontend') && n.includes('design'))
    return `该技能为 AI 注入系统化的前端设计语言，涵盖布局网格、排版层次、色彩系统与交互反馈规范，使 AI 生成的 UI 代码兼顾视觉美感与可访问性，符合现代设计系统标准。`;
  if (n.includes('web') && n.includes('design'))
    return `该技能提供面向 AI 的网页设计决策框架，涵盖响应式布局、视觉层次与组件交互规范，帮助 AI 在输出设计方案时兼顾美观性、可用性与跨设备适配。`;
  if (n.includes('supabase') || (n.includes('postgres') && n.includes('best')))
    return `该技能将 ${n.includes('supabase') ? 'Supabase' : 'PostgreSQL'} 数据库设计最佳实践注入 AI，包含表结构设计、索引优化、RLS 行级权限策略及实时订阅配置，AI 生成的数据模型与 SQL 可直接用于生产环境而无需二次审查。`;
  if (n.includes('browser'))
    return `该技能赋予 AI Agent 原生浏览器操控能力，可通过自然语言指令完成页面导航、元素交互、表单填写与内容采集，适合快速构建 Web 自动化脚本与信息抓取流程。`;
  if (n.includes('composition') || n.includes('patterns'))
    return `该技能将经典设计模式（组合、依赖注入、工厂等）与现代前端组件化思想融合，为 AI 提供可复用的代码结构模板，生成更具可维护性与扩展性的架构代码。`;
  if (n.includes('mobile') || n.includes('native'))
    return `该技能为 AI 提供 React Native 跨平台开发规范，涵盖平台适配、手势交互与导航架构，让 AI 输出的移动端代码在 iOS 与 Android 上均可高质量运行。`;
  if (n.includes('shadcn'))
    return `该技能深度集成 shadcn/ui 组件库的使用规范，帮助 AI 正确调用、组合与定制 shadcn 组件，生成符合设计系统一致性要求的 UI 代码。`;
  return `该技能为 AI Agent 提供${domain}领域的专业知识与操作规范，使 AI 在处理相关任务时具备更深的领域上下文，显著提升生成代码的准确性与行业标准符合度。`;
}

function inferUsers(n, domain) {
  if (n.includes('react') || n.includes('frontend') || n.includes('design') || n.includes('web'))
    return '前端工程师、UI/UX 设计师及使用 AI 工具进行 React/Next.js 开发的团队';
  if (n.includes('postgres') || n.includes('supabase') || n.includes('database'))
    return '后端工程师、全栈开发者及希望通过 AI 快速构建可靠数据层的独立开发者';
  if (n.includes('browser') || n.includes('agent'))
    return 'AI Agent 开发者、RPA 工程师及希望以最低门槛实现 Web 自动化的产品团队';
  if (n.includes('mobile') || n.includes('native'))
    return 'React Native 开发者及跨平台移动应用团队';
  return `${domain}方向的开发者与工程团队`;
}

function inferInnovation(n, org) {
  if (n.includes('react') && n.includes('best-practices'))
    return `其创新在于将 ${org.includes('Vercel') ? 'Vercel' : org} 的私域工程经验直接"技能化"，让 AI 无需人工提示即可实时调用权威规范，规避常见的反模式。`;
  if (n.includes('design') || n.includes('frontend'))
    return `其创新在于将设计系统中隐性的审美规则转化为 AI 可执行的显性指令，填补了通用 AI 在视觉设计判断上的短板。`;
  if (n.includes('postgres') || n.includes('supabase'))
    return `其创新在于将数据库安全规范（RLS、权限隔离）与性能调优标准同时注入 AI 上下文，使生成代码天然具备生产安全属性。`;
  if (n.includes('browser'))
    return `其创新在于无需部署额外驱动服务，直接通过技能包赋予 AI 浏览器控制能力，大幅降低 Web 自动化的接入门槛。`;
  return `其创新在于将垂直领域的专业知识以"可插拔"形式注入通用 AI 工具，突破了 AI 在细分场景下的上下文局限。`;
}

function inferDomain(n) {
  if (n.includes('react') || n.includes('frontend') || n.includes('design') || n.includes('web')) return '前端与界面设计';
  if (n.includes('agent') || n.includes('automation') || n.includes('browser')) return 'AI Agent 自动化';
  if (n.includes('postgres') || n.includes('supabase') || n.includes('database')) return '数据库与数据管理';
  if (n.includes('deploy') || n.includes('docker') || n.includes('infra')) return '部署与基础设施';
  if (n.includes('mobile') || n.includes('native')) return '移动端开发';
  return '软件工程效率';
}

function inferTags(name = '') {
  const n = name.toLowerCase();
  const tags = [];
  if (/react|next/.test(n)) tags.push('React');
  if (/design|ui|ux/.test(n)) tags.push('设计');
  if (/agent|ai|browser/.test(n)) tags.push('AI Agent');
  if (/postgres|sql|supabase/.test(n)) tags.push('数据库');
  if (/deploy|cloud|infra/.test(n)) tags.push('部署');
  if (/mobile|native/.test(n)) tags.push('移动端');
  if (/test/.test(n)) tags.push('测试');
  return tags;
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function parseCount(str = '') {
  const s = str.replace(/,/g, '').trim();
  const n = parseFloat(s);
  if (!n) return 0;
  if (/B/i.test(s)) return n * 1e9;
  if (/M/i.test(s)) return n * 1e6;
  if (/K/i.test(s)) return n * 1e3;
  return n;
}
