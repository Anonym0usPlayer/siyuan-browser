import http from 'node:http';
import fs from 'node:fs/promises';
http.createServer(async (req,res)=>{
 if(req.url==='/icon.png'){res.setHeader('Content-Type','image/png');res.end(await fs.readFile('icon.png'));return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.end('<!doctype html><title>宽网页布局测试</title><link rel="icon" href="/icon.png"><style>html{overflow-x:hidden}body{margin:0;min-width:1400px}main{display:flex;justify-content:space-between;background:#dcecff;height:300px}strong{padding:20px}</style><main><strong>左侧内容</strong><strong id="edge">右侧完整可见</strong></main>');
}).listen(17842,'127.0.0.1',()=>console.log('Layout fixture on 17842'));
