/* A2: single owner for identity, account settings and Supabase auth events. */
import {createCloudSync} from './cloud-sync.js?release=A3';
import {INTEGRATIONS} from './integrations.js?release=A3';
const URL=INTEGRATIONS.supabase.url, PUBLIC_KEY=INTEGRATIONS.supabase.publishableKey;
const LOCAL_KEY = 'lc23-explicit-local-workspace';
const GOOGLE_KEY = 'lc-google-oauth-pending-v1';
const OAUTH_KEY = 'lc-oauth-pending-v2';
const AVATARS = ['🦉', '📖', '✦', '🌿', '🌟', '🎯', '🔍', '💡'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const emailValid = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const errorText = error => String(error?.message || error || 'İşlem tamamlanamadı.');
const sessionSet = (key, value) => { try { value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, value); } catch {} };
const sessionGet = key => { try { return sessionStorage.getItem(key); } catch { return null; } };
let sdkPromise;

function sdk() {
  if (window.supabase?.createClient) return Promise.resolve(window.supabase);
  if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const finish = error => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else if (window.supabase?.createClient) resolve(window.supabase);
      else reject(Error('Kimlik doğrulama bileşeni açılamadı.'));
    };
    const timer = setTimeout(() => finish(Error('Kimlik doğrulama sunucusuna erişilemiyor. Bağlantınızı kontrol edip yeniden deneyin.')), 15000);
    script.src = new globalThis.URL('../vendor/supabase-2.119.2.js', import.meta.url).href;
    script.async = true;
    script.onload = () => finish();
    script.onerror = () => finish(Error('Kimlik doğrulama dosyası indirilemedi. İnternet bağlantınızı kontrol edin.'));
    document.head.append(script);
  }).catch(error => { sdkPromise = null; throw error; });
  return sdkPromise;
}

