import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { html,raw } from 'hono/html';
import type { AppEnv,Course,Enquiry } from './types';
import { getSettings, getCourses,getGallery } from './data';
import * as views from './views';
import * as admin from './admin';
import api from './api';
import {authenticate,isLocal,sameOrigin} from './security';
import {pageDefaults,pageRecord,publishedCopy,type PageCopy} from './content';
import {staticSeo,publicOrigin,isPublicProduction,seoEntry,seoTargets,resolveSeo,targetForCourse,structuredData,sitemap,type SeoTarget,type SeoEntry} from './seo';
import cms from './content-api';
import * as contentAdmin from './content-admin';
import type {Settings} from './types';
const app = new Hono<AppEnv>();
app.use('*',async(c,next)=>{
 const nonce=btoa(crypto.randomUUID());c.set('nonce',nonce);
 c.header('X-Content-Type-Options','nosniff');c.header('Referrer-Policy','strict-origin-when-cross-origin');
 c.header('X-Frame-Options','DENY');c.header('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 c.header('Content-Security-Policy',`default-src 'self'; script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`);
 c.header('Cache-Control','no-store');
 if(!isPublicProduction(c.env,c.req.url)||c.req.path.startsWith('/admin')||c.req.path.startsWith('/api'))c.header('X-Robots-Tag','noindex, nofollow');
 if(!['GET','HEAD','OPTIONS'].includes(c.req.method)&&!sameOrigin(c.req.raw))return c.json({error:'Request origin is not allowed.'},403);
 if(c.req.path==='/admin'||c.req.path.startsWith('/admin/')||c.req.path.startsWith('/api/admin/')){
  const actor=await authenticate(c);
  if(!actor){
   if(c.req.path.startsWith('/api/'))return c.json({error:'Please sign in to the staff area.'},401);
   const {defaults}=await import('./defaults');
   return c.html(views.layout('Staff sign-in','Academy management',admin.login(isLocal(c.env,c.req.url)),defaults,'/admin',c.env.SITE_URL,nonce,{admin:true}),401);
  }c.set('actor',actor);
 }
 if(['GET','HEAD'].includes(c.req.method)&&!/^\/(admin|api|assets|media|cdn-cgi)(\/|$)/.test(c.req.path)){
  const u=new URL(c.req.url),official=new URL(publicOrigin(c.env));
  if(c.env.ENVIRONMENT==='production'&&u.hostname==='www.'+official.hostname){u.protocol='https:';u.host=official.host;return c.redirect(u.toString(),301)}
  if(u.pathname.length>1&&u.pathname.endsWith('/')){u.pathname=u.pathname.replace(/\/+$/,'')||'/';return c.redirect(u.pathname+u.search,301)}
 }
 await next();
});
app.use('/api/*',async(c,next)=>bodyLimit({maxSize:c.req.path==='/api/admin/media'?5*1024*1024+65536:32768,onError:c=>c.json({error:'The submitted content is too large.'},413)})(c,next));
app.route('/api',api);
app.route('/api',cms);
app.get('/media/:key',async c=>{
 const key=c.req.param('key');if(!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key))return c.notFound();
 const obj=await c.env.MEDIA.get(key);if(!obj)return c.notFound();
 c.header('Content-Type',obj.httpMetadata?.contentType||'application/octet-stream');c.header('Cache-Control','public, max-age=31536000, immutable');c.header('ETag',obj.httpEtag);
 return c.body(obj.body);
});
async function publicPage(c:Context<AppEnv>,path:string,body:any,s:Settings,course?:Course){
 const target:SeoTarget=course?targetForCourse(course):{key:path,path,label:path,...staticSeo[path],image:s.hero_image,published:true};
 const meta=resolveSeo(target,await seoEntry(c.env,target.key));
 const noindex=meta.noindex||!isPublicProduction(c.env,c.req.url);
 if(noindex)c.header('X-Robots-Tag','noindex, follow');
 return c.html(views.layout(meta.title,meta.description,body,s,path,publicOrigin(c.env),c.get('nonce'),{image:meta.image,noindex,structured:structuredData(c.env,s,path,meta.title,meta.description,course),turnstile:path==='/enrolment'?c.env.TURNSTILE_SITE_KEY:undefined}));
}
async function builtin(c:Context<AppEnv>,path:string,s:Settings,copy:PageCopy){
 if(path==='/classes')return views.classes(await getCourses(c.env),copy);
 if(path==='/timetable')return views.timetable(await getCourses(c.env),copy);
 if(path==='/about')return views.about(s,copy);
 if(path==='/gallery')return views.gallery(await getGallery(c.env),copy);
 if(path==='/enrolment')return views.enquiry(s,await getCourses(c.env),c.req.query('course')||'',c.env.TURNSTILE_SITE_KEY,copy);
 if(path==='/contact')return views.contact(s,copy);
 return views.privacy(s,copy);
}
app.get('/',async c=> {const [{data},courses]=await Promise.all([getSettings(c.env),getCourses(c.env)]);return publicPage(c,'/',views.home(data,courses),data)});
for(const path of Object.keys(pageDefaults))app.get(path,async c=>{
 const [{data},copy]=await Promise.all([getSettings(c.env),publishedCopy(c.env,path)]);
 return publicPage(c,path,await builtin(c,path,data,copy),data);
});
app.get('/classes/:slug',async c=>{
 const slug=c.req.param('slug');
 const course=await c.env.DB.prepare('SELECT * FROM courses WHERE slug=? AND published=1').bind(slug).first<Course>();
 if(!course){
  const redirect=await c.env.DB.prepare('SELECT c.slug FROM course_redirects r JOIN courses c ON c.id=r.course_id WHERE r.slug=? AND c.published=1 AND c.slug<>?').bind(slug,slug).first<{slug:string}>();
  return redirect?c.redirect('/classes/'+redirect.slug,301):c.notFound();
 }
 const {data}=await getSettings(c.env);return publicPage(c,c.req.path,views.courseDetail(course),data,course);
});
app.get('/robots.txt',c=>c.text(isPublicProduction(c.env,c.req.url)?`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${publicOrigin(c.env)}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n'));
app.get('/sitemap.xml',async c=>{c.header('Content-Type','application/xml; charset=utf-8');return c.body(await sitemap(c.env))});
app.get('/admin/pages/:slug',async c=>{
 const path='/'+c.req.param('slug');if(!Object.hasOwn(pageDefaults,path))return c.notFound();
 const [{data},record]=await Promise.all([getSettings(c.env),pageRecord(c.env,path)]);
 return c.html(views.layout('Edit page','Private page editing',admin.adminShell('/admin/pages',c.get('actor'),contentAdmin.pageEditor(path,record)),data,c.req.path,publicOrigin(c.env),c.get('nonce'),{admin:true}));
});
app.get('/admin/preview/:slug',async c=>{
 const path='/'+c.req.param('slug');if(!Object.hasOwn(pageDefaults,path))return c.notFound();
 const [{data},record]=await Promise.all([getSettings(c.env),pageRecord(c.env,path)]);
 const copy=record?JSON.parse(record.draft_data):pageDefaults[path];
 const body=html`<div class="preview-banner">Saved draft preview · Only visible to signed-in staff. <a href="/admin/pages/${c.req.param('slug')}">Back to editor →</a></div>${await builtin(c,path,data,copy)}`;
 return c.html(views.layout('Draft preview',copy.intro,body,data,path,publicOrigin(c.env),c.get('nonce'),{noindex:true,turnstile:path==='/enrolment'?c.env.TURNSTILE_SITE_KEY:undefined}));
});
app.get('/admin',async c=>{
 const [settings,stats,recent]=await Promise.all([getSettings(c.env),c.env.DB.prepare("SELECT (SELECT count(*) FROM courses WHERE published=1) AS courses,(SELECT count(*) FROM enquiries) AS enquiries,(SELECT count(*) FROM enquiries WHERE status='new') AS newCount,(SELECT count(*) FROM mail_outbox WHERE status!='sent') AS failed").first<{courses:number;enquiries:number;newCount:number;failed:number}>(),c.env.DB.prepare('SELECT e.*,c.title AS course_title FROM enquiries e LEFT JOIN courses c ON c.id=e.course_id ORDER BY e.created_at DESC LIMIT 5').all<Enquiry>()]);
 return c.html(views.layout('Academy workspace','Private academy management',admin.adminShell('/admin',c.get('actor'),admin.overview(stats!,recent.results,c.env)),settings.data,'/admin',c.env.SITE_URL,c.get('nonce'),{admin:true}));
});
app.get('/admin/:section',async c=>{
 const section=c.req.param('section'),{data,version}=await getSettings(c.env);let body:any;
 if(section==='pages')body=contentAdmin.pageList((await c.env.DB.prepare('SELECT * FROM page_content').all<import('./content').PageRecord>()).results);
 else if(section==='seo'){const targets=await seoTargets(c.env);const entries=(await c.env.DB.prepare('SELECT * FROM seo_entries').all<SeoEntry>()).results;body=contentAdmin.seoManager(targets,entries,c.req.query('key'),publicOrigin(c.env),!isPublicProduction(c.env,c.req.url));}
 else if(section==='courses')body=admin.courseList(await getCourses(c.env,true));
 else if(section==='content')body=admin.contentEditor(data,version);
 else if(section==='gallery')body=admin.galleryEditor(await getGallery(c.env,true));
 else if(section==='enquiries'){
  const status=['new','contacted','enrolled','closed'].includes(c.req.query('status')||'')?c.req.query('status')!:'';
  const page=Math.min(10000,Math.max(1,Number.parseInt(c.req.query('page')||'1')||1));
  const rows=(await c.env.DB.prepare(`SELECT e.*,c.title AS course_title,m.status AS mail_status,m.attempts,m.last_error FROM enquiries e LEFT JOIN courses c ON c.id=e.course_id LEFT JOIN mail_outbox m ON m.enquiry_id=e.id ${status?'WHERE e.status=?':''} ORDER BY e.created_at DESC,e.id DESC LIMIT 21 OFFSET ?`).bind(...(status?[status]:[]),(page-1)*20).all<Enquiry>()).results;
  body=admin.enquiries(rows.slice(0,20),status,page,rows.length>20);
 }else if(section==='activity')body=admin.activity((await c.env.DB.prepare('SELECT actor,action,record_id,created_at FROM audit_log ORDER BY id DESC LIMIT 100').all<{actor:string;action:string;record_id:string;created_at:string}>()).results);
 else return c.notFound();
 return c.html(views.layout('Academy workspace','Private academy management',admin.adminShell('/admin/'+section,c.get('actor'),body),data,c.req.path,c.env.SITE_URL,c.get('nonce'),{admin:true}));
});
app.get('/admin/courses/:id',async c=>{
 const id=c.req.param('id');const course=id==='new'?undefined:await c.env.DB.prepare('SELECT * FROM courses WHERE id=?').bind(id).first<Course>();
 if(id!=='new'&&!course)return c.notFound();const {data}=await getSettings(c.env);
 return c.html(views.layout('Edit class','Private academy management',admin.adminShell('/admin/courses',c.get('actor'),admin.courseEditor(course||undefined)),data,c.req.path,c.env.SITE_URL,c.get('nonce'),{admin:true}));
});
app.get('/assets/*',c=>c.env.ASSETS.fetch(c.req.raw));
app.get('/favicon.svg',c=>c.env.ASSETS.fetch(c.req.raw));
app.notFound(async c=>{c.header('X-Robots-Tag','noindex, follow');if(c.req.path.startsWith('/api/'))return c.json({error:'Not found'},404);const {defaults}=await import('./defaults');return c.html(views.layout('Page not found','Find your way back to Watson Twin Academy.',html`<section class="page-heading"><span class="eyebrow">404 · A LITTLE OFF BEAT</span><h1>Let’s find your way back.</h1><p>This page isn’t here. There’s plenty more to discover.</p><a class="button" href="/classes">Explore our classes ↗</a></section>`,defaults,c.req.path,publicOrigin(c.env),c.get('nonce'),{noindex:true}),404)});
app.onError((err,c)=>{console.error('Request failed',err.name);if(err instanceof SyntaxError)return c.json({error:'Invalid request format.'},400);return c.json({error:'Something went wrong. Please try again shortly.'},500)});
export default app;
