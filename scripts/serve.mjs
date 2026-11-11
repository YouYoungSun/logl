import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const p=process.argv.indexOf('--port');
const port=p>=0?Number(process.argv[p+1]):Number(process.env.PORT||5173);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const pathname=decodeURIComponent(url.pathname);
    const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!path.startsWith(root+sep)){res.writeHead(403);res.end('Forbidden');return;}
    const s=await stat(path);if(!s.isFile())throw Error('not file');
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(path));
  }catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is in use. Try: npm start -- --port 5174`:e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  const url=`http://localhost:${port}`;console.log(`FAULTLINE running at ${url}\nPress Ctrl+C to stop.`);
  if(process.argv.includes('--open')){
    const [cmd,args]=process.platform==='win32'?['cmd',['/c','start','',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
    const child=spawn(cmd,args,{stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();
  }
});
