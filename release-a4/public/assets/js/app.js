import {createStore,dayKey} from './store.js?release=A3';
import {createCatalog} from './catalog.js?release=A3';
import {createUI,escapeHTML,download} from './ui.js?release=A3';
import {createAuth} from './auth.js?release=A3';
import {mountAccount,mountSettings,mountCommunity} from './account.js?release=A3';
import {mountStudy,mountRoots,mountJourney} from './learning.js?release=A3';
import {mountDictionary} from './dictionary.js?release=A3';
import {mountHegel} from './hegel.js?release=A3';
import {mountReading,getDocuments,replaceDocuments} from './reading.js?release=A3';
import {mountUniverse,mountJournal,mountStats,mountFocus,mountRoom,mountWorld,mountPhilo,mountAwards,mountRealworld,mountThemes,mountAssistant} from './tools.js?release=A3';

import {styleShell,mountPreferences,installNavigation,enhanceRoute,mountPro,mountInbox} from '/assets/pro/studio.js';
const VERSION='A4';
const routes={
  pro:{name:'Pro stüdyosu',icon:'◇',parent:'account',mount:mountPro},
  prefs:{name:'Gezinme ve ses',icon:'☷',parent:'themes',mount:mountPreferences},
  policy:{name:'Politikalar',icon:'§',parent:'settings',mount:screen=>{screen.innerHTML='<header class="page-heading"><h1>Politikalar ve destek</h1></header><section class="panel policy-links"><a href="/gizlilik">Gizlilik</a><a href="/kullanim">Kullanım koşulları</a><a href="/telif">Telif ve kaynaklar</a><a href="/hesap-silme">Hesap silme</a><a href="mailto:support@lexiconcore.com">support@lexiconcore.com</a></section>';}},
  inbox:{name:'Destek gelen kutusu',icon:'✉',parent:'account',mount:mountInbox},
  today:{name:'Ana sayfa',icon:'⌂',parent:null,mount:mountHome},
  learn:{name:'Çalış',icon:'✦',parent:'today',mount:mountStudy},
  journey:{name:'Öğrenme yolu',icon:'↗',parent:'today',mount:mountJourney},
  library:{name:'Sözlük',icon:'Aa',parent:'today',mount:mountDictionary},
  reading:{name:'Okuma',icon:'▤',parent:'today',mount:mountReading},
  roots:{name:'Kökler',icon:'⌘',parent:'learn',mount:mountRoots},
  universe:{name:'Sözcük evreni',icon:'✧',parent:'library',mount:mountUniverse},
  journal:{name:'Günlüğüm',icon:'✎',parent:'today',mount:mountJournal},
  stats:{name:'İlerlemem',icon:'▥',parent:'today',mount:mountStats},
  focus:{name:'Odak',icon:'◷',parent:'learn',mount:mountFocus},
  room:{name:'Çalışma odam',icon:'▱',parent:'today',mount:mountRoom},
  world:{name:'Kültür atlası',icon:'◎',parent:'room',mount:mountWorld},
  philo:{name:'Kavram atölyesi',icon:'Φ',parent:'learn',mount:mountPhilo},
  hegel:{name:'Hegel dizgeleri',icon:'Φ',parent:'philo',mount:mountHegel},
  awards:{name:'Başarılarım',icon:'♧',parent:'stats',mount:mountAwards},
  realworld:{name:'Günlük yaşam',icon:'☀',parent:'learn',mount:mountRealworld},
  themes:{name:'Görünüm',icon:'◐',parent:'settings',mount:mountThemes},
  assistant:{name:'Asistan',icon:'◈',parent:'learn',mount:mountAssistant},
  account:{name:'Profilim',icon:'◉',parent:'today',mount:mountAccount},
  community:{name:'Topluluk',icon:'♧',parent:'account',mount:mountCommunity},
  settings:{name:'Ayarlar',icon:'⚙',parent:'account',mount:mountSettings}
};
// URL compatibility only: these names never load a second screen or legacy engine.
const aliases={home:'today',lexicon:'library',look:'themes',profile:'account',social:'community',rooms:'community',map:'journey',progress:'stats',review:'learn','lc19-journey':'journey','lc19-lexicon':'library','lc19-roots':'roots','lc19-universe':'universe'};
const catalog=createCatalog();
let model=null,workspaceUser=null,controller=null,cleanup=null,currentRoute='today',currentParams=new URLSearchParams(),renderGeneration=0;
let navigationId='',navIndex=0,navMax=0,sessionGeneration=0;
const view=document.getElementById('view'),shell=document.getElementById('app-shell'),authView=document.getElementById('auth-view');
const ui=createUI(()=>model?.state);
const auth=createAuth({onSession:openWorkspace,onSignedOut:showAuth,notify:ui.notify});

