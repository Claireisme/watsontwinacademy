import {chromium} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const origin='http://192.168.1.111:8788';
const token=readFileSync('.dev.vars','utf8').match(/^LOCAL_ADMIN_TOKEN=(.+)$/m)?.[1]?.trim();
const out='.wrangler/browser-check';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const failures=[],results=[];
try{
 const context=await browser.newContext();
 await context.addCookies([{name:'wta_local',value:token,domain:'192.168.1.111',path:'/',httpOnly:true,sameSite:'Strict'}]);
 const page=await context.newPage();let errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const routes=['/','/classes','/classes/irish-dance','/classes/lyrical','/classes/acro-gymnastics','/classes/jazz-hiphop','/classes/musical-theatre','/classes/competition','/about','/gallery','/contact','/enrolment','/timetable','/privacy','/admin','/admin/courses','/admin/courses/new','/admin/courses/irish-dance','/admin/content','/admin/gallery','/admin/enquiries','/admin/activity','/admin/pages','/admin/pages/classes','/admin/preview/classes','/admin/seo','/admin/seo?key=%2F','/admin/seo?key=course%3Airish-dance'];
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});
  for(const path of routes){
   errors=[];const response=await page.goto(origin+path,{waitUntil:'load'});
   await page.evaluate(()=>document.fonts.ready);
   const result=await page.evaluate(()=>{
    const bad=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width&&s.position!=='absolute'&&s.position!=='fixed'&&(r.right>innerWidth+2||r.left<-2)&&!e.closest('.table-wrap, .admin-sidebar nav')}).slice(0,8).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width}));
    return {width:innerWidth,scroll:document.documentElement.scrollWidth,bad,missingImages:[...document.images].filter(i=>i.getAttribute('src')&&i.getBoundingClientRect().width>0&&i.loading!=='lazy'&&(!i.complete||i.naturalWidth===0)).map(i=>i.src),detailDisplay:document.querySelector('.detail-hero')?getComputedStyle(document.querySelector('.detail-hero')).display:null,css:document.querySelector('link[rel=stylesheet]')?.getAttribute('href')};
   });
   results.push({path,width,...result});
   if(response.status()!==200||result.scroll>width+2||errors.length||result.missingImages.length||result.detailDisplay&&result.detailDisplay!=='grid')failures.push({path,width,status:response.status(),errors:[...errors],...result});
   if([1440,390].includes(width)&&['/','/classes/musical-theatre','/enrolment','/about','/admin','/admin/courses/new','/admin/pages','/admin/seo'].includes(path))await page.screenshot({path:`${out}/${path.replaceAll('/','_')||'home'}-${width}.png`,fullPage:true});
  }
  console.log(`Inspected ${routes.length} pages at ${width}px`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto(origin+'/classes');await page.getByRole('button',{name:'Menu'}).click();if(!await page.locator('#navigation').isVisible())failures.push({interaction:'Mobile navigation did not open'});await page.getByRole('button',{name:'Menu'}).click();
 await page.getByRole('button',{name:'Irish dance',exact:true}).click();if(await page.locator('.course-card:visible').count()!==2)failures.push({interaction:'Class filter failed'});
 await page.goto(origin+'/gallery');await page.locator('.gallery-open').first().click();if(!await page.locator('#lightbox').isVisible())failures.push({interaction:'Gallery did not open'});await page.getByRole('button',{name:'Close image'}).click();
 await page.goto(origin+'/enrolment');
 const insecure=await page.evaluate(()=>({secure:isSecureContext,randomUUID:typeof crypto.randomUUID}));
 console.log('LAN browser context',insecure);
 await page.getByRole('textbox',{name:'Parent / guardian name'}).fill('Browser test');await page.getByRole('textbox',{name:'Email address'}).fill('browser@example.com');await page.locator('[name=consent]').check();
 // Exercise the real form script without saving/sending any enquiry.
 await page.route('**/api/enquiries',async route=>{const data=route.request().postDataJSON();if(!/^[a-f0-9-]{36}$/.test(data.id))failures.push({interaction:'Invalid enquiry UUID'});await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,id:data.id})})});
 await page.evaluate(()=>{let input=document.querySelector('[name="cf-turnstile-response"]');if(!input){input=document.createElement('input');input.type='hidden';input.name='cf-turnstile-response';document.querySelector('#enquiry-form').append(input)}input.value='local-browser-test'});
 await page.getByRole('button',{name:'Send my enquiry'}).click();await page.locator('#enquiry-success:visible').waitFor({timeout:5000});
 writeFileSync(`${out}/results.json`,JSON.stringify({origin,pages:results.length,failures,results},null,2));
 console.log(JSON.stringify({pages:results.length,failures},null,2));
 if(failures.length)process.exitCode=1;
}finally{await browser.close()}
