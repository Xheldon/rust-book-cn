const assert = require('assert');
const { JSDOM } = require('jsdom');
const { plainTitleFromHtml, applySeo, SITE } = require('./seo');

function doc(html) {
  return new JSDOM(html, { url: `${SITE}/sample.html` }).window.document;
}

const generics = plainTitleFromHtml('使用 Box<T> 指向堆上的数据 - 《Rust 编程语言》');
assert.strictEqual(generics, '使用 Box<T> 指向堆上的数据 - 《Rust 编程语言》');

const typeParams = plainTitleFromHtml('Box<A>、Vec<B> 与 Vec<I>');
assert.strictEqual(typeParams, 'Box<A>、Vec<B> 与 Vec<I>');
assert.strictEqual(plainTitleFromHtml('<i>斜体</i>与<b>粗体</b>'), '斜体与粗体');
assert.strictEqual(
  plainTitleFromHtml('<a class="header" href="#x">标题</a>'),
  '标题'
);

const leaked = plainTitleFromHtml(
  'The Rust Programming Language - <span class="rust">Rust编程语言</span>'
);
assert.strictEqual(leaked, 'The Rust Programming Language - Rust编程语言');
assert.ok(!/</.test(leaked));

const titlePage = doc(`<!DOCTYPE html><html><head>
  <title>The Rust Programming Language - &lt;span class="rust"&gt;Rust编程语言&lt;/span&gt;</title>
  <meta name="description" content="">
</head><body><div id="mdbook-content"><main>
  <p>This version of the text assumes you’re using Rust 1.90.0 (released 2025-09-18) or later with edition 2024.</p>
</main></div></body></html>`);
const home = applySeo(titlePage, 'index.html', {
  upstreamCommit: '05d114287b7d6f6c9253d5242540f00fbd6172ab',
  rustVersion: '1.90.0',
});
assert.strictEqual(home.title, 'The Rust Programming Language - Rust 编程语言');
assert.strictEqual(home.canonical, `${SITE}/`);
assert.ok(!/doc\.rust-lang\.org/.test(home.canonical));
assert.ok(home.description.includes('1.90.0'));
assert.ok(home.description.includes('rust-lang/book@05d1142'));
assert.ok(home.description.includes('中文译本'));
assert.ok(!home.description.includes('<span'));
const banner = titlePage.getElementById('banner-info');
assert.ok(banner);
assert.ok(banner.textContent.includes('rust-lang/book@05d1142'));
assert.ok(banner.textContent.includes('Rust 1.90.0'));
assert.ok(banner.querySelector('a[href*="github.com/rust-lang/book/commit/"]'));

const box = doc(`<!DOCTYPE html><html><head>
  <title>使用 Box&lt;T&gt; 指向堆上的数据 - 《Rust 编程语言》</title>
  <meta name="description" content="">
  <meta name="description" content="Rust 中文文档">
</head><body><div id="mdbook-content"><main>
  <p>Box 允许你将数据放在堆上而不是栈上。堆上的数据仍然有所有权，离开作用域时会被清理。</p>
</main></div></body></html>`);
const boxed = applySeo(box, 'ch15-01-box.html', {
  upstreamCommit: '05d114287b7d6f6c9253d5242540f00fbd6172ab',
  rustVersion: '1.90.0',
});
assert.strictEqual(boxed.title, '使用 Box<T> 指向堆上的数据 - 《Rust 编程语言》');
assert.ok(!/<\/?span/.test(boxed.title));
const serialized = box.querySelector('title').outerHTML;
assert.ok(serialized.includes('Box&lt;T&gt;'), serialized);
assert.ok(!serialized.includes('&amp;lt;'), serialized);
assert.strictEqual(boxed.canonical, `${SITE}/ch15-01-box.html`);
assert.strictEqual(box.querySelectorAll('meta[name="description"]').length, 1);
assert.ok(boxed.description.includes('堆'));
assert.notStrictEqual(boxed.description, home.description);

const redirect = doc(`<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <title>重定向...</title>
  <meta http-equiv="refresh" content="0; URL=ch18-00-oop.html">
  <link rel="canonical" href="ch18-00-oop.html">
</head><body></body></html>`);
const moved = applySeo(redirect, 'ch17-00-oop.html', { rustVersion: '1.90.0' });
assert.strictEqual(moved.canonical, `${SITE}/ch18-00-oop.html`);
assert.strictEqual(moved.indexable, false);
assert.ok(moved.description.includes('ch18-00-oop.html'));
const robots = redirect.querySelector('meta[name="robots"]');
assert.ok(robots);
assert.match(robots.getAttribute('content'), /noindex/);

const stderr = doc(`<!DOCTYPE html><html><head>
  <title>将错误重定向到标准错误 - 《Rust编程语言》</title>
  <meta name="description" content="">
</head><body><div id="mdbook-content"><main>
  <p>到目前为止，我们将所有输出都通过 println! 写到了终端。错误信息应当写到标准错误，这样正常输出和错误可以分开。</p>
</main></div></body></html>`);
const stderrPage = applySeo(stderr, 'ch12-06-writing-to-stderr-instead-of-stdout.html', {
  rustVersion: '1.90.0',
});
assert.strictEqual(stderrPage.indexable, true);
assert.strictEqual(stderrPage.canonical, `${SITE}/ch12-06-writing-to-stderr-instead-of-stdout.html`);
assert.ok(!stderrPage.description.includes('已迁移'));
assert.ok(stderrPage.description.includes('标准错误'));
assert.strictEqual(stderr.querySelector('meta[name="robots"]'), null);

const english = doc(`<!DOCTYPE html><html><head>
  <title>Hello - The Rust Programming Language</title>
  <link rel="canonical" href="https://doc.rust-lang.org/book/ch01-02-hello-world.html">
</head><body><main><p>Hello, world is the traditional first program, and this paragraph is long enough to excerpt.</p></main></body></html>`);
const kept = applySeo(english, 'ch01-02-hello-world.html', {});
assert.strictEqual(kept.canonical, `${SITE}/ch01-02-hello-world.html`);

console.log('seo.test.js ok');
