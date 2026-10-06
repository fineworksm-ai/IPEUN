import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const output = path.join(root, 'output/layout-revision');
const checks = path.join(root, 'tmp/layout-revision-checks');
await mkdir(output,{recursive:true}); await mkdir(checks,{recursive:true});
const css = await readFile(path.join(root,'styles.css'),'utf8');
assert.ok(!/--home-sky|#(?:e1f7ff|f3fbff|f4fbfc|edf8ff|f6fbff)|background:\s*linear-gradient/i.test(css));
assert.ok(!/home-explore|quick-tile|quick-grid/.test(css));
const pages=['index','company','technology','alljet','invera','contact','privacy','product','events','media','publications'].flatMap(n=>[n+'.html','en/'+n+'.html']);
const profile=await mkdtemp('/private/tmp/ipeun-phase5-browser-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let socket;let seq=0; const pending=new Map(); const errors=[]; const report={pageChecks:[],heroes:[],lightboxes:[],interactions:[],failures:[]};
try {
 let port;for(let i=0;i<100;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}}
 if(!port)throw new Error('Browser startup timed out');
 const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r);socket.addEventListener('error',j)});
 socket.addEventListener('message',event=>{const v=JSON.parse(event.data);if(v.method==='Runtime.exceptionThrown')errors.push(v.params.exceptionDetails.text);if(v.method==='Log.entryAdded'&&v.params.entry.level==='error')errors.push(v.params.entry.text);if(v.method==='Runtime.consoleAPICalled'&&v.params.type==='error')errors.push(v.params.args.map(a=>a.value||a.description).join(' '));if(!v.id)return;const p=pending.get(v.id);if(!p)return;pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 await call('Page.enable');await call('Runtime.enable');await call('Log.enable');await call('Emulation.setFocusEmulationEnabled',{enabled:true});
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 const load=async(file,w,h)=>{errors.length=0;await call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<=900});await call('Page.navigate',{url:'http://localhost:3000/'+file+'?phase5'});await delay(220);await evaluate(`(async()=>{document.querySelectorAll('img').forEach(i=>i.loading='eager');await document.fonts.ready;await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r})));document.querySelectorAll('.reveal').forEach(e=>e.classList.add('is-visible'));document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0);})()`);await delay(80);};
 const shot=async(file,full=false)=>{let params={format:'png',captureBeyondViewport:full};if(full){const m=await call('Page.getLayoutMetrics');params.clip={x:0,y:0,width:m.cssContentSize.width,height:m.cssContentSize.height,scale:1};}const r=await call('Page.captureScreenshot',params);await writeFile(file,Buffer.from(r.data,'base64'));};
 for(const file of pages){
  const source=await readFile(path.join(root,file),'utf8');if(file.endsWith('index.html'))assert.ok(!source.includes('class="trust-section"'));if(file.endsWith('company.html'))assert.ok(!source.includes('class="page-tabs"')&&!source.includes('class="company-info"'));if(file.endsWith('product.html'))assert.ok(!source.includes('http-equiv="refresh"'));assert.ok(!/home-explore|source-note|image-review|bizreg/.test(source),file);
  for(const [width,height] of [[390,844],[1440,900]]){
   await load(file,width,height);
   const data=await evaluate(`(()=>{const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';return {url:location.pathname,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.getAttribute('src')),periodHeadings:[...document.querySelectorAll('h1,h2,h3,.hero-title-small,.banner-statement')].filter(e=>e.textContent.trim().endsWith('.')).map(e=>e.textContent.trim()),nestedLinks:document.querySelectorAll('a a').length,textLinks:document.querySelectorAll('.home-page .text-link').length,cards:[...document.querySelectorAll('.card')].filter(visible).map(e=>{const c=getComputedStyle(e);return{border:c.borderTopWidth,shadow:c.boxShadow,radius:c.borderRadius,bg:c.backgroundColor}}),contact:[...document.querySelectorAll('.contact-band')].map(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e.querySelector('h2')).color,button:getComputedStyle(e.querySelector('.button')).backgroundColor})),palette:[...document.querySelectorAll('section,.card,.hero-slide,.site-footer')].map(e=>getComputedStyle(e).backgroundColor).filter(c=>c!=='rgba(0, 0, 0, 0)')}})()`);
   data.file=file;data.viewport=[width,height];data.errors=[...errors];report.pageChecks.push(data);
   if(data.scrollWidth>data.width||data.brokenImages.length||data.periodHeadings.length||data.errors.length||data.nestedLinks)report.failures.push({file,width,...data});
   if(data.cards.some(c=>c.border!=='0px'||c.shadow!=='none'||c.radius!=='18px'))report.failures.push({file,width,cardStyles:data.cards});
   const allowed=['rgb(255, 255, 255)','rgb(245, 247, 242)','rgb(6, 23, 19)'];if(data.palette.some(c=>!allowed.includes(c)))report.failures.push({file,width,palette:[...new Set(data.palette)]});
   if(file.endsWith('index.html')&&data.textLinks>3)report.failures.push({file,width,textLinks:data.textLinks});
   if(data.contact.some(c=>c.bg!=='rgb(6, 23, 19)'||c.color!=='rgb(255, 255, 255)'||c.button!=='rgb(255, 255, 255)'))report.failures.push({file,width,contact:data.contact});
   const name=file.replace('.html','').replace('/','-');
   await shot(path.join(checks,`${name}-${width}.png`));
   if(['index.html','en/index.html','company.html','en/company.html','product.html','en/product.html'].includes(file))await shot(path.join(output,`home-${name}-${width}-full.png`),true);
   if(file.endsWith('company.html')){
    const count=await evaluate(`document.querySelectorAll('[data-lightbox-src]').length`);let ok=0;
    for(let i=0;i<count;i++){
     const v=await evaluate(`(async()=>{const a=document.querySelectorAll('[data-lightbox-src]')[${i}];a.click();const d=document.querySelector('[data-lightbox]');const img=d.querySelector('img');if(!img.complete)await new Promise(r=>{img.onload=r;img.onerror=r});const result={open:d.open,loaded:!!img.naturalWidth};d.querySelector('[data-lightbox-close]').click();result.closed=!d.open;return result})()`);if(v.open&&v.loaded&&v.closed)ok++;
    }report.lightboxes.push({file,width,total:count,passed:ok});if(ok!==count||count!==20)report.failures.push({file,width,lightboxPassed:ok,total:count});
   }
   console.log(`${file} ${width}: overflow=${data.scrollWidth>data.width}, broken=${data.brokenImages.length}, errors=${data.errors.length}`);
  }
 }
 for(const file of ['index.html','en/index.html'])for(const [width,height]of[[1920,1080],[1440,900],[1280,800],[1024,768],[768,1024],[390,844]]){
  await load(file,width,height);
  for(let i=0;i<3;i++){
   await evaluate(`document.querySelector('[data-slide-to="${i}"]').click();window.scrollTo(0,0)`);await delay(40);
   const data=await evaluate(`(()=>{const a=document.querySelector('[data-slide].is-active'),hero=a.getBoundingClientRect(),copy=a.querySelector('.hero-copy').getBoundingClientRect(),visual=a.querySelector('.brand-visual,.hero-product').getBoundingClientRect(),controls=document.querySelector('.hero-controls').getBoundingClientRect();const r=e=>({left:e.left,right:e.right,top:e.top,bottom:e.bottom,width:e.width,height:e.height});return {hero:r(hero),copy:r(copy),visual:r(visual),controls:r(controls),count:document.querySelector('[data-slide-count]').textContent,objectFit:getComputedStyle(a.querySelector('.brand-photo,.hero-product img')).objectFit,controlBackground:getComputedStyle(document.querySelector('.hero-controls')).backgroundColor}})()`);
   report.heroes.push({file,width,height,slide:i+1,...data});
   if(data.hero.height>740||data.copy.bottom>data.hero.bottom||width<=600&&(data.copy.bottom>data.visual.top||data.controls.bottom>data.visual.top))report.failures.push({file,width,height,slide:i+1,heroGeometry:data});
   await shot(path.join(output,`hero-${file.startsWith('en/')?'en':'ko'}-${width}x${height}-slide-${i+1}.png`));
  }
 }
 // Check actual keyboard focus, image hover and inquiry option appearance.
 await load('index.html',1440,900);
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 await evaluate(`document.querySelector('.product-card').focus()`);await delay(50);
 const productFocus=await evaluate(`({visible:document.querySelector('.product-card').matches(':focus-visible'),outline:getComputedStyle(document.querySelector('.product-card')).outlineWidth,nested:!!document.querySelector('.product-card a')})`);
 report.interactions.push({productFocus});if(!productFocus.visible||productFocus.outline!=='2px'||productFocus.nested)report.failures.push({productFocus});
 await evaluate(`document.querySelector('.product-card').scrollIntoView({block:'center'})`);
 const pt=await evaluate(`(()=>{const r=document.querySelector('.product-card').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+100}})()`);await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y});
 await delay(50);const hover=await evaluate(`getComputedStyle(document.querySelector('.product-stage img')).transform`);report.interactions.push({hover});if(!hover.startsWith('matrix(1.03'))report.failures.push({hover});
 await load('contact.html',390,844);
 await evaluate(`document.querySelector('.purpose-option input').click();document.querySelector('.form-field input').focus()`);await delay(50);
 const selected=await evaluate(`(()=>{const input=document.querySelector('.purpose-option input');const e=input.closest('.purpose-option');const c=getComputedStyle(e);const f=document.querySelector('.form-field input');f.focus();return{background:c.backgroundColor,color:c.color,inputBackground:getComputedStyle(f).backgroundColor,inputOutline:getComputedStyle(f).outlineWidth}})()`);report.interactions.push({selected});if(selected.background!=='rgb(6, 23, 19)'||selected.color!=='rgb(255, 255, 255)'||selected.inputOutline!=='2px')report.failures.push({selected});
 await writeFile(path.join(root,'output/layout-revision-results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({pageChecks:report.pageChecks.length,heroChecks:report.heroes.length,lightboxes:report.lightboxes,failures:report.failures.length}));
 if(report.failures.length)process.exitCode=1;
} finally {socket?.close();browser.kill('SIGTERM');}
