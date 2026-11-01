// 构建后的 SEO：纯文本 title、按页 description、自指 canonical、sitemap / robots。
// 中文译本的 canonical 必须落在本站，不能指向英文原站。

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SITE = 'https://rust.xheldon.com';
const UPSTREAM_REPO = 'https://github.com/rust-lang/book';
const TRANSLATION_REPO = 'https://github.com/Xheldon/rust-book-cn';

// 只剥掉误写入标题的小写 HTML 标签。不要加 i：Box<A>、Vec<B>、Vec<I> 里的类型参数
// 与 <a>/<b>/<i> 只有大小写之差，大小写不敏感会把它们删掉。Box<T>、<String> 同样保留。
const LEAKED_HTML_TAG =
  /<\/?(?:span|a|em|code|strong|i|b|br|p|div|small|sup|sub|mark|h[1-6])\b[^>]*>/g;

const SKIP_SITEMAP = new Set(['print.html', 'toc.html', '404.html']);

function plainTitleFromHtml(html) {
  return String(html || '')
    .replace(LEAKED_HTML_TAG, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function repairTitle(titleEl) {
  if (!titleEl) return '';
  const text = plainTitleFromHtml(titleEl.textContent);
  titleEl.textContent = text;
  return text;
}

function collapse(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function clip(text, max) {
  const clean = collapse(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const punct = Math.max(
    cut.lastIndexOf('。'),
    cut.lastIndexOf('. '),
    cut.lastIndexOf('，'),
    cut.lastIndexOf(', ')
  );
  if (punct > 40) return cut.slice(0, punct + 1).trim();
  return `${cut.trim()}…`;
}

function readUpstreamCommit() {
  const file = path.resolve(__dirname, 'last-commit.txt');
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').trim();
}

function rustVersionFrom(document) {
  const main = document.querySelector('main');
  const source = main ? main.textContent : document.body ? document.body.textContent : '';
  const match = source.match(/Rust\s+(\d+\.\d+\.\d+)/);
  return match ? match[1] : '';
}

function pageFilename(file) {
  return path.basename(file);
}

function isRedirect(document) {
  // 只认真实跳转标记。标题里的「重定向」（如「将错误重定向到标准错误」）不是跳转页。
  return Boolean(document.querySelector('meta[http-equiv="refresh" i]'));
}

function resolveCanonical(document, filename) {
  const existing = document.querySelector('link[rel="canonical"]');
  let target = filename;
  if (existing) {
    const href = (existing.getAttribute('href') || '').trim();
    if (href && !/^https?:\/\//i.test(href)) {
      target = href.split('#')[0].replace(/^\.\//, '');
    } else if (/doc\.rust-lang\.org/i.test(href)) {
      target = filename;
    } else if (href.startsWith(SITE)) {
      return href.split('#')[0];
    }
  }
  if (!target || target === 'index.html') return `${SITE}/`;
  return `${SITE}/${target}`;
}

function isByline(text) {
  return /^(by|作者)\b/i.test(text) || text.startsWith('由 ');
}

function normalizeBookTitle(title) {
  const compact = collapse(title);
  if (
    /^The Rust Programming Language - The Rust Programming Language/.test(compact) ||
    /^The Rust Programming Language - Rust\s*编程语言$/.test(compact)
  ) {
    return 'The Rust Programming Language - Rust 编程语言';
  }
  return compact;
}

function excerptFrom(document) {
  const main = document.querySelector('main');
  if (!main) return '';
  const paragraphs = [...main.querySelectorAll('p')]
    .map((p) => collapse(p.textContent))
    .filter((text) => text && !isByline(text));
  const useful = paragraphs.find((text) => text.length >= 40);
  return useful || paragraphs.find(Boolean) || '';
}

function buildDescription(document, title, canonical, filename, options = {}) {
  if (filename === '404.html' || /页面未找到/.test(title)) {
    return '未找到该页面。《Rust 程序设计语言》中文译本。';
  }
  if (isRedirect(document)) {
    const target = canonical.split('/').pop();
    return `本页（${filename}）已迁移至 ${target}。《Rust 程序设计语言》中文译本。`;
  }
  const sha = (options.upstreamCommit || '').slice(0, 7);
  const version = options.rustVersion ? `正文对应 Rust ${options.rustVersion}` : '';
  if (filename === 'index.html') {
    const upstream = sha ? `对照上游 rust-lang/book@${sha}` : '对照上游 rust-lang/book';
    return `《Rust 程序设计语言》中文译本（AI + 人工），${upstream}${version ? `，${version}` : ''}。`;
  }
  const excerpt = clip(excerptFrom(document), 140);
  const identity = '《Rust 程序设计语言》中文译本';
  if (filename === 'print.html') {
    return excerpt
      ? `单页印刷视图。${excerpt} ${identity}。`
      : `《Rust 程序设计语言》中文译本的单页印刷视图。`;
  }
  if (!excerpt) return title ? `${title}。${identity}。` : `${identity}。`;
  return `${excerpt} ${identity}。`;
}

function ensureNoindex(head) {
  const robots = head.querySelector('meta[name="robots"]');
  if (!robots) {
    upsertMeta(head, 'name', 'robots', 'noindex');
    return;
  }
  const content = robots.getAttribute('content') || '';
  if (!/noindex/i.test(content)) {
    robots.setAttribute('content', content ? `${content}, noindex` : 'noindex');
  }
}

function upsertMeta(head, attr, key, content) {
  const nodes = [...head.querySelectorAll(`meta[${attr}="${key}"]`)];
  let node = nodes[0];
  if (!node) {
    node = head.ownerDocument.createElement('meta');
    node.setAttribute(attr, key);
    head.appendChild(node);
  }
  node.setAttribute('content', content);
  for (const extra of nodes.slice(1)) extra.remove();
}

function identityHtml(document, filename, upstreamCommit, rustVersion) {
  const short = upstreamCommit ? upstreamCommit.slice(0, 7) : '';
  const commitHref = upstreamCommit
    ? `${UPSTREAM_REPO}/commit/${upstreamCommit}`
    : UPSTREAM_REPO;
  const commitLabel = short ? `rust-lang/book@${short}` : 'rust-lang/book';
  const version = rustVersion ? `，正文对应 Rust ${rustVersion}` : '';
  const dictBase = filename.replace(/\.html$/, '');
  const dictHref = `${TRANSLATION_REPO}/blob/main/dict/${dictBase}.json`;
  const help =
    filename === '404.html'
      ? ''
      : ` <a href="${dictHref}">本页翻译有问题？</a>`;
  return `本站为《Rust 程序设计语言》中文译本（AI + 人工），对照上游 <a href="${commitHref}">${commitLabel}</a>${version}。${help}`;
}

function patchBannerCss(document) {
  const next = `#banner-info {
  position: relative;
  display: block;
  width: 100%;
  box-sizing: border-box;
  font-size: 12px;
  line-height: 1.5;
  padding: 6px 16px;
  text-align: center;
  z-index: 1;
}`;
  for (const style of document.querySelectorAll('style')) {
    if (!style.textContent || !style.textContent.includes('#banner-info')) continue;
    style.textContent = style.textContent.replace(/#banner-info\s*\{[^}]*\}/, next);
  }
}

function mountIdentity(document, filename, upstreamCommit, rustVersion) {
  if (filename === 'toc.html') return;
  patchBannerCss(document);
  let banner = document.getElementById('banner-info');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'banner-info';
    const slot =
      document.querySelector('#mdbook-content') ||
      document.querySelector('#content') ||
      document.querySelector('main') ||
      document.body;
    slot.insertBefore(banner, slot.firstChild);
  }
  banner.innerHTML = identityHtml(document, filename, upstreamCommit, rustVersion);
}

function applySeo(document, file, options = {}) {
  const filename = pageFilename(file);
  // 侧边栏 iframe，本身 noindex，不注入正文 SEO。
  if (filename === 'toc.html') {
    return { filename, canonical: '', description: '', title: '', indexable: false };
  }
  const head = document.querySelector('head');
  if (!head) return { filename, canonical: '', description: '', title: '', indexable: false };

  const html = document.querySelector('html');
  if (html && !html.getAttribute('lang')) html.setAttribute('lang', 'zh-CN');

  const titleEl = document.querySelector('title');
  let title = normalizeBookTitle(repairTitle(titleEl));
  if (titleEl) titleEl.textContent = title;
  const upstreamCommit = options.upstreamCommit || '';
  const rustVersion = options.rustVersion || rustVersionFrom(document);
  const canonical = resolveCanonical(document, filename);
  const description = buildDescription(document, title, canonical, filename, {
    upstreamCommit,
    rustVersion,
  });

  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    head.appendChild(link);
  }
  link.setAttribute('href', canonical);

  upsertMeta(head, 'name', 'description', description);
  upsertMeta(head, 'property', 'og:description', description);
  upsertMeta(head, 'property', 'og:title', title);
  upsertMeta(head, 'name', 'title', title);
  upsertMeta(head, 'property', 'og:url', canonical);
  upsertMeta(head, 'name', 'url', canonical);
  upsertMeta(head, 'property', 'og:locale', 'zh_CN');

  mountIdentity(document, filename, upstreamCommit, rustVersion);

  const redirect = isRedirect(document);
  if (redirect) ensureNoindex(head);
  const robots = document.querySelector('meta[name="robots"]');
  const noindex = robots && /noindex/i.test(robots.getAttribute('content') || '');
  const indexable = !noindex && !redirect && !SKIP_SITEMAP.has(filename);

  return { filename, canonical, description, title, indexable };
}

function writeSitemapAndRobots(dir, entries) {
  const locs = [...new Set(entries.filter((e) => e.indexable).map((e) => e.canonical))].sort(
    (a, b) => a.localeCompare(b)
  );
  const body = locs.map((loc) => `  <url><loc>${loc}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  fs.writeFileSync(path.join(dir, 'sitemap.xml'), xml);
  fs.writeFileSync(
    path.join(dir, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`
  );
  return locs;
}

function processBookDir(dir, options = {}) {
  const upstreamCommit = options.upstreamCommit || readUpstreamCommit();
  let rustVersion = options.rustVersion || '';
  if (!rustVersion) {
    const indexFile = path.join(dir, 'index.html');
    if (fs.existsSync(indexFile)) {
      const match = fs.readFileSync(indexFile, 'utf8').match(/Rust\s+(\d+\.\d+\.\d+)/);
      if (match) rustVersion = match[1];
    }
  }

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.html'))
    .sort();
  const entries = [];
  for (const name of files) {
    // toc 是侧边栏 iframe。print 是整书单页，jsdom 再序列化会改动正文，且页面已 noindex。
    if (name === 'toc.html' || name === 'print.html') {
      entries.push({ filename: name, canonical: '', description: '', title: '', indexable: false });
      continue;
    }
    const file = path.join(dir, name);
    const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { url: `${SITE}/${name}` });
    const entry = applySeo(dom.window.document, file, { upstreamCommit, rustVersion });
    fs.writeFileSync(file, dom.serialize());
    entries.push(entry);
  }
  const locs = writeSitemapAndRobots(dir, entries);
  return { entries, locs, upstreamCommit, rustVersion };
}

module.exports = {
  SITE,
  LEAKED_HTML_TAG,
  plainTitleFromHtml,
  repairTitle,
  resolveCanonical,
  buildDescription,
  applySeo,
  processBookDir,
  writeSitemapAndRobots,
};

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, 'public'));
  const result = processBookDir(dir);
  const badTitles = result.entries.filter((e) => /<\/?(span|a|em|code)\b/i.test(e.title));
  const empty = result.entries.filter(
    (e) => e.filename !== 'toc.html' && e.filename !== 'print.html' && !e.description
  );
  const offsite = result.entries.filter((e) => /doc\.rust-lang\.org/i.test(e.canonical));
  console.log(
    `SEO ${dir}: ${result.entries.length} pages, sitemap ${result.locs.length}, upstream ${result.upstreamCommit.slice(0, 7)}, Rust ${result.rustVersion || '?'}`
  );
  if (badTitles.length || empty.length || offsite.length) {
    console.error('bad titles', badTitles.map((e) => e.filename));
    console.error('empty descriptions', empty.map((e) => e.filename));
    console.error('offsite canonical', offsite.map((e) => e.filename));
    process.exit(1);
  }
}
