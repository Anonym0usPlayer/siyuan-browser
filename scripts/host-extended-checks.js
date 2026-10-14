(async () => {
  const p = window.siyuan.ws.app.plugins.find(
    (p) => p.name === "siyuan-browser",
  );
  if (!window.siyuan.config.system.workspaceDir.includes("siyuan-browser-test"))
    throw Error("Not test workspace");
  const results = [];
  const check = async (name, fn) => {
    try {
      results.push({
        name,
        pass: true,
        details: await Promise.race([
          fn(),
          new Promise((_, r) => setTimeout(() => r(Error("Timed out")), 15000)),
        ]),
      });
    } catch (e) {
      results.push({ name, pass: false, error: String(e) });
    }
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
  await check("normal and reading mode find", async () => {
    for (let i = 0; i < 100; i++) {
      try {
        if (await normal.web.executeJavaScript("document.body.innerText.includes('中文')")) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    normal.custom.tab.headElement.click();
    await new Promise((r) => setTimeout(r, 300));
    normal.showFind();
    normal.findInput.value = "中文";
    normal.find(true);
    for (let i = 0; i < 50 && !/[1-9]/.test(normal.hint.textContent); i++)
      await new Promise((r) => setTimeout(r, 100));
    const web = normal.hint.textContent;
    if (!web || !/[1-9]/.test(web)) throw Error("Web find count missing");
    await normal.toggleReader();
    normal.find(true);
    const reader = normal.hint.textContent;
    if (!normal.reader.querySelector("mark"))
      throw Error("Reading find missing");
    await normal.toggleReader();
    normal.closeFind();
    return { web, reader };
  });
  await check("zoom and mute use actual webContents", async () => {
    normal.setZoom(1.5);
    const w = p.adapter.remote.webContents.fromId(
      normal.web.getWebContentsId(),
    );
    p.adapter.bridge.action(p.adapter.partition, w.id, "setAudioMuted", true);
    if (w.getZoomFactor() !== 1.5 || !w.isAudioMuted())
      throw Error("Zoom/mute failed");
    normal.setZoom(1);
    p.adapter.bridge.action(p.adapter.partition, w.id, "setAudioMuted", false);
    return { zoom: 1.5, muted: true, reset: true };
  });
  await check("blocked kernel network", async () => {
    const value = await normal.web.executeJavaScript(
      "fetch('http://127.0.0.1:16838/api/system/version').then(()=>false).catch(()=>true)",
    );
    if (!value) throw Error("Kernel fetch allowed");
    return value;
  });
  await check("deterministic session adblock", async () => {
    const fs = p.adapter.remote.require("node:fs");
    const path = p.adapter.remote.require("node:path");
    const dir = p.adapter.remote.app.getPath("userData");
    const files = [
      "siyuan-browser-settings.json",
      "siyuan-browser-filters.json",
    ].map((name) => path.join(dir, name));
    const backups = files.map((file) =>
      fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null,
    );
    try {
      const status = await p.adapter.bridge.configure(p.adapter.partition, {
        adblock: true,
        updateDays: 4,
        subscriptions: ["http://127.0.0.1:17840/list.txt"],
      });
      if (!status.loaded) throw Error(status.error);
      const blocked = await normal.web.executeJavaScript(
        "fetch('http://127.0.0.1:17839/blocked').then(()=>false).catch(()=>true)",
      );
      if (!blocked) throw Error("Filter did not block");
      return { blocked: true };
    } finally {
      files.forEach((file, i) => {
        if (backups[i] === null) {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } else fs.writeFileSync(file, backups[i]);
      });
      await p.adapter.bridge.configure(p.adapter.partition, {
        ...p.config,
        updateDays: 0,
      });
      files.forEach((file, i) => {
        if (backups[i] === null) {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } else fs.writeFileSync(file, backups[i]);
      });
    }
  });
  await check("native independent window", async () => {
    const before = new Set(
      p.adapter.remote.BrowserWindow.getAllWindows().map((w) => w.id),
    );
    await p.open("http://127.0.0.1:17839/next", undefined, false, true);
    let created;
    for (let i = 0; i < 50; i++) {
      created = p.adapter.remote.BrowserWindow.getAllWindows().find(
        (w) => !before.has(w.id) && w.webContents.getURL().includes(":16838/"),
      );
      if (created) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!created) throw Error("New host window not found");
    const result = { windowId: created.id, url: created.webContents.getURL() };
    created.close();
    return result;
  });
  const report = { time: new Date().toISOString(), results };
  require("node:fs").writeFileSync(
    window.siyuan.config.system.workspaceDir +
      "/temp/browser-extended-checks.json",
    JSON.stringify(report, null, 2),
  );
  console.log("BROWSER_EXTENDED", JSON.stringify(report));
  return report;
})();