export function createAuth({onSession, onSignedOut, notify = () => {}}) {
  let client = null, user = null, local = false, initPromise, subscription, cloud = null;
  let account = {profile:{}, settings:{}}, serverAccount=null, accountTask=null, accountTimer=null, accountRetries=0;
  const accountRequests=new Set();
  let generation = 0, signingOut = false, disposed = false, profileTask = null, startedId = null;
  const accountListeners = new Set();
  const page = new globalThis.URL(location.href);
  const hashFields = new URLSearchParams(page.hash.slice(1));
  const callbackField = key => page.searchParams.get(key) || hashFields.get(key) || '';
  let recovery = page.searchParams.get('lc_recovery') === '1' || hashFields.get('type') === 'recovery';
  const callbackError = [callbackField('error_code') || callbackField('error'), callbackField('error_description')].filter(Boolean).join(' — ').slice(0, 500);
  const demo = page.searchParams.get('demo') === '1';
  const redirect = location.origin + location.pathname;
  const recoveryURL = new globalThis.URL(redirect);
  recoveryURL.searchParams.set('lc_recovery', '1');
  let startupError = callbackError ? 'Oturum açılamadı: ' + callbackError : '';
  let mounted = null;

  const cacheKey = id => 'lxc:v1:' + id + ':a1_account';
  const pendingKey = id => 'lxc:v1:' + id + ':a2_account_pending';
  const connected=()=>globalThis.navigator?.onLine!==false;
  function pendingAccount(id=user?.id){
    if(!id)return null;
    const raw=localStorage.getItem(pendingKey(id));if(!raw)return null;
    let record;try{record=JSON.parse(raw);}catch{throw Error('Bekleyen profil kaydı okunamadı; kayıt silinmedi.');}
    if(record?.uid!==id||!record.id||!record.profile||!record.settings)throw Error('Bekleyen profil kaydı geçersiz; kayıt silinmedi.');
    return record;
  }
  function clearAccountRequests(){clearTimeout(accountTimer);accountTimer=null;for(const c of accountRequests)c.abort();accountRequests.clear();serverAccount=null;accountTask=null;accountRetries=0;}
  async function accountRequest(query){
    const controller=new AbortController();accountRequests.add(controller);
    const timer=setTimeout(()=>controller.abort(),12000);
    try{const response=await query.abortSignal(controller.signal);if(response.error)throw response.error;return response.data;}
    catch(error){if(controller.signal.aborted)throw Error('Profil sunucusu zamanında yanıt vermedi.');throw error;}
    finally{clearTimeout(timer);accountRequests.delete(controller);}
  }
  function scheduleAccount(){clearTimeout(accountTimer);if(disposed||local||!user||!connected()||accountRetries>6||account.sync?.state==='conflict'||account.sync?.state==='error')return;accountTimer=setTimeout(()=>{accountTimer=null;flushAccount().catch(()=>{});},Math.min(60000,1000*2**accountRetries));}

  function defaults(u) {
    const defaultAccount = {profile:{display_name:local?'Yerel Öğrenci':String(u?.user_metadata?.display_name || u?.user_metadata?.full_name || 'LexiconCore Öğrencisi').slice(0, 70),username:null,avatar_url:'emoji:📖'},settings:{theme:'system',exam:'YDS',daily_goal:10,show_roots:true}};
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(u.id)) || 'null');
      if (cached && typeof cached === 'object') {
        defaultAccount.profile = {...defaultAccount.profile, ...cached.profile};
        defaultAccount.settings = {...defaultAccount.settings, ...cached.settings};
        if(Number.isSafeInteger(cached.revision))defaultAccount.revision=cached.revision;
      }
    } catch {}
    try{const queued=pendingAccount(u.id);if(queued){defaultAccount.profile={...defaultAccount.profile,...queued.profile};defaultAccount.settings={...defaultAccount.settings,...queued.settings};defaultAccount.sync={state:'pending',message:'Bu cihazda bekleyen profil değişikliği var.'};}}catch(error){defaultAccount.error=errorText(error);}
    return defaultAccount;
  }
  function publishAccount() {
    if (!user) return;
    try { localStorage.setItem(cacheKey(user.id), JSON.stringify({profile:account.profile,settings:account.settings,revision:account.revision})); } catch {}
    for (const listener of accountListeners) { try { listener(account); } catch (error) { console.warn('Hesap görünümü güncellenemedi:', errorText(error)); } }
  }
  function clearIdentity() {
    cloud?.dispose(); cloud = null;clearAccountRequests();
    generation++; user = null; local = false; account = {profile:{},settings:{}};
    profileTask = null; startedId = null;
    sessionSet(LOCAL_KEY, null);
  }
  function acceptUser(nextUser) {
    if (!nextUser?.id || signingOut || recovery || disposed) return;
    const changed = !user || user.id !== nextUser.id || local;
    user = nextUser; local = false;
    if (changed) { cloud?.dispose(); cloud = null; clearAccountRequests(); generation++; profileTask = null; account = defaults(user); }
    sessionSet(LOCAL_KEY, null); sessionSet(GOOGLE_KEY, null); sessionSet(OAUTH_KEY,null);
    if (startedId !== user.id) {
      startedId = user.id;
      onSession?.(api);
      refreshAccount().then(()=>{if(pendingAccount())scheduleAccount();}).catch(error => {
        if (user?.id === nextUser.id) notify('Hesap tercihleri okunamadı; yerel çalışmaya devam edebilirsiniz. ' + errorText(error), 'error');
      });
    }
  }
  function processEvent(event, session) {
    if (signingOut || disposed) return;
    if (event === 'PASSWORD_RECOVERY') {
      cloud?.dispose(); cloud = null;clearAccountRequests();
      generation++; profileTask = null; local = false;
      recovery = true; user = session?.user || null; startedId = null;
      account = user ? defaults(user) : {profile:{},settings:{}};
      sessionSet(LOCAL_KEY,null);
      if (mounted) mounted('recovery');
      else onSignedOut?.();
      return;
    }
    if (local) return;
    if (session?.user) { acceptUser(session.user); return; }
    if (event === 'SIGNED_OUT' && user) { clearIdentity(); onSignedOut?.(); }
  }
  async function connect() {
    if (client) return client;
    if (demo) throw Error('Deneme alanında çevrimiçi hesap bağlantısı kapalı. Giriş yapmak için normal site adresini açın.');
    const supabase = await sdk();
    client = supabase.createClient(URL, PUBLIC_KEY, {auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
    const result = client.auth.onAuthStateChange((event, session) => {
      // Do not await another auth call while the Supabase auth lock is held.
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      setTimeout(() => processEvent(event, session), 0);
    });
    subscription = result.data?.subscription;
    return client;
  }
  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (demo || (!recovery && sessionGet(LOCAL_KEY) === '1')) { enterLocal(); return api; }
      try {
        const sb = await connect();
        const {data, error} = await sb.auth.getSession();
        if (error) throw error;
        if (recovery) { user = data?.session?.user || null; account = user ? defaults(user) : {profile:{},settings:{}}; if (!user && !startupError) startupError = 'Şifre yenileme bağlantısı geçersiz veya süresi dolmuş. Yeni bir bağlantı isteyin.'; }
        else if (data?.session?.user) {acceptUser(data.session.user);if(callbackError)notify(startupError+' Mevcut oturumunuz korundu.','error');}
        else {
          let oauthPending;try{oauthPending=JSON.parse(sessionGet(OAUTH_KEY)||'null');}catch{}
          const pending = Number(oauthPending?.at||sessionGet(GOOGLE_KEY));
          const provider=oauthPending?.provider==='apple'?'Apple':'Google';
          if (!startupError && pending > 0 && Date.now() - pending < 600000) startupError = provider+' dönüşünden sonra oturum oluşmadı. Sağlayıcı ve Supabase giriş ayarları ile izin verilen yönlendirme adreslerini kontrol edin.';
          sessionSet(GOOGLE_KEY, null);sessionSet(OAUTH_KEY,null);
        }
      } catch (error) { startupError = errorText(error); }
      return api;
    })();
    return initPromise;
  }
  function enterLocal() {
    cloud?.dispose(); cloud = null;clearAccountRequests();
    generation++; local = true; recovery = false; profileTask = null;
    user = {id:'device-local-lexiconcore',email:'',user_metadata:{display_name:'Yerel Öğrenci'}};
    account = defaults(user); sessionSet(LOCAL_KEY, '1');
    if (startedId !== user.id) { startedId = user.id; onSession?.(api); }
    return api;
  }
  async function refreshAccount() {
    if(local)return account;
    if(!client||!user)throw Error('Önce hesabınıza giriş yapın.');
    if(profileTask)return profileTask;
    const uid=user.id,epoch=generation,current=()=>user?.id===uid&&generation===epoch&&!local&&!disposed;
    const run=(async()=>{
      let result;
      if(INTEGRATIONS.cloud.accountProtocol==='atomic-v2'){
        result=await accountRequest(client.rpc('lc_a2_get_account'));
        if(!result?.profile||!result?.settings)throw Error('Atomik hesap bağlantısı geçerli hesap döndürmedi.');
      }else{
        let [p,s]=await Promise.all([
          accountRequest(client.from('profiles').select('display_name,username,avatar_url').eq('id',uid).maybeSingle()),
          accountRequest(client.from('user_settings').select('theme,exam,daily_goal,show_roots').eq('user_id',uid).maybeSingle())
        ]);
        if(!current())return account;
        if(!p){try{p=await accountRequest(client.from('profiles').insert({id:uid,display_name:String(user.user_metadata?.display_name||user.user_metadata?.full_name||'LexiconCore Öğrencisi').slice(0,70)}).select('display_name,username,avatar_url').single());}catch(error){if(error.code!=='23505')throw error;p=await accountRequest(client.from('profiles').select('display_name,username,avatar_url').eq('id',uid).single());}}
        if(!current())return account;
        if(!s){try{s=await accountRequest(client.from('user_settings').insert({user_id:uid}).select('theme,exam,daily_goal,show_roots').single());}catch(error){if(error.code!=='23505')throw error;s=await accountRequest(client.from('user_settings').select('theme,exam,daily_goal,show_roots').eq('user_id',uid).single());}}
        result={profile:p,settings:s};
      }
      if(current()){
        serverAccount=result;const queued=pendingAccount(uid);
        account=queued?{...result,profile:{...result.profile,...queued.profile},settings:{...result.settings,...queued.settings},sync:{state:'pending',message:'Profil değişikliği bu cihazda saklandı; bulut kaydı bekliyor.'}}:result;
        publishAccount();
      }
      return account;
    })();profileTask=run;
    try{return await run;}catch(error){if(current())account.error=errorText(error);throw error;}finally{if(profileTask===run)profileTask=null;}
  }
  const profileFields=['display_name','username','avatar_url'],settingFields=['theme','exam','daily_goal','show_roots'];
  const differs=(a,b,keys)=>keys.some(k=>JSON.stringify(a?.[k]??null)!==JSON.stringify(b?.[k]??null));
  function matchAccountFields(query, row, fields) {
    for (const field of fields) {
      query = row[field] == null ? query.is(field, null) : query.eq(field, row[field]);
    }
    return query;
  }
  async function flushAccount(){
    if(accountTask)return accountTask;
    if(!user||local||!client||!connected()||disposed)return account;
    const uid=user.id,epoch=generation,record=pendingAccount(uid);if(!record)return account;
    const current=()=>user?.id===uid&&generation===epoch&&!local&&!disposed;
    const task=(async()=>{
      try{
        await refreshAccount();if(!current())return account;
        const remote=serverAccount;
        const profileChanged=differs(remote.profile,record.profile,profileFields),settingsChanged=differs(remote.settings,record.settings,settingFields);
        if(remote.profile.username&&record.profile.username!==remote.profile.username)throw Error('ACCOUNT_CONFLICT: Hesap kullanıcı adı başka cihazda belirlendi.');
        if(profileChanged||settingsChanged){
          if(record.protocol==='atomic-v2'){
            await accountRequest(client.rpc('lc_a2_save_account',{p_operation_id:record.id,p_expected_revision:record.expectedRevision??0,p_profile:record.profile,p_settings:record.settings}));
          }else{
            const conflictFields=(side,fields)=>fields.some(k=>JSON.stringify(remote[side]?.[k]??null)!==JSON.stringify(record[side]?.[k]??null)&&JSON.stringify(remote[side]?.[k]??null)!==JSON.stringify(record.base?.[side]?.[k]??null));
            if(conflictFields('profile',profileFields)||conflictFields('settings',settingFields))throw Error('ACCOUNT_CONFLICT: Buluttaki profil başka cihazda değişti.');
            if(profileChanged){
              const query=client.from('profiles').update(record.profile).eq('id',uid);
              const saved=await accountRequest(matchAccountFields(query,remote.profile,profileFields).select('id'));
              if(!saved?.length)throw Error('ACCOUNT_CONFLICT: Profil kaydı yazma sırasında değişti.');
            }
            if(!current())return account;
            if(settingsChanged){
              const query=client.from('user_settings').update({...record.settings,updated_at:new Date().toISOString()}).eq('user_id',uid);
              const saved=await accountRequest(matchAccountFields(query,remote.settings,settingFields).select('user_id'));
              if(!saved?.length)throw Error('ACCOUNT_CONFLICT: Tercih kaydı yazma sırasında değişti.');
            }
          }
        }
        if(!current())return account;
        if(pendingAccount(uid)?.id===record.id)localStorage.removeItem(pendingKey(uid));
        accountRetries=0;await refreshAccount();
        if(current()){account.sync={state:pendingAccount(uid)?'pending':'saved',message:'Hesap profili ve tercihleri bulutta kaydedildi.'};publishAccount();if(pendingAccount(uid))scheduleAccount();}
      }catch(error){
        if(current()){
          const text=errorText(error),isConflict=/ACCOUNT_CONFLICT|SYNC_CONFLICT|OPERATION_REUSED/.test(text),retry=/fetch|network|timeout|zamanında|offline|abort|503|502|504|429/i.test(text);
          account.sync={state:isConflict?'conflict':retry?'pending':'error',message:isConflict?'Başka cihazın profil kaydı değişti. Yerel taslak korunuyor; hangi kaydı kullanacağınızı seçin.':retry?'Profil değişikliği cihazda saklandı; bağlantı geldiğinde buluta gönderilecek.':'Profil buluta kaydedilemedi: '+text};
          accountRetries++;publishAccount();if(retry)scheduleAccount();
        }
      }
      return account;
    })();accountTask=task;
    try{return await task;}finally{if(accountTask===task)accountTask=null;}
  }
  async function resolveAccountConflict(useLocal){
    if(!user||local)return account;
    const uid=user.id,record=pendingAccount(uid);if(!record)return account;
    await refreshAccount();if(user?.id!==uid)throw Error('Hesap değişti.');
    if(useLocal){
      const replacement={...record,id:crypto.randomUUID(),createdAt:Date.now(),profile:{...record.profile,username:serverAccount.profile.username||record.profile.username},base:serverAccount,expectedRevision:serverAccount.revision??0,protocol:INTEGRATIONS.cloud.accountProtocol};
      localStorage.setItem(pendingKey(uid),JSON.stringify(replacement));account.sync={state:'pending',message:'Yerel profil yeniden gönderilecek.'};return flushAccount();
    }
    // Keep the previous draft available locally instead of silently deleting it.
    localStorage.setItem('lxc:v1:'+uid+':a2_account_previous_draft',JSON.stringify(record));localStorage.removeItem(pendingKey(uid));return refreshAccount();
  }
  async function saveAccount(profile, settings) {
    if (!user) throw Error('Oturum açık değil.');
    const savingUser=user.id;
    // A later edit waits for this owner's previous send before taking its base.
    // Otherwise our own successful first write looks like another-device conflict.
    if(accountTask)await accountTask;
    if(!user||user.id!==savingUser)throw Error('Hesap değişti; profil kaydedilmedi.');
    const p = {...account.profile, ...profile}, s = {...account.settings, ...settings};
    p.display_name = String(p.display_name || '').trim();
    p.username = String(p.username || '').trim().toLowerCase() || null;
    if (p.display_name.length < 2 || p.display_name.length > 70) throw Error('Görünen ad 2–70 karakter olmalı.');
    if (p.username && !/^[a-z0-9_]{3,24}$/.test(p.username)) throw Error('Kullanıcı adı 3–24 küçük İngilizce harf, rakam veya alt çizgiden oluşmalı.');
    if (account.profile.username && p.username !== account.profile.username) throw Error('Daha önce belirlenmiş hesap kullanıcı adı değiştirilemez.');
    const avatar = String(p.avatar_url || '').replace(/^emoji:/, '');
    if (avatar && !AVATARS.includes(avatar)) throw Error('Listeden bir avatar seçin.');
    p.avatar_url = avatar ? 'emoji:' + avatar : null;
    s.daily_goal = Number(s.daily_goal);
    if (!Number.isInteger(s.daily_goal) || s.daily_goal < 1 || s.daily_goal > 200 || !['system','light','dark'].includes(s.theme) || !['YDS','YOKDIL','GENERAL'].includes(s.exam)) throw Error('Çalışma hedefi veya tercihler geçersiz.');
    s.show_roots = Boolean(s.show_roots);
    if(local){account={profile:p,settings:s,sync:{state:'local',message:'Bu cihazda kaydedildi.'}};publishAccount();return account;}
    const previous=pendingAccount(user.id);
    const base=serverAccount||previous?.base||{profile:account.profile,settings:account.settings,revision:account.revision};
    const record={id:crypto.randomUUID(),uid:user.id,createdAt:Date.now(),protocol:INTEGRATIONS.cloud.accountProtocol,expectedRevision:base.revision??0,base,
      profile:Object.fromEntries(profileFields.map(k=>[k,p[k]??null])),settings:Object.fromEntries(settingFields.map(k=>[k,s[k]]))};
    localStorage.setItem(pendingKey(user.id),JSON.stringify(record));
    account={...account,profile:p,settings:s,sync:{state:'pending',message:'Profil değişikliği bu cihazda saklandı; bulut kaydı bekliyor.'}};publishAccount();
    if(connected())await flushAccount();return account;
  }
  async function requestPasswordReset(email = user?.email) {
    const value = String(email || '').trim();
    if (!emailValid(value)) throw Error('Geçerli bir e-posta adresi yazın.');
    const sb = await connect();
    const {error} = await sb.auth.resetPasswordForEmail(value, {redirectTo:recoveryURL.toString()});
    if (error) throw error;
  }
  async function signOut() {
    if (signingOut) return;
    signingOut = true;
    try {
      if (!local && client) { const {error} = await client.auth.signOut(); if (error) throw error; }
      clearIdentity(); recovery = false; onSignedOut?.();
    } finally { signingOut = false; }
  }
  async function signInWithProvider(provider){
    const config=INTEGRATIONS.oauth[provider];
    if(!config?.enabled)throw Error(config?.reason||'Bu giriş sağlayıcısı etkin değil.');
    const sb=await connect();sessionSet(OAUTH_KEY,JSON.stringify({provider,at:Date.now()}));
    if(provider==='google')sessionSet(GOOGLE_KEY,String(Date.now()));
    const {error}=await sb.auth.signInWithOAuth({provider,options:{redirectTo:redirect,...(provider==='google'?{queryParams:{prompt:'select_account'}}:{scopes:'name email'})}});
    if(error){sessionSet(OAUTH_KEY,null);sessionSet(GOOGLE_KEY,null);throw error;}
  }
  function mount(view, {signal}) {
    let mode = recovery ? 'recovery' : 'login', busy = false;
    const active = () => !signal.aborted;
    const feedback = (message, kind = 'info') => {
      if (!active()) return;
      const box = view.querySelector('[data-auth-feedback]');
      if (box) { box.textContent = message; box.dataset.kind = kind; box.hidden = !message; }
    };
    function show(nextMode = mode) {
      if (!active()) return;
      mode = nextMode;
      const reset = mode === 'recovery', signup = mode === 'register', forgot = mode === 'forgot';
      const title = reset ? 'Yeni şifrenizi belirleyin' : signup ? 'Hesap oluşturun' : forgot ? 'Şifrenizi sıfırlayın' : 'Giriş yapın';
      view.innerHTML = `<section class="auth-card panel"><div class="auth-brand"><img src="/assets/pro/logo.jpg" width="64" height="64" alt=""><div><p class="eyebrow">LEXICONCORE</p><h1>${title}</h1></div></div><p class="muted">Sözcüklerin dünyası, kişisel öğrenme alanınız.</p>${!reset && !forgot ? `<div class="actions" aria-label="Üyelik işlemleri"><button type="button" data-auth-mode="login" aria-pressed="${!signup}">Giriş yap</button><button type="button" data-auth-mode="register" aria-pressed="${signup}">Üye ol</button></div>` : ''}<form data-auth-form>${signup ? '<label class="field">Görünen ad<input name="display_name" autocomplete="name" minlength="2" maxlength="70" required></label>' : ''}${!reset ? '<label class="field">E-posta<input name="email" type="email" autocomplete="email" maxlength="254" required></label>' : ''}${!forgot ? `<label class="field">${reset ? 'Yeni şifre' : 'Şifre'}<span class="password-field"><input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="${mode === 'login' ? 1 : 10}" maxlength="128" required><button type="button" data-auth-action="show-password" aria-pressed="false" aria-label="Şifreyi göster">Göster</button></span></label>` : ''}${signup || reset ? '<label class="field">Şifre tekrarı<input name="confirm_password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><p class="muted">En az 10 karakter kullanın; iki şifre aynı olmalı.</p>' : ''}<button type="submit" class="primary">${forgot ? 'Sıfırlama bağlantısı gönder' : reset ? 'Şifreyi güncelle' : signup ? 'Hesap oluştur' : 'Giriş yap'}</button></form><p class="notice" data-auth-feedback role="status" aria-live="polite" hidden></p>${!reset && !forgot ? `<div class="actions"><button type="button" data-auth-action="google">Google ile devam et</button><button type="button" data-auth-action="apple" ${INTEGRATIONS.oauth.apple.enabled?'':'disabled data-readiness-disabled'}>Apple ile devam et</button><button type="button" data-auth-mode="forgot">Şifremi unuttum</button></div><p class="muted">${INTEGRATIONS.oauth.apple.enabled?'':esc(INTEGRATIONS.oauth.apple.reason)}</p>` : '<button type="button" data-auth-mode="login">Girişe dön</button>'}<hr><button type="button" data-auth-action="local">Bu cihazda yerel çalış</button><p class="muted">Yerel çalışma bu tarayıcıda saklanır. Bulut ve topluluk için hesabınıza giriş yapın.</p><div class="policy-links"><a href="/gizlilik">Gizlilik</a><a href="/kullanim">Kullanım koşulları</a><a href="/telif">Telif</a></div></section>`;
    }
    mounted = show;
    signal.addEventListener('abort', () => { if (mounted === show) mounted = null; }, {once:true});
    show();
    if (startupError) feedback(startupError, 'error');
    const lock = value => { busy = value; if (active()) view.querySelectorAll('button,input').forEach(el => { el.disabled = value || el.hasAttribute('data-readiness-disabled'); }); };
    view.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button || busy) return;
      if (button.dataset.authMode) {
        if (recovery && button.dataset.authMode === 'login') {
          try { await signOut(); } catch (error) { feedback(errorText(error), 'error'); return; }
          const clean = new globalThis.URL(location.href); clean.searchParams.delete('lc_recovery'); clean.hash = ''; history.replaceState(history.state, '', clean);
        }
        show(button.dataset.authMode); return;
      }
      const action = button.dataset.authAction;
      if (action === 'show-password') {
        const input = view.querySelector('[name=password]'); if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        button.textContent = input.type === 'text' ? 'Gizle' : 'Göster';
        button.setAttribute('aria-label', input.type === 'text' ? 'Şifreyi gizle' : 'Şifreyi göster');
        button.setAttribute('aria-pressed', String(input.type === 'text')); return;
      }
      if (action === 'local') { enterLocal(); return; }
      if(action==='google'||action==='apple'){
        lock(true);try{await signInWithProvider(action);}catch(error){feedback(errorText(error),'error');lock(false);}
      }
    }, {signal});
    view.addEventListener('submit', async event => {
      if (!event.target.matches('[data-auth-form]')) return;
      event.preventDefault(); if (busy) return;
      const form = event.target, data = new FormData(form), submittedMode = mode;
      const email = String(data.get('email') || '').trim(), password = String(data.get('password') || ''), name = String(data.get('display_name') || '').trim();
      if (submittedMode !== 'recovery' && !emailValid(email)) { feedback('Geçerli bir e-posta adresi yazın.', 'error'); return; }
      if (['register','recovery'].includes(submittedMode) && (password.length < 10 || password !== data.get('confirm_password'))) { feedback('Şifre en az 10 karakter olmalı ve tekrarıyla eşleşmeli.', 'error'); return; }
      if (submittedMode === 'register' && (name.length < 2 || name.length > 70)) { feedback('Görünen ad 2–70 karakter olmalı.', 'error'); return; }
      lock(true); feedback('İşlem gönderiliyor…');
      try {
        const sb = await connect();
        if (submittedMode === 'forgot') {
          await requestPasswordReset(email);
          feedback('Bu e-posta adresinde bir hesap varsa sıfırlama bağlantısı gönderilir. E-posta kutunuzu kontrol edin.', 'success');
        } else if (submittedMode === 'register') {
          const {data:result,error} = await sb.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:redirect}});
          if (error) throw error;
          if (result.session?.user) acceptUser(result.session.user);
          else { form.reset(); feedback('Kayıt isteği alındı. E-postanızdaki doğrulama bağlantısını açıp giriş yapabilirsiniz. Adres zaten kayıtlıysa güvenlik gereği aynı yanıt alınabilir.', 'success'); }
        } else if (submittedMode === 'login') {
          const {data:result,error} = await sb.auth.signInWithPassword({email,password});
          if (error) throw error; recovery = false; acceptUser(result.user);
        } else {
          const {error} = await sb.auth.updateUser({password}); if (error) throw error;
          recovery = false;
          const clean = new globalThis.URL(location.href); clean.searchParams.delete('lc_recovery'); clean.hash = ''; history.replaceState(history.state, '', clean);
          const {data:result,error:sessionError} = await sb.auth.getSession(); if (sessionError) throw sessionError;
          if (result.session?.user) acceptUser(result.session.user);
          else { show('login'); feedback('Şifreniz güncellendi. Yeni şifrenizle giriş yapın.', 'success'); }
        }
      } catch (error) { feedback(errorText(error), 'error'); }
      finally { lock(false); }
    }, {signal});
  }
  const api = {
    init, mount, signOut, refreshAccount, saveAccount, requestPasswordReset, enterLocal, signInWithProvider, retryAccount:flushAccount, resolveAccountConflict,
    get user() { return user; }, get account() { return account; }, get client() { return local ? null : client; }, get local() { return local; }, get recoveryPending() { return recovery; }, get cloud() { return cloud; },
    setWorkspace(workspace) { cloud?.dispose(); cloud = createCloudSync(api, workspace, notify); return cloud; },
    progressChanged() { cloud?.progressChanged(); },
    subscribeAccount(callback) { accountListeners.add(callback); return () => accountListeners.delete(callback); },
    dispose() { disposed = true; clearAccountRequests(); cloud?.dispose(); subscription?.unsubscribe(); client?.auth.stopAutoRefresh?.(); generation++; accountListeners.clear(); globalThis.removeEventListener?.('online',accountOnline); }
  };
  const accountOnline=()=>{if(user&&!local){accountRetries=0;scheduleAccount();}};
  globalThis.addEventListener?.('online',accountOnline);
  return api;
}
