(async () => {
  if (!window.siyuan.config.system.workspaceDir.includes('siyuan-browser-test')) throw Error('Not test workspace');
  const p = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-browser');
  const fs = require('node:fs');
  const base = window.siyuan.config.system.workspaceDir + '/temp/';
  const marker = base + 'browser-restore-pending.json';
  if (!fs.existsSync(marker)) {
    const v = [...p.views].reverse().find(v => v.url.includes(':17839/article') && !v.data.archive);
    if (!v) throw Error('No fixture view');
    v.custom.tab.headElement.click();
    v.setZoom(1.3);
    v.muted = true;
    p.adapter.bridge.action(p.adapter.partition, v.web.getWebContentsId(), 'setAudioMuted', true);
    if (!v.reading) await v.toggleReader();
    v.persist();
    fs.writeFileSync(marker, JSON.stringify({instanceId:v.custom.data.instanceId}));
    console.log('RESTORE_PREPARED');
  } else {
    const {instanceId} = JSON.parse(fs.readFileSync(marker));
    const v = [...p.views].find(v => v.custom.data.instanceId === instanceId);
    if (!v) throw Error('Restored tab missing');
    const w = p.adapter.remote.webContents.fromId(v.web.getWebContentsId());
    const details = {url:v.url, zoom:w.getZoomFactor(), muted:w.isAudioMuted(), reading:v.reading, text:v.reader.textContent.includes('中文')};
    const pass = details.zoom === 1.3 && details.muted && details.reading && details.text;
    fs.writeFileSync(base + 'browser-restore-check.json',JSON.stringify({time:new Date().toISOString(),pass,details},null,2));
    fs.unlinkSync(marker);
    console.log('RESTORE_RESULT',pass,details);
  }
})();
