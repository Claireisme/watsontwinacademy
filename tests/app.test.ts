import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { generateKeyPair,exportJWK,SignJWT } from 'jose';
import app from '../src/worker';
import { defaults,seedCourses } from '../src/defaults';
import { sendEnquiry } from '../src/mail';
import {newReference} from '../src/reference';
import {isLocal} from '../src/security';
import type { Env } from '../src/types';
let sqlite:DatabaseSync,env:Env,pending:Promise<unknown>[];
// Real SQLite statements and transactions; fetch is stubbed only at provider boundaries.
function database():D1Database{
 const prepare=(sql:string,args:unknown[]=[]):any=>({bind:(...a:unknown[])=>prepare(sql,a),first:async()=>sqlite.prepare(sql).get(...args as any[])||null,all:async()=>({success:true,results:sqlite.prepare(sql).all(...args as any[])}),run:async()=>{const r=sqlite.prepare(sql).run(...args as any[]);return {success:true,meta:{changes:Number(r.changes)}}}});
 return {prepare,batch:async(statements:any[])=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}} as unknown as D1Database;
}
const token='a'.repeat(64);
function req(path:string,method='GET',data?:unknown,admin=false,origin='http://localhost:8788'){
 const headers:Record<string,string>={'Origin':origin,'Content-Type':'application/json'};if(admin)headers.Cookie=`wta_local=${token}`;
 return app.fetch(new Request(`http://localhost:8788${path}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env,{waitUntil:(p:Promise<unknown>)=>{pending.push(p)},passThroughOnException:()=>{}} as unknown as ExecutionContext);
}
const enquiry=()=>({id:crypto.randomUUID(),parent_name:'Test Parent',email:'parent@example.com',phone:'087 1234567',age_group:'5–7',course_id:'irish-dance',message:'Which class is suitable?',consent:true,website:'',turnstile:'test-token'});
beforeEach(()=>{
 sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('migrations/0001_initial.sql','utf8'));sqlite.exec(readFileSync('migrations/0003_content_seo.sql','utf8'));sqlite.exec(readFileSync('migrations/0004_enquiry_reference.sql','utf8'));
 sqlite.prepare('INSERT INTO settings(id,data) VALUES(1,?)').run(JSON.stringify(defaults));
 for(const c of seedCourses)sqlite.prepare('INSERT INTO courses(id,slug,title,category,summary,description,image,published) VALUES(?,?,?,?,?,?,?,1)').run(c.id,c.slug,c.title,c.category,c.summary,c.description,c.image);
 env={DB:database(),MEDIA:{} as R2Bucket,ASSETS:{} as Fetcher,SITE_URL:'http://localhost:8788',ENVIRONMENT:'local',LOCAL_ADMIN_TOKEN:token,TURNSTILE_SECRET_KEY:'test',TURNSTILE_SITE_KEY:'test'};pending=[];
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,hostname:'localhost'})));
});
afterEach(async()=>{await Promise.all(pending);vi.unstubAllGlobals();sqlite.close()});
describe('public website and access control',()=>{
 it('server renders real course content and individual metadata',async()=>{const r=await req('/classes/irish-dance');expect(r.status).toBe(200);const body=await r.text();expect(body).toContain('<title>Irish Dance |');expect(body).toContain('Find your rhythm');expect(body).toContain('og:image');});
 it('does not expose drafts to visitors or sitemap',async()=>{sqlite.exec("UPDATE courses SET published=0 WHERE id='irish-dance'");expect((await req('/classes/irish-dance')).status).toBe(404);expect(await(await req('/sitemap.xml')).text()).not.toContain('/classes/irish-dance');});
 it('denies unauthenticated admin API requests',async()=>{expect((await req('/api/admin/settings','PUT',{})).status).toBe(401)});
 it('rejects cross-origin admin mutations',async()=>{expect((await req('/api/admin/settings','PUT',{},true,'https://attacker.example')).status).toBe(403)});
 it('never accepts local credentials in production',async()=>{env.ENVIRONMENT='production';expect((await req('/admin','GET',undefined,true)).status).toBe(401)});
 it('allows only the explicitly configured LAN origin in local mode',()=>{
  env.LOCAL_PREVIEW_ORIGIN='http://192.168.1.111:8788';
  expect(isLocal(env,'http://192.168.1.111:8788/admin')).toBe(true);
  expect(isLocal(env,'http://192.168.1.112:8788/admin')).toBe(false);
  expect(isLocal(env,'http://192.168.1.111:9000/admin')).toBe(false);
  env.ENVIRONMENT='production';expect(isLocal(env,'http://192.168.1.111:8788/admin')).toBe(false);
 });
 it('fails closed on a forged Access token',async()=>{env.ENVIRONMENT='production';env.ACCESS_TEAM_DOMAIN='https://academy.cloudflareaccess.com';env.ACCESS_AUD='test';env.ADMIN_EMAILS='admin@example.com';const r=await app.fetch(new Request('http://localhost:8788/admin',{headers:{'Cf-Access-Jwt-Assertion':'not-a-real-token'}}),env);expect(r.status).toBe(401)});
 it('validates real RSA signatures, audience and administrator allowlist',async()=>{
  const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='RS256';
  env.ENVIRONMENT='production';env.ACCESS_TEAM_DOMAIN='https://verified-test.cloudflareaccess.com';env.ACCESS_AUD='academy-aud';env.ADMIN_EMAILS='admin@example.com';
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({keys:[jwk]})));
  const signed=async(email:string,aud:string)=>new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('staff').setIssuer(env.ACCESS_TEAM_DOMAIN!).setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const access=async(jwt:string)=>app.fetch(new Request('http://localhost:8788/admin',{headers:{'Cf-Access-Jwt-Assertion':jwt}}),env);
  expect((await access(await signed('admin@example.com','academy-aud'))).status).toBe(200);
  expect((await access(await signed('outsider@example.com','academy-aud'))).status).toBe(401);
  expect((await access(await signed('admin@example.com','wrong-aud'))).status).toBe(401);
 });
 it('renders escaped content rather than executable HTML',async()=>{sqlite.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify({...defaults,hero_title:'<img src=x onerror=alert(1)>'}));const body=await(await req('/')).text();expect(body).toContain('&lt;img');expect(body).not.toContain('<img src=x onerror=alert(1)>');});
 it('sets private cache and framing headers',async()=>{const r=await req('/admin','GET',undefined,true);expect(r.headers.get('cache-control')).toBe('no-store');expect(r.headers.get('x-frame-options')).toBe('DENY');expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");});
});
describe('enquiry durability and notifications',()=>{
 it('uses Dublin date at the UTC day boundary',()=>{expect(newReference(new Date('2026-09-16T23:30:00Z'))).toMatch(/^260917[a-z]{3}$/)});
 it('keeps one short reference on retries and displays it in admin',async()=>{
  const d=enquiry();const first=await (await req('/api/enquiries','POST',d)).json() as any;
  expect(first.reference).toMatch(/^\d{6}[a-z]{3}$/);
  const repeat=await (await req('/api/enquiries','POST',d)).json() as any;
  expect(repeat.reference).toBe(first.reference);
  const html=await (await req('/admin/enquiries','GET',undefined,true)).text();expect(html).toContain('Reference: '+first.reference);
 });
 it('retries reference collisions without losing an enquiry or outbox',async()=>{
  const random=vi.spyOn(crypto,'getRandomValues');random.mockImplementation((a:any)=>{a.fill(0);return a});
  const first=await (await req('/api/enquiries','POST',enquiry())).json() as any;
  let calls=0;random.mockImplementation((a:any)=>{a.fill(calls++<3?0:1);return a});
  const second=await (await req('/api/enquiries','POST',enquiry())).json() as any;
  expect(first.reference.slice(-3)).toBe('aaa');expect(second.reference.slice(-3)).toBe('bbb');
  expect(sqlite.prepare('SELECT count(*) n FROM mail_outbox').get()?.n).toBe(2);random.mockRestore();
 });
 it('saves enquiry and outbox before returning success',async()=>{const d=enquiry();const r=await req('/api/enquiries','POST',d);expect(r.status).toBe(201);expect(sqlite.prepare('SELECT id FROM enquiries').get()).toEqual({id:d.id});expect(sqlite.prepare('SELECT enquiry_id FROM mail_outbox').get()).toEqual({enquiry_id:d.id});await Promise.all(pending);expect(sqlite.prepare('SELECT status FROM mail_outbox').get()).toEqual({status:'failed'});});
 it('rejects missing consent without saving',async()=>{expect((await req('/api/enquiries','POST',{...enquiry(),consent:false})).status).toBe(400);expect(sqlite.prepare('SELECT count(*) n FROM enquiries').get()?.n).toBe(0)});
 it('requires server-side Turnstile verification',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:false})));expect((await req('/api/enquiries','POST',enquiry())).status).toBe(400);expect(sqlite.prepare('SELECT count(*) n FROM enquiries').get()?.n).toBe(0)});
 it('rejects another hostname in production',async()=>{env.ENVIRONMENT='production';vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,hostname:'other.example'})));expect((await req('/api/enquiries','POST',enquiry())).status).toBe(400)});
 it('does not save honeypot submissions',async()=>{expect((await req('/api/enquiries','POST',{...enquiry(),website:'spam'})).status).toBe(200);expect(sqlite.prepare('SELECT count(*) n FROM enquiries').get()?.n).toBe(0)});
 it('does not duplicate retried form submissions',async()=>{const d=enquiry();await req('/api/enquiries','POST',d);await req('/api/enquiries','POST',d);await Promise.all(pending);expect(sqlite.prepare('SELECT count(*) n FROM enquiries').get()?.n).toBe(1);expect(sqlite.prepare('SELECT attempts FROM mail_outbox').get()?.attempts).toBe(1)});
 it('limits excessive enquiries',async()=>{for(let i=0;i<8;i++)await req('/api/enquiries','POST',{...enquiry(),course_id:'not-real'});expect((await req('/api/enquiries','POST',enquiry())).status).toBe(429)});
 it('retries a failed notification with reply-to and stable provider idempotency',async()=>{const d=enquiry();await req('/api/enquiries','POST',d);await Promise.all(pending);env.RESEND_API_KEY='fake-test-key';env.MAIL_FROM='WTA <hello@example.com>';env.NOTIFICATION_EMAIL='academy@gmail.com';const mock=vi.fn(async()=>Response.json({id:'provider-123'}));vi.stubGlobal('fetch',mock);expect(await sendEnquiry(env,d.id)).toBe(true);expect(await sendEnquiry(env,d.id)).toBe(false);expect(mock).toHaveBeenCalledTimes(1);const init=(mock.mock.calls[0] as unknown as [string,RequestInit])[1];const payload=JSON.parse(init.body as string);expect(payload.to).toEqual(['academy@gmail.com']);expect(payload.reply_to).toBe(d.email);expect(payload.text).toContain('Reference: '+sqlite.prepare('SELECT reference FROM enquiries WHERE id=?').get(d.id)?.reference);expect((init.headers as Record<string,string>)['Idempotency-Key']).toBe(`wta-enquiry-${d.id}`);expect(sqlite.prepare('SELECT status FROM mail_outbox').get()?.status).toBe('sent')});
 it('records provider rejection without losing the enquiry',async()=>{const d=enquiry();env.RESEND_API_KEY='fake';env.MAIL_FROM='test@example.com';env.NOTIFICATION_EMAIL='academy@gmail.com';vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('siteverify')?Response.json({success:true,hostname:'localhost'}):Response.json({}, {status:503})));expect((await req('/api/enquiries','POST',d)).status).toBe(201);await Promise.all(pending);expect(sqlite.prepare('SELECT status FROM mail_outbox').get()?.status).toBe('failed');expect(sqlite.prepare('SELECT id FROM enquiries').get()?.id).toBe(d.id)});
 it('rejects oversized messages',async()=>{expect((await req('/api/enquiries','POST',{...enquiry(),message:'x'.repeat(35000)})).status).toBe(413)});
});
describe('daily maintenance',()=>{
 it('saves homepage edits and rejects stale versions',async()=>{const data={...defaults,hero_title:'A new headline',version:1};expect((await req('/api/admin/settings','PUT',data,true)).status).toBe(200);expect(await(await req('/')).text()).toContain('A new headline');expect((await req('/api/admin/settings','PUT',data,true)).status).toBe(409)});
 it('rejects unsafe image URLs in courses',async()=>{const course={...seedCourses[0],ages:'',price:'',schedule:'',published:1,sort_order:0,version:1,image:'javascript:alert(1)'};expect((await req('/api/admin/courses/irish-dance','PUT',course,true)).status).toBe(400)});
 it('updates status and cascades personal-data deletion to outbox',async()=>{const d=enquiry();await req('/api/enquiries','POST',d);await Promise.all(pending);expect((await req(`/api/admin/enquiries/${d.id}`,'PATCH',{status:'contacted'},true)).status).toBe(200);expect((await req(`/api/admin/enquiries/${d.id}`,'DELETE',undefined,true)).status).toBe(200);expect(sqlite.prepare('SELECT count(*) n FROM mail_outbox').get()?.n).toBe(0);expect(sqlite.prepare('SELECT count(*) n FROM audit_log').get()?.n).toBe(2)});
 it('rejects invalid enquiry status',async()=>{expect((await req('/api/admin/enquiries/test','PATCH',{status:'unknown'},true)).status).toBe(400)});
 it('rejects invalid local login and accepts only the configured token',async()=>{expect((await req('/api/local-login','POST',{token:'wrong'})).status).toBe(401);const r=await req('/api/local-login','POST',{token});expect(r.status).toBe(200);expect(r.headers.get('set-cookie')).toContain('HttpOnly')});
});
describe('page publishing and SEO',()=>{
 const copy={eyebrow:'NEWS FROM WTA',title:'A fresh introduction',intro:'A new welcome for our academy visitors.',body:'First paragraph.\n\nSecond paragraph.',version:0,action:'draft'};
 const seo={key:'/classes',title:'Irish Dance Classes in South Dublin',description:'Find a welcoming Irish dance class at our Templeogue studios. Meet the teachers, explore the programme and enquire about a suitable group.',image:'/assets/studio.jpg',noindex:0,version:0};
 it('saves private drafts and publishes only on explicit publish',async()=>{
  expect((await req('/api/admin/pages/classes','PUT',copy,true)).status).toBe(200);
  expect(await(await req('/classes')).text()).not.toContain(copy.title);
  const preview=await req('/admin/preview/classes','GET',undefined,true);expect(await preview.text()).toContain(copy.title);expect(preview.headers.get('x-robots-tag')).toContain('noindex');
  expect((await req('/admin/preview/classes')).status).toBe(401);
  expect((await req('/api/admin/pages/classes','PUT',{...copy,version:1,action:'publish'},true)).status).toBe(200);
  expect(await(await req('/classes')).text()).toContain(copy.title);
  expect((await req('/api/admin/pages/classes','PUT',{...copy,version:1},true)).status).toBe(409);
 });
 it('preserves the published copy during subsequent draft changes',async()=>{
  await req('/api/admin/pages/about','PUT',{...copy,action:'publish'},true);
  await req('/api/admin/pages/about','PUT',{...copy,title:'Still a draft',version:1},true);
  const body=await(await req('/about')).text();expect(body).toContain(copy.title);expect(body).not.toContain('Still a draft');
 });
 it('escapes stored page content and rejects unknown pages',async()=>{
  await req('/api/admin/pages/contact','PUT',{...copy,body:'<script>alert(1)</script>',action:'publish'},true);
  expect(await(await req('/contact')).text()).toContain('&lt;script&gt;');
  expect((await req('/api/admin/pages/unknown','PUT',copy,true)).status).toBe(404);
 });
 it('updates search and social metadata with optimistic locking',async()=>{
  expect((await req('/api/admin/seo','PUT',seo,true)).status).toBe(200);
  const body=await(await req('/classes')).text();expect(body).toContain(`<title>${seo.title} | Watson Twin Academy</title>`);expect(body).toContain(`property="og:description" content="${seo.description}"`);expect(body).toContain('https://watsontwinacademy.ie/assets/studio.jpg');
  expect((await req('/api/admin/seo','PUT',seo,true)).status).toBe(409);
 });
 it('uses canonical production URLs and blocks preview indexing',async()=>{
  const r=await req('/classes/irish-dance?utm_source=test');const body=await r.text();expect(body).toContain('rel="canonical" href="https://watsontwinacademy.ie/classes/irish-dance"');expect(r.headers.get('x-robots-tag')).toContain('noindex');expect(await(await req('/robots.txt')).text()).toBe('User-agent: *\nDisallow: /\n');
 });
 it('includes only indexable published pages in the sitemap',async()=>{
  await req('/api/admin/seo','PUT',{...seo,noindex:1},true);
  const xml=await(await req('/sitemap.xml')).text();expect(xml).not.toContain('<loc>https://watsontwinacademy.ie/classes</loc>');expect(xml).toContain('<lastmod>');expect(xml).not.toContain('localhost');
  env.ENVIRONMENT='production';env.SITE_URL='https://watsontwinacademy.ie';
  const page=await app.fetch(new Request(env.SITE_URL+'/classes'),env);expect(page.headers.get('x-robots-tag')).toContain('noindex');
  const home=await app.fetch(new Request(env.SITE_URL+'/'),env);expect(home.headers.get('x-robots-tag')).toBeNull();
 });
 it('uses valid organization, course and breadcrumb JSON-LD from actual content',async()=>{
  const body=await(await req('/classes/irish-dance')).text();
  const graph=JSON.parse(body.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)![1]);
  expect(graph['@graph'].map((e:any)=>e['@type'])).toEqual(expect.arrayContaining(['EducationalOrganization','Course','BreadcrumbList']));
  expect(graph['@graph'].find((e:any)=>e['@type']==='Course').name).toBe('Irish Dance');
 });
 it('redirects changed course URLs directly and retains course SEO',async()=>{
  const c={...seedCourses[0],ages:'',schedule:'',price:'',published:1,sort_order:0,version:1,slug:'irish-dance-dublin'};
  await req('/api/admin/seo','PUT',{...seo,key:'course:irish-dance'},true);
  expect((await req('/api/admin/courses/irish-dance','PUT',c,true)).status).toBe(200);
  const old=await req('/classes/irish-dance');expect(old.status).toBe(301);expect(old.headers.get('location')).toBe('/classes/irish-dance-dublin');
  expect(await(await req('/classes/irish-dance-dublin')).text()).toContain(seo.title);
  expect((await req('/api/admin/courses','POST',{...c,slug:'irish-dance',version:0},true)).status).toBe(409);
  await req('/api/admin/courses/irish-dance','PUT',{...c,slug:'irish-dance-templeogue',version:2},true);
  expect((await req('/classes/irish-dance')).headers.get('location')).toBe('/classes/irish-dance-templeogue');
 });
 it('normalizes trailing slashes and marks 404s noindex',async()=>{const r=await req('/classes/');expect(r.status).toBe(301);expect(r.headers.get('location')).toBe('/classes');expect((await req('/missing')).headers.get('x-robots-tag')).toContain('noindex')});
 it('rejects unsafe SEO images and unknown keys',async()=>{expect((await req('/api/admin/seo','PUT',{...seo,image:'https://evil.example/image.svg'},true)).status).toBe(400);expect((await req('/api/admin/seo','PUT',{...seo,key:'/no-such-page'},true)).status).toBe(404)});
});
