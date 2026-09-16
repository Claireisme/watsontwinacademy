import {html,raw} from 'hono/html';
import {getSettings} from './data';
import type {Env,Course,Settings} from './types';
export interface SeoEntry {key:string;title:string;description:string;image:string;noindex:number;version:number;updated_at:string}
export interface SeoTarget {key:string;path:string;label:string;title:string;description:string;image:string;published:boolean;updated_at?:string}
export const staticSeo:Record<string,{title:string;description:string}>={
 '/':{title:'Irish Dance Classes in Templeogue, Dublin',description:'Discover Irish dance with Clare and Lisa Watson in Templeogue, South Dublin. Explore our classes, meet the teachers and enquire about joining the academy.'},
 '/classes':{title:'Irish Dance & Performing Arts Classes in Dublin',description:'Explore Irish dance, lyrical, acro, jazz and performing arts at Watson Twin Academy and WTA Dance Studios in Templeogue, South Dublin.'},
 '/timetable':{title:'Dance Class Timetable & Fees in Templeogue',description:'Find class schedules, age groups and fees at Watson Twin Academy. Contact Clare and Lisa for current availability at our Templeogue studios.'},
 '/about':{title:'Meet Clare & Lisa Watson | Irish Dance Teachers',description:'Meet the qualified teachers behind Watson Twin Academy. Discover Clare and Lisa’s story and their purpose-built dance studios in Templeogue, Dublin.'},
 '/gallery':{title:'Irish Dance Gallery & Academy Life',description:'Explore photos from Watson Twin Academy: our dancers, teachers and studio community in Templeogue, South Dublin.'},
 '/enrolment':{title:'Enquire About Dance Classes in Templeogue',description:'Start your dance journey with Watson Twin Academy. Send a class enquiry and Clare or Lisa will help you find the right group for your dancer.'},
 '/contact':{title:'Contact Watson Twin Academy in Templeogue',description:'Contact Clare and Lisa Watson about dance classes and performances. Find our studios at Spawell Complex, Templeogue, Dublin, D6W PY06.'},
 '/privacy':{title:'Privacy Notice',description:'Read how Watson Twin Academy handles website enquiries, contact information and requests about your personal data.'}
};
export function publicOrigin(env:Env){
 const candidate=env.PUBLIC_SITE_URL||(env.ENVIRONMENT==='production'?env.SITE_URL:'https://watsontwinacademy.ie');
 try{const u=new URL(candidate);if(u.protocol==='https:'&&!u.username&&!u.password)return u.origin}catch{}
 return 'https://watsontwinacademy.ie';
}
export function isPublicProduction(env:Env,url:string){return env.ENVIRONMENT==='production'&&new URL(url).origin===publicOrigin(env)}
export async function seoEntry(env:Env,key:string){return env.DB.prepare('SELECT * FROM seo_entries WHERE key=?').bind(key).first<SeoEntry>()}
export function targetForCourse(c:Course):SeoTarget{return {key:`course:${c.id}`,path:`/classes/${c.slug}`,label:c.title,title:c.title,description:c.summary,image:c.image,published:!!c.published,updated_at:c.updated_at}}
export async function seoTargets(env:Env):Promise<SeoTarget[]>{
 const rows=await env.DB.prepare('SELECT * FROM courses ORDER BY sort_order,title').all<Course>();
 const {data}=await getSettings(env);
 return [...Object.entries(staticSeo).map(([path,v])=>({key:path,path,label:path==='/'?'Home':path.slice(1),...v,image:data.hero_image,published:true})),...rows.results.map(targetForCourse)];
}
export function resolveSeo(target:SeoTarget,entry:SeoEntry|null){return {title:entry?.title||target.title,description:entry?.description||target.description,image:entry?.image||target.image,noindex:!!entry?.noindex}}
export function jsonLd(data:unknown,nonce:string){return html`<script type="application/ld+json" nonce="${nonce}">${raw(JSON.stringify(data).replace(/</g,'\\u003c'))}</script>`}
export function structuredData(env:Env,s:Settings,path:string,title:string,description:string,course?:Course){
 const origin=publicOrigin(env),org=origin+'/#academy';
 const graph:any[]=[{'@type':'EducationalOrganization','@id':org,name:'Watson Twin Academy',url:origin+'/',email:s.email,telephone:s.phone_clare,address:{'@type':'PostalAddress',streetAddress:s.address,addressCountry:'IE'},image:origin+s.hero_image,sameAs:['https://www.facebook.com/watsontwinacademy','https://www.instagram.com/watsontwinacademy']},
 {'@type':'WebSite','@id':origin+'/#website',name:'Watson Twin Academy',url:origin+'/',publisher:{'@id':org},inLanguage:'en-IE'},
 {'@type':path==='/about'?'AboutPage':path==='/contact'?'ContactPage':'WebPage','@id':origin+path+'#webpage',url:origin+path,name:title,description,inLanguage:'en-IE',isPartOf:{'@id':origin+'/#website'},about:{'@id':org}}];
 if(path!=='/'){
 const crumbs=[{name:'Home',url:origin+'/'}];if(course)crumbs.push({name:'Classes',url:origin+'/classes'});crumbs.push({name:course?.title||title,url:origin+path});
 graph.push({'@type':'BreadcrumbList',itemListElement:crumbs.map((c,i)=>({'@type':'ListItem',position:i+1,name:c.name,item:c.url}))});
 }
 if(course)graph.push({'@type':'Course','@id':origin+path+'#course',name:course.title,description:course.description,provider:{'@id':org},url:origin+path,image:origin+course.image,inLanguage:'en'});
 return {'@context':'https://schema.org','@graph':graph};
}
const escapeXml=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
export async function sitemap(env:Env){
 const [targets,seo,pages,settings]=await Promise.all([seoTargets(env),env.DB.prepare('SELECT * FROM seo_entries').all<SeoEntry>(),env.DB.prepare('SELECT path,published_at FROM page_content').all<{path:string;published_at:string|null}>(),env.DB.prepare('SELECT updated_at FROM settings WHERE id=1').first<{updated_at:string}>()]);
 const rows=targets.filter(t=>t.published&&!seo.results.find(s=>s.key===t.key)?.noindex).map(t=>{
 const dates=[settings?.updated_at,t.updated_at,seo.results.find(s=>s.key===t.key)?.updated_at,pages.results.find(p=>p.path===t.path)?.published_at].filter(Boolean) as string[];
 const latest=dates.sort().at(-1);const lastmod=latest?new Date(latest.replace(' ','T')+'Z'):null;
 return `<url><loc>${escapeXml(publicOrigin(env)+t.path)}</loc>${lastmod&&!isNaN(+lastmod)?`<lastmod>${lastmod.toISOString()}</lastmod>`:''}</url>`;
 });
 return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.join('')}</urlset>`;
}
