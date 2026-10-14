(async () => {
  if (!window.siyuan.config.system.workspaceDir.includes("siyuan-browser-test"))
    throw Error("Not test workspace");
  const p = window.siyuan.ws.app.plugins.find(
    (p) => p.name === "siyuan-browser",
  );
  const report = {
    time: new Date().toISOString(),
    engine: "defuddle@0.19.4",
    pass: false,
  };
  try {
    await p.open("http://127.0.0.1:17841/article");
    let v;
    for (let i = 0; i < 100; i++) {
      v = [...p.views]
        .reverse()
        .find((v) => v.url === "http://127.0.0.1:17841/article");
      try {
        if (
          v &&
          (await v.web.executeJavaScript("document.title === '公式与结构测试'"))
        )
          break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!v) throw Error("Fixture unavailable");
    const article = await v.article();
    if (!article.html.includes("data-latex"))
      throw Error("Formula metadata missing");
    await p.savePage(v);
    const job = p.jobs[0];
    if (job.body !== "saved") throw Error(job.error || "Save failed");
    const response = await fetch("/api/block/getBlockKramdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.docId }),
    });
    const result = await response.json();
    const md = result.data.kramdown;
    const checks = {
      inline: md.includes("E=mc^2"),
      integral: md.includes("\\int_0^1"),
      aligned: md.includes("\\begin{aligned}"),
      matrix: md.includes("\\begin{pmatrix}"),
      fraction: md.includes("\\frac{a}{b}"),
      code: md.includes("def square(x)"),
      footnote: md.includes("脚注正文"),
      asset: md.includes("assets/web-"),
      snapshot: !!job.snapshot,
    };
    Object.assign(report, {
      pass: Object.values(checks).every(Boolean),
      checks,
      docId: job.docId,
      resources: job.resources,
    });
  } catch (e) {
    report.error = String(e);
  }
  require("node:fs").writeFileSync(
    window.siyuan.config.system.workspaceDir +
      "/temp/browser-defuddle-check.json",
    JSON.stringify(report, null, 2),
  );
  console.log("DEFUDDLE_CHECK", report);
})();
