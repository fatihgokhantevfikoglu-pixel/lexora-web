import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const assets={};
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',webmanifest:'application/manifest+json',jpg:'image/jpeg',png:'image/png'};
function collect(base,relative='') {for(const item of fs.readdirSync(base,{withFileTypes:true})){const name=path.join(base,item.name),key=relative+'/'+item.name;if(item.isDirectory()){collect(name,key);continue;}const ext=item.name.split('.').pop();const mime=types[ext];if(!mime)throw Error('Unknown file type '+name);const binary=['png','jpg'].includes(ext);const url=ext==='html'&&key!=='/index.html'?key.slice(0,-5):key;assets[url]=[mime,fs.readFileSync(name,binary?'base64':'utf8'),binary];}}
collect(path.join(dir,'public'));
fs.writeFileSync(path.join(dir,'assets.js'),'export const assets='+JSON.stringify(assets)+';\n');
