(async () => {
  const p = window.siyuan.ws.app.plugins.find(
    (p) => p.name === "siyuan-browser",
  );
  if (!window.siyuan.config.system.workspaceDir.includes("siyuan-browser-test"))
    throw Error("Not a test workspace");
  const results = [];
  const check = async (name, fn) => {
    try {
      results.push({
        name,
        pass: true,
        details: await Promise.race([
          fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(Error("Check timed out")), 10000),
          ),
        ]),
      });
    } catch (e) {
      results.push({ name, pass: false, error: String(e) });
    }
  };
  const wait = async (fn) => {
    for (let i = 0; i < 60; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Timed out");
  };
  await p.open("http://127.0.0.1:17839/article");
  for (
    let i = 0;
    i < 60 &&
    ![...p.views].some((v) => v.url === "http://127.0.0.1:17839/article");
    i++
  )
    await new Promise((r) => setTimeout(r, 100));
  const normal = [...p.views]
    .reverse()
    .find((v) => v.url === "http://127.0.0.1:17839/article");
  await p.openArchive(p.jobs[0].snapshot);
  for (let i = 0; i < 60 && ![...p.views].some((v) => v.data.archive); i++)
    await new Promise((r) => setTimeout(r, 100));
  const archive = [...p.views].reverse().find((v) => v.data.archive);
  await check("guest isolation", async () => {
    const privileges = await normal.web.executeJavaScript(
      "JSON.stringify({require:typeof require,process:typeof process,Buffer:typeof Buffer})",
    );
    const prefs = p.adapter.remote.webContents
      .fromId(normal.web.getWebContentsId())
      .getLastWebPreferences();
    if (prefs.nodeIntegration || !prefs.contextIsolation || !prefs.sandbox)
      throw Error("Unsafe web preferences");
    if (!privileges.includes("undefined")) throw Error(privileges);
    return privileges;
  });
  await check("archive isolation and offline reload", async () => {
    if (!archive) throw Error("Archive missing");
    const w = p.adapter.remote.webContents.fromId(
      archive.web.getWebContentsId(),
    );
    const prefs = w.getLastWebPreferences();
    if (prefs.javascript !== false || prefs.nodeIntegration)
      throw Error("Unsafe archive preferences");
    w.session.enableNetworkEmulation({ offline: true });
    archive.web.reload();
    await new Promise((r) => setTimeout(r, 800));
    const title = w.getTitle();
    if (!title.includes("中文离线归档测试"))
      throw Error("Offline title missing");
    return { javascript: prefs.javascript, offline: true, title };
  });
  await check("popup routes into native plugin tab", async () => {
    const before = p.views.size;
    await normal.web.executeJavaScript(
      "window.open('http://127.0.0.1:17839/popup','_blank');undefined",
      true,
    );
    await wait(() => p.views.size > before);
    await wait(() => [...p.views].some((v) => v.url.endsWith("/popup")));
    const popup = [...p.views].find((v) => v.url.endsWith("/popup"));
    const result = { title: popup.title, url: popup.url };
    popup.custom.tab.close();
    return result;
  });
  await check("right split uses host window group", async () => {
    const group = normal.custom.tab.parent;
    await p.open("http://127.0.0.1:17839/next", "right");
    await wait(() => [...p.views].some((v) => v.url.endsWith("/next")));
    const split = [...p.views].find((v) => v.url.endsWith("/next"));
    if (split.custom.tab.parent === group) throw Error("Same window group");
    split.custom.tab.close();
    return "Separate native group";
  });
  await check("session cookie separate from host", async () => {
    const guest = p.adapter.remote.webContents.fromId(
      normal.web.getWebContentsId(),
    ).session;
    const host = p.adapter.remote.getCurrentWebContents().session;
    const gc = await guest.cookies.get({ url: "http://127.0.0.1:17839" }),
      hc = await host.cookies.get({ url: "http://127.0.0.1:17839" });
    if (!gc.some((c) => c.name === "fixture"))
      throw Error("Guest cookie missing");
    if (hc.some((c) => c.name === "fixture"))
      throw Error("Guest cookie leaked into host");
    return { guestFixture: true, hostFixture: false };
  });
  await check("saved body resources snapshot distinct statuses", async () => {
    const j = p.jobs[0];
    if (
      j.body !== "saved" ||
      !j.snapshot ||
      !Object.values(j.resources).some((r) => r.error)
    )
      throw Error("Unexpected save report");
    return { docId: j.docId, resources: j.resources, snapshot: j.snapshot };
  });
  const report = {
    time: new Date().toISOString(),
    platform: navigator.platform,
    host: window.siyuan.config.system.workspaceDir,
    results,
  };
  require("node:fs").writeFileSync(
    window.siyuan.config.system.workspaceDir + "/temp/browser-host-checks.json",
    JSON.stringify(report, null, 2),
  );
  console.log("BROWSER_CHECKS", JSON.stringify(report));
  return report;
})();
