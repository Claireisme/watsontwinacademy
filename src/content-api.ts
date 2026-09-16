import {Hono} from 'hono';
import {z} from 'zod';
import type {AppEnv} from './types';
import {pageDefaults} from './content';
import {seoTargets} from './seo';
import {imagePath} from './validation';
const cms=new Hono<AppEnv>();
const copySchema=z.object({eyebrow:z.string().trim().max(120),title:z.string().trim().min(2).max(160),intro:z.string().trim().max(1000),body:z.string().trim().max(10000),version:z.number().int().nonnegative(),action:z.enum(['draft','publish'])});
const seoSchema=z.object({key:z.string().max(160),title:z.string().trim().max(100),description:z.string().trim().max(320),image:z.union([z.literal(''),imagePath]),noindex:z.number().int().min(0).max(1),version:z.number().int().nonnegative()});
cms.put('/admin/pages/:slug',async c=>{
 const path='/'+c.req.param('slug');if(!Object.hasOwn(pageDefaults,path))return c.json({error:'Page not found'},404);
 const p=copySchema.safeParse(await c.req.json());if(!p.success)return c.json({error:p.error.issues[0].message},400);
 const {version,action,...copy}=p.data,data=JSON.stringify(copy),publish=action==='publish';
 const result=version===0
  ?await c.env.DB.prepare('INSERT OR IGNORE INTO page_content(path,draft_data,published_data,published_at) VALUES(?,?,?,?)').bind(path,data,publish?data:null,publish?new Date().toISOString().slice(0,19).replace('T',' '):null).run()
  :await c.env.DB.prepare('UPDATE page_content SET draft_data=?,published_data=CASE WHEN ? THEN ? ELSE published_data END,published_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE published_at END,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE path=? AND version=?').bind(data,publish?1:0,data,publish?1:0,path,version).run();
 if(!result.meta.changes)return c.json({error:'This page was changed by another editor. Reload before saving.'},409);
 await c.env.DB.prepare('INSERT INTO audit_log(actor,action,record_id) VALUES(?,?,?)').bind(c.get('actor'),`page.${action}`,path).run();return c.json({ok:true});
});
cms.put('/admin/seo',async c=>{
 const p=seoSchema.safeParse(await c.req.json());if(!p.success)return c.json({error:p.error.issues[0].message},400);
 const d=p.data;if(!(await seoTargets(c.env)).some(t=>t.key===d.key))return c.json({error:'Page not found'},404);
 const result=d.version===0
  ?await c.env.DB.prepare('INSERT OR IGNORE INTO seo_entries(key,title,description,image,noindex) VALUES(?,?,?,?,?)').bind(d.key,d.title,d.description,d.image,d.noindex).run()
  :await c.env.DB.prepare('UPDATE seo_entries SET title=?,description=?,image=?,noindex=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE key=? AND version=?').bind(d.title,d.description,d.image,d.noindex,d.key,d.version).run();
 if(!result.meta.changes)return c.json({error:'SEO settings changed in another session. Reload before saving.'},409);
 await c.env.DB.prepare('INSERT INTO audit_log(actor,action,record_id) VALUES(?,?,?)').bind(c.get('actor'),'seo.update',d.key).run();return c.json({ok:true});
});
export default cms;