function routeFromURL(){
  const raw=location.hash.replace(/^#\/?/,'').replace(/^tab-/,'');
  const separator=raw.indexOf('?');
  const name=separator===-1?raw:raw.slice(0,separator);
  const query=separator===-1?'':raw.slice(separator+1);
  return {route:knownRoute(name),params:new URLSearchParams(query)};
}
function knownRoute(name){
  if(Object.hasOwn(aliases,name))return aliases[name];
  return Object.hasOwn(routes,name)?name:'today';
}
function routeURL(route,params={}){const p=params instanceof URLSearchParams?params:new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!==null));return `#/${route}${p.size?'?'+p.toString():''}`;}
function historyData(){return {a1:true,uid:workspaceUser,id:navigationId,index:navIndex,scrollY:window.scrollY};}
function rememberHistory(){try{sessionStorage.setItem(`a1-nav:${navigationId}`,String(navMax));}catch{}}
function setHistory(){
  const h=history.state;
  if(h?.a1&&h.uid===workspaceUser){navigationId=h.id;navIndex=Number(h.index)||0;try{navMax=Math.max(navIndex,Number(sessionStorage.getItem(`a1-nav:${navigationId}`))||0);}catch{navMax=navIndex;}}
  else {navigationId=crypto.randomUUID();navIndex=navMax=0;}
  const parsed=routeFromURL();history.replaceState(historyData(),'',routeURL(parsed.route,parsed.params));rememberHistory();
}
function navigate(route,params={}){
  if(!model)return;route=knownRoute(route);
  const url=routeURL(route,params);if(location.hash===url){dismissMenu();return;}
  history.replaceState(historyData(),'');navIndex++;navMax=navIndex;
  history.pushState({...historyData(),scrollY:0},'',url);rememberHistory();closeMenu();renderRoute({scrollY:0});
}
function back(){if(navIndex>0)history.back();else if(routes[currentRoute].parent)navigate(routes[currentRoute].parent);}
function updateNavigation(){
  document.querySelector('[data-shell-action="back"]').disabled=navIndex===0&&!routes[currentRoute].parent;
  document.querySelector('[data-shell-action="forward"]').disabled=navIndex>=navMax;
  document.querySelectorAll('nav [data-route]').forEach(link=>{const active=link.dataset.route===currentRoute;active?link.setAttribute('aria-current','page'):link.removeAttribute('aria-current');});
  const crumbs=[];let name=currentRoute;while(name){crumbs.unshift(name);name=routes[name].parent;}
  document.getElementById('breadcrumbs').innerHTML=crumbs.map((key,i)=>i===crumbs.length-1?`<span aria-current="page">${escapeHTML(routes[key].name)}</span>`:`<button data-route="${key}">${escapeHTML(routes[key].name)}</button><span aria-hidden="true">/</span>`).join('');
}
function applyTheme(){
  if(!model)return;const aliases={gece:'yildiz',dark:'yildiz',night:'yildiz',noir:'yildiz',lunar:'yildiz',gunduz:'kristal',light:'kristal',lila:'kristal',frost:'kristal',gunbatimi:'alev',sunset:'alev',aurora:'safak',atlas:'orman'};
  let theme=model.state.lc19.theme||model.store.getItem('lc19_theme')||model.state.ui.theme;
  theme=aliases[theme]||theme;if(!['kristal','yildiz','alev','safak','orman'].includes(theme))theme=auth.account?.settings?.theme==='dark'?'yildiz':'kristal';
  model.state.lc19.theme=theme;document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.motion=model.state.lc19.motion===false||model.state.ui.reduce?'reduced':'full';
}
function progressChanged(persisted=false){
  if(!model)return;applyTheme();const s=model.stats();
  document.getElementById('header-streak').textContent=`${s.streak} gün`;
  document.getElementById('header-xp').textContent=`${s.xp.toLocaleString('tr-TR')} XP`;
  if(persisted)auth.progressChanged?.();
}
function updateAccount(account){
  if(!model)return;const p=account.profile||{},goal=Number(account.settings?.daily_goal);
  if(Number.isInteger(goal)&&goal>0&&goal<=200)model.state.settings.goal=goal;
  if(p.display_name)model.state.profile.name=p.display_name;
  const name=p.display_name||model.state.profile.name||'Öğrenci';
  document.getElementById('header-name').textContent=name;
  const avatar=String(p.avatar_url||model.state.profile.avatar||'').replace(/^emoji:/,'');
  document.getElementById('header-avatar').textContent=/^https?:|^data:/i.test(avatar)?name.split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toLocaleUpperCase('tr-TR'):(avatar||name[0]||'L');
  document.getElementById('workspace-kind').textContent=auth.local?'Bu cihazdaki kayıtlar':'Kişisel öğrenme alanı';
  const welcome=view.querySelector('[data-home-name]');if(welcome)welcome.textContent=name.split(' ')[0];
  // Profile arrival must never remount a live exercise or add history entries.
}
async function openWorkspace(){
  const id=auth.user?.id;if(!id||auth.recoveryPending)return;
  if(workspaceUser===id&&model)return;
  const generation=++sessionGeneration;
  disposeRoute();model=null;view.replaceChildren();authView.hidden=true;shell.hidden=false;workspaceUser=id;
  try{
    const opened=createStore({userId:id,seed:[],notify:ui.notify,onSave:()=>progressChanged(true)});
    // Returning members render their saved workspace without waiting for seed/catalog downloads.
    if(!opened.hasSavedState){
      const seed=await catalog.seeds();if(generation!==sessionGeneration||auth.user?.id!==id)return;
      for(const word of seed)opened.ensureWord(word);
      // Persist initial cards without recording study or marking an unknown cloud copy dirty.
      opened.checkpoint();
    }
    model=opened;
    const documentContext={user:auth.user,store:model.store};
    auth.setWorkspace({state:model.state,store:model.store,save:model.save,freshLocal:!opened.hasSavedState,getDocuments:()=>getDocuments(documentContext),replaceDocuments:docs=>replaceDocuments(documentContext,docs)});
    styleShell({store:model.store});setHistory();updateAccount(auth.account);applyTheme();progressChanged();
    renderRoute({scrollY:history.state?.scrollY||0,initial:true});
  }catch(error){if(generation===sessionGeneration){view.innerHTML=`<section class="panel notice"><h1>Çalışma alanı açılamadı</h1><p>${escapeHTML(error.message)}</p><button class="secondary" data-shell-action="reload">Yeniden dene</button></section>`;}}
}
function disposeRoute(){
  controller?.abort();controller=null;
  if(typeof cleanup==='function'){try{cleanup();}catch(error){console.warn('Ekran kapatılamadı',error);}}cleanup=null;
  ui.clearCelebration();ui.cancelSpeech();
}
function showAuth(){
  ++sessionGeneration;++renderGeneration;disposeRoute();model=null;workspaceUser=null;
  shell.hidden=true;authView.hidden=false;view.replaceChildren();closeMenu();
  controller=new AbortController();auth.mount(authView,{signal:controller.signal});document.title=`LexiconCore · ${VERSION}`;
}
function context(signal){return {
  // Keep the user identity fixed for this screen, including queued IndexedDB writes.
  state:model.state,store:model.store,save:model.save,user:auth.user?{...auth.user}:null,get account(){return auth.account;},auth,signal,
  route:currentRoute,params:currentParams,navigate,back,notify:ui.notify,celebrate:ui.celebrate,speak:ui.speak,stopSpeech:ui.cancelSpeech,
  answer:model.answer,activity:model.activity,finishStudy:model.finishStudy,claimJourney:model.claimJourney,stats:model.stats,dueWords:model.dueWords,ensureWord:model.ensureWord,
  catalog,escape:escapeHTML,dayKey,download,render:()=>renderRoute({scrollY:window.scrollY})
};}
async function renderRoute({scrollY=0,initial=false}={}){
  if(!model)return;disposeRoute();const generation=++renderGeneration;
  const parsed=routeFromURL();currentRoute=parsed.route;currentParams=parsed.params;
  controller=new AbortController();const signal=controller.signal,ctx=context(signal);
  updateNavigation();document.title=`${routes[currentRoute].name} · LexiconCore ${VERSION}`;
  // Detach the old screen so an aborted async task cannot write into the current one.
  const screen=document.createElement('div');screen.className='screen';screen.dataset.routeView=currentRoute;view.replaceChildren(screen);
  try{
    const result=await routes[currentRoute].mount(screen,ctx);
    if(generation!==renderGeneration||signal.aborted){if(typeof result==='function')result();return;}
    enhanceRoute(screen,ctx);cleanup=result;window.scrollTo({top:scrollY,behavior:'instant'});
    if(!initial){const heading=screen.querySelector('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
  }catch(error){
    if(signal.aborted)return;
    console.error('Ekran açma hatası:',error);screen.innerHTML=`<section class="panel notice"><h1>Bu bölüm açılamadı</h1><p>${escapeHTML(error.message)}</p><button class="primary" data-shell-action="retry">Yeniden dene</button><button class="secondary" data-route="today">Ana sayfaya dön</button></section>`;
  }
}
const drawerMedia=matchMedia('(max-width: 760px)');
function updateDrawer(open=false){
  document.querySelector('.sidebar').inert=drawerMedia.matches&&!open;
  document.querySelector('.app-main').inert=drawerMedia.matches&&open;
  document.querySelector('.mobile-bottom').inert=drawerMedia.matches&&open;
}
function closeMenu(){document.body.classList.remove('menu-open');document.querySelector('[data-shell-action="menu"]').setAttribute('aria-expanded','false');updateDrawer(false);}
function dismissMenu(){
  const open=document.body.classList.contains('menu-open');
  closeMenu();
  if(open&&drawerMedia.matches)document.querySelector('[data-shell-action="menu"]').focus();
}
drawerMedia.addEventListener?.('change',()=>closeMenu());updateDrawer(false);
document.addEventListener('click',event=>{
  if(event.target.closest('.skip-link')){event.preventDefault();(authView.hidden?view:authView).focus();return;}
  const target=event.target.closest('[data-route],[data-shell-action]');if(!target||event.defaultPrevented)return;
  if(target.dataset.route){event.preventDefault();const params={};for(const k of ['mode','word','q','day','system','node','doc','tab'])if(target.dataset[k])params[k]=target.dataset[k];navigate(target.dataset.route,params);return;}
  const action=target.dataset.shellAction;
  if(action==='back')back();if(action==='forward'&&navIndex<navMax)history.forward();
  if(action==='menu'){const open=document.body.classList.toggle('menu-open');target.setAttribute('aria-expanded',String(open));updateDrawer(open);if(open)document.querySelector('.sidebar button')?.focus();}
  if(action==='close-menu')dismissMenu();if(action==='retry')renderRoute();if(action==='reload')location.reload();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.body.classList.contains('menu-open'))dismissMenu();
  if(event.key==='Tab'&&drawerMedia.matches&&document.body.classList.contains('menu-open')){
    const buttons=[...document.querySelectorAll('.sidebar button,.sidebar a')].filter(b=>!b.disabled);
    if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
window.addEventListener('popstate',()=>{
  if(!model)return;const h=history.state;
  if(h?.a1&&h.uid===workspaceUser&&h.id===navigationId){navIndex=h.index;renderRoute({scrollY:h.scrollY||0});}
  else {setHistory();renderRoute();}
});
// A manually entered hash is also routed once; popstate already handles history traversal.
window.addEventListener('hashchange',()=>{if(model){const p=routeFromURL();if(p.route!==currentRoute||p.params.toString()!==currentParams.toString()){history.replaceState(historyData(),'');renderRoute();}}});
auth.subscribeAccount(updateAccount);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&model){const s=model.stats();document.getElementById('header-streak').textContent=`${s.streak} gün`;}});
window.addEventListener('pagehide',()=>{disposeRoute();auth.dispose?.();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});

function mountHome(screen,ctx){
  const e=ctx.escape,s=ctx.stats(),today=ctx.state.history[dayKey()]||{},goal=Number(ctx.state.settings.goal)||10;
  const introductions=Number(today.introductions)||0,newGoal=Number(ctx.state.settings.dailyNew)||10;
  const done=Number(today.correct)||0,pct=Math.min(100,Math.round(done/goal*100));
  const name=(ctx.account.profile?.display_name||ctx.state.profile.name||'Öğrenci').split(' ')[0];
  const recent=[...ctx.state.words].filter(w=>w.last>0).sort((a,b)=>b.last-a.last).slice(0,6);
  screen.innerHTML=`<section class="home-hero panel"><div class="home-copy"><span class="eyebrow">SÖZCÜKLERDEN DÜŞÜNCEYE</span><h1>Hoş geldin, <span data-home-name>${e(name)}</span>.</h1><p>Her sözcük yeni bir bağlantı.<br>Bugün nereden devam edelim?</p><div class="actions"><button class="primary" data-route="learn" data-mode="${s.due?'due':'mixed'}">${s.due?`${s.due} sözcüğü tekrar et`:'Çalışmaya devam et'} <span aria-hidden="true">↗</span></button><button class="secondary" data-route="journey">Öğrenme yolum</button></div></div><aside class="hero-index" aria-label="Bugünkü çalışma sırası"><span class="eyebrow">ÇALIŞMA SIRAN</span><div><p><strong>Hatırla</strong><small>Vadesi gelen sözcüklerine dön.</small></p></div><div><p><strong>Bağlam kur</strong><small>Sözcüğü bir metin içinde gör.</small></p></div><div><p><strong>Kendi cümleni yaz</strong><small>Bugünkü öğrenmeni günlüğe taşı.</small></p></div></aside></section><div class="home-overview"><section class="panel today-goal"><div><span class="eyebrow">BUGÜNKÜ HEDEF</span><h2>${done} <small>/ ${goal} ipucusuz doğru</small></h2><p class="muted">${done>=goal?'Bugünkü hedefini tamamladın.':`${Math.max(0,goal-done)} ipucusuz doğruyla ölçme hedefini tamamla.`}</p><p class="muted">Yeni sözcük öğrenimi: ${introductions} / ${newGoal}</p></div><div class="goal-ring" style="--progress:${pct*3.6}deg" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Günlük hedef"><span>%${pct}</span></div></section><section class="panel metric"><span class="eyebrow">ÖĞRENME SERİSİ</span><strong>${s.streak}<small> gün</small></strong><p class="muted">Gerçek çalışma günlerin</p></section><section class="panel metric"><span class="eyebrow">SÖZCÜK BİRİKİMİN</span><strong>${s.studied}</strong><p class="muted">${s.mastered} sözcükte ustalaştın</p></section></div><header class="section-heading"><h2>Öğrenme alanların</h2><span class="muted">Merak ettiğin yerden başla</span></header><div class="grid grid-3 home-cards">${[
    ['learn','✦','Çalış','Sözcükler, kökler, anlam ve hatırlama.'],['library','Aa','Sözlük','Kataloğu ara; anlam, biçim ve kaynakları incele.'],['reading','▤','Okuma','Masalların ve kendi metinlerin.'],['universe','✧','Sözcük evreni','Sözcükler arasındaki bağlantıları keşfet.'],['journal','✎','Günlüğüm','Bugünkü çalışmana ve düşüncelerine bak.'],['room','▱','Çalışma odam','Kendine ait bir öğrenme köşesi.']
  ].map(([route,icon,title,description])=>`<button class="panel home-card" data-route="${route}"><span class="feature-icon" aria-hidden="true">${icon}</span><h3>${title}</h3><p class="muted">${description}</p><span class="card-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>${recent.length?`<section class="panel home-recent"><div class="section-heading"><h2>Son çalıştıkların</h2><button class="text-button" data-route="stats">Tüm ilerlemem ↗</button></div><div class="actions">${recent.map(w=>`<button class="chip" data-route="library" data-word="${e(w.en)}">${e(w.en)} <span class="muted">${e(w.tr)}</span></button>`).join('')}</div></section>`:''}`;
}

for(const [id,names] of Object.entries({'nav-main':['today','learn','journey','library','reading','universe'],'nav-personal':['journal','stats','room','focus','world','philo','realworld','awards','assistant'],'nav-account':['account','pro','community','themes','prefs','settings','policy']})){
  document.getElementById(id).innerHTML=names.map(key=>`<button data-route="${key}"><span class="nav-icon" aria-hidden="true">${routes[key].icon}</span>${routes[key].name}</button>`).join('');
}
installNavigation(Object.fromEntries(Object.entries(routes).filter(([name])=>name!=='inbox')));
auth.init().then(()=>{if(!auth.user||auth.recoveryPending)showAuth();}).catch(error=>{showAuth();ui.notify(error.message,'error');});
if('serviceWorker'in navigator&&location.protocol!=='file:'){
  navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(error=>console.warn('Çevrimdışı önbellek kullanılamadı:',error));
}
