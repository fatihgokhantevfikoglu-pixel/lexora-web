
const root='/api/support-mail';
const ttl=180*24*3600;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export default {
  async email(message,env){
    if(message.to.toLowerCase()!=='support@lexiconcore.com')return message.setReject('Unknown recipient');
    if(message.rawSize>20*1024*1024)return message.setReject('Maximum message size is 20 MiB');
    const now=Date.now();
    const key='mail/'+String(9999999999999-now).padStart(13,'0')+'-'+crypto.randomUUID();
    await env.INBOX.put(key,await new Response(message.raw).arrayBuffer(),{
      expirationTtl:ttl,metadata:{at:now,from:String(message.from).slice(0,96),subject:String(message.headers.get('subject')||'').slice(0,120)}
    });
  },
  async fetch(request,env){
    const u=new URL(request.url);
    if(!(u.pathname===root||u.pathname.startsWith(root+'/')))return json({},404);
    const bearer=request.headers.get('Authorization')||'';
    if(!/^Bearer [^\s]+$/.test(bearer))return json({error:'Giriş gerekli.'},401);
    const verified=await fetch(env.AUTH_URL+'/auth/v1/user',{headers:{apikey:env.PUBLIC_KEY,Authorization:bearer}});
    if(!verified.ok)return json({error:'Oturum doğrulanamadı.'},401);
    const user=await verified.json();
    if(user.id!==env.OWNER_ID||!user.email_confirmed_at)return json({error:'Bu kutu yalnızca sahibine açıktır.'},403);
    if(u.pathname===root&&request.method==='GET'){
      const page=await env.INBOX.list({prefix:'mail/',limit:25,cursor:u.searchParams.get('cursor')||undefined});
      return json({messages:page.keys.map(k=>({id:k.name.slice(5),...k.metadata})),next:page.list_complete?null:page.cursor});
    }
    const id=u.pathname.slice(root.length+1);
    if(!/^\d{13}-[a-f\d-]{36}$/.test(id))return json({},404);
    if(request.method==='DELETE'){await env.INBOX.delete('mail/'+id);return json({removed:true});}
    if(request.method!=='GET')return json({},405);
    const value=await env.INBOX.get('mail/'+id,'stream');if(!value)return json({},404);
    return new Response(value,{headers:{'Content-Type':'message/rfc822','Content-Disposition':'attachment; filename="destek-iletisi.eml"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
};