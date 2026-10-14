(async()=>{
 if(!window.siyuan.config.system.workspaceDir.includes('siyuan-browser-test'))throw Error('Not test workspace');
 const p=window.siyuan.ws.app.plugins.find(p=>p.name==='siyuan-browser');
 const report={time:new Date().toISOString(),pass:false};
 let v;
 try{
 await p.open('http://127.0.0.1:17842/');
 for(let i=0;i<100;i++){
 v=[...p.views].reverse().find(v=>v.url==='http://127.0.0.1:17842/');
 try{if(v&&await v.web.executeJavaScript("!!document.getElementById('edge')"))break;}catch{}
 await new Promise(r=>setTimeout(r,100));
 }
 v.root.style.width='600px';
 await v.fitViewport();
 let metrics;
 for(let i=0;i<50;i++){
 metrics=await v.web.executeJavaScript("({width:innerWidth,right:document.getElementById('edge').getBoundingClientRect().right,scroll:document.documentElement.scrollWidth})");
 if(metrics.right<=metrics.width+2 && v.custom.tab.headElement.querySelector('.sb-tab-favicon'))break;
 await new Promise(r=>setTimeout(r,100));
 }
 const icon=!!v.custom.tab.headElement.querySelector('.sb-tab-favicon');
 const toolbarIcon=!!v.root.querySelector('.sb-toolbar img');
 const clipped=metrics.right>metrics.width+2;
 Object.assign(report,{pass:icon&&!toolbarIcon&&!clipped,icon,toolbarIcon,metrics,paneWidth:v.web.clientWidth});
 }catch(e){report.error=String(e);}finally{if(v){v.root.style.width='';await v.fitViewport();}}
 require('node:fs').writeFileSync(window.siyuan.config.system.workspaceDir+'/temp/browser-layout-check.json',JSON.stringify(report,null,2));
 console.log('LAYOUT_CHECK',report);
})();
