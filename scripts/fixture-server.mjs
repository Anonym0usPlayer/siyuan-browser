import http from "node:http";
import fs from "node:fs/promises";
const image = await fs.readFile("icon.png");
const article = `<!doctype html><meta charset="utf-8"><title>中文离线归档测试</title><style>body{max-width:760px;margin:32px auto;font:18px/1.7 system-ui}table{border-collapse:collapse}td,th{border:1px solid;padding:6px}img{width:96px}pre{background:#eee;padding:12px}</style><article><h1>中文离线归档测试</h1>${Array.from({ length: 10 }, (_, i) => `<p>第 ${i + 1} 段：这是思源浏览器的中文正文测试。测试正文提取、来源保留、离线资源、表格与代码。保存后的文档必须仍然可编辑，网页快照应在断网条件下展示已加载内容。</p>`).join("")}<table><tr><th>项目</th><th>状态</th></tr><tr><td>中文表格</td><td>待验证</td></tr></table><pre><code>const browser = "isolated";</code></pre><img src="/image.png" alt="测试图片"><img src="/missing.png" alt="故意失败的图片"><p><a href="/next">站内导航</a> · <a href="/popup" target="_blank">打开新标签页</a> · <a href="/download" download>下载文件</a></p><p id="security"></p><input aria-label="编辑测试" value="可编辑文字"><script>document.getElementById('security').textContent='Guest privileges: require='+typeof require+', process='+typeof process;document.cookie='fixture=yes; SameSite=Lax';</script></article>`;
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/image.png") {
      res.setHeader("Content-Type", "image/png");
      res.end(image);
    } else if (url.pathname === "/missing.png") {
      res.writeHead(404);
      res.end("Intentionally unavailable");
    } else if (url.pathname === "/download") {
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="browser-fixture.txt"',
      );
      res.end("Browser download fixture");
    } else if (url.pathname === "/redirect") {
      res.writeHead(302, { Location: "/article" });
      res.end();
    } else if (url.pathname === "/next" || url.pathname === "/popup") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        `<title>${url.pathname}</title><h1>${url.pathname}</h1><a href="/article">返回正文</a>`,
      );
    } else {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(article);
    }
  })
  .listen(17839, "127.0.0.1", () =>
    console.log("Fixture: http://127.0.0.1:17839/article"),
  );
