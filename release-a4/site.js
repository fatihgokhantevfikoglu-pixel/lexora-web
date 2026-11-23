import {assets} from './assets.js';
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/support-mail'||url.pathname.startsWith('/api/support-mail/'))return env.MAIL.fetch(request);
  const path=url.pathname==='/'?'/index.html':url.pathname.replace(/\/$/,'');
  const item=Object.hasOwn(assets,path)?assets[path]:null;
  if(!item)return env.A3.fetch(request);
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const [type,data,binary]=item;
  const body=request.method==='HEAD'?null:binary?Uint8Array.from(atob(data),c=>c.charCodeAt(0)):data;
  return new Response(body,{headers:{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin'}});
 }
};