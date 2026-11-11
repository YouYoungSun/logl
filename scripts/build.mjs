import {cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url), out=new URL('dist/',root);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const name of ['index.html','style.css','src','assets'])await cp(new URL(name,root),new URL(name,out),{recursive:true});
// A separate portable edition runs directly from a ZIP extraction with no server.
const modules=[['Core','core',['Game','STAGES','UPGRADES','BURDENS','cells','SHAPES','RULES_VERSION']],['Boss','boss-art',['drawBoss','bossAnchor']],['FX','fx',['Effects']],['Audio','audio',['AudioDirector']],['Review','death-review',['DeathReview']]];
let bundle='';
for(const [name,file,exports] of modules){
  const source=(await readFile(new URL(`src/${file}.mjs`,root),'utf8')).replace(/^export /gm,'');
  bundle+=`const ${name}=(()=>{\n${source}\nreturn {${exports.join(',')}};\n})();\n`;
}
const main=(await readFile(new URL('src/main.mjs',root),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
bundle+=`(()=>{const {Game,STAGES,UPGRADES,BURDENS,cells,SHAPES,RULES_VERSION}=Core;const {drawBoss,bossAnchor}=Boss;const {Effects}=FX;const {AudioDirector}=Audio;const {DeathReview}=Review;\n${main}\n})();`;
let html=await readFile(new URL('index.html',root),'utf8');
// Keep the portable edition fully offline, including title art.
const images=[...new Set([...html.matchAll(/\.\/assets\/[\w./-]+\.(?:png|webp|jpg)/g)].map(m=>m[0]))];
for(const path of images){
  const bytes=await readFile(new URL(path,root));
  const mime=path.endsWith('.jpg')?'image/jpeg':path.endsWith('.webp')?'image/webp':'image/png';
  html=html.replaceAll(path,`data:${mime};base64,${bytes.toString('base64')}`);
}
const css=await readFile(new URL('style.css',root),'utf8');
html=html.replace('<link rel="stylesheet" href="./style.css">',()=>`<style>${css}</style>`).replace('<script type="module" src="./src/main.mjs"></script>',()=>`<script>\n${bundle.replace(/<\/script/gi,'<\\/script')}\n</script>`);
await writeFile(new URL('play.html',root),html);
await writeFile(new URL('play.html',out),html);
console.log('Built dist/ and portable play.html (double-click to play).');
