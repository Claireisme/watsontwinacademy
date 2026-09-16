import { newReference } from './reference';
import { Hono, type Context } from 'hono';
import { setCookie,deleteCookie } from 'hono/cookie';
import type { AppEnv } from './types';
import { enquirySchema,settingsSchema,courseSchema,gallerySchema,statusSchema } from './validation';
import { isLocal,rateLimit,verifyTurnstile } from './security';
import { sendEnquiry } from './mail';
const api=new Hono<AppEnv>();
const audit=async(c:Context<AppEnv>,action:string,id:string)=>c.env.DB.prepare('INSERT INTO audit_log(actor,action,record_id) VALUES(?,?,?)').bind(c.get('actor'),action,id).run();
api.post('/local-login',async c=>{
 if(!isLocal(c.env,c.req.url)||!c.env.LOCAL_ADMIN_TOKEN||c.env.LOCAL_ADMIN_TOKEN.length<32)return c.json({error:'Not available'},404);
 if(!await rateLimit(c.env,c.req.header('CF-Connecting-IP')||'local','login',8))return c.json({error:'Please try again later'},429);
 const {token}=await c.req.json();
 if(token!==c.env.LOCAL_ADMIN_TOKEN)return c.json({error:'Incorrect local token'},401);
 setCookie(c,'wta_local',token,{httpOnly:true,sameSite:'Strict',path:'/',maxAge:28800});return c.json({ok:true});
});
api.post('/logout',c=>{deleteCookie(c,'wta_local',{path:'/'});return c.json({ok:true,redirect:isLocal(c.env,c.req.url)?'/admin':'/cdn-cgi/access/logout'})});
api.post('/enquiries',async c=>{
 const parsed=enquirySchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Please check the form fields and try again.'},400);
 const d=parsed.data;if(d.website)return c.json({ok:true,id:d.id});
 const ip=c.req.header('CF-Connecting-IP')||'local';
 if(!await rateLimit(c.env,ip,'enquiry',8))return c.json({error:'Too many enquiries. Please wait a few minutes or contact us by phone.'},429);
 if(!await verifyTurnstile(c.env,d.turnstile,ip,new URL(c.req.url).hostname))return c.json({error:'Please complete the security check and try again.'},400);
 if(d.course_id&&!await c.env.DB.prepare('SELECT id FROM courses WHERE id=? AND published=1').bind(d.course_id).first())return c.json({error:'Please choose a currently available class.'},400);
 const existing=await c.env.DB.prepare('SELECT id,reference FROM enquiries WHERE id=?').bind(d.id).first<{id:string;reference:string|null}>();
 if(existing)return c.json({ok:true,id:d.id,reference:existing.reference||existing.id});
 for(let attempt=0;attempt<12;attempt++){
  const reference=newReference();
  try{
   await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO enquiries(id,parent_name,email,phone,age_group,course_id,message,consent_version,reference) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(d.id,d.parent_name,d.email.toLowerCase(),d.phone,d.age_group,d.course_id||null,d.message,'2026-09-v1',reference),
    c.env.DB.prepare('INSERT OR IGNORE INTO mail_outbox(enquiry_id) VALUES(?)').bind(d.id)
   ]);
  }catch(e){
   if(String(e).includes('UNIQUE constraint failed: enquiries.reference'))continue;
   throw e;
  }
  const saved=await c.env.DB.prepare('SELECT reference FROM enquiries WHERE id=?').bind(d.id).first<{reference:string|null}>();
  c.executionCtx.waitUntil(sendEnquiry(c.env,d.id));
  return c.json({ok:true,id:d.id,reference:saved?.reference||d.id},201);
 }
 return c.json({error:'Please try submitting again.'},503);
});
api.put('/admin/settings',async c=>{
 const parsed=settingsSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:parsed.error.issues[0].message},400);
 const {version,...data}=parsed.data;
 const r=await c.env.DB.prepare('UPDATE settings SET data=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND version=?').bind(JSON.stringify(data),version).run();
 if(!r.meta.changes)return c.json({error:'Another administrator updated this content. Reload before saving.'},409);
 await audit(c,'settings.update','1');return c.json({ok:true});
});
api.post('/admin/courses',async c=>{
 const parsed=courseSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:parsed.error.issues[0].message},400);
 const d=parsed.data,id=crypto.randomUUID();
 if(await c.env.DB.prepare('SELECT id FROM courses WHERE slug=? UNION SELECT course_id FROM course_redirects WHERE slug=?').bind(d.slug,d.slug).first())return c.json({error:'That page address is already in use.'},409);
 await c.env.DB.prepare('INSERT INTO courses(id,slug,title,category,summary,description,ages,schedule,price,image,published,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.slug,d.title,d.category,d.summary,d.description,d.ages,d.schedule,d.price,d.image,d.published,d.sort_order).run();
 await audit(c,'course.create',id);return c.json({ok:true,id},201);
});
api.put('/admin/courses/:id',async c=>{
 const parsed=courseSchema.safeParse(await c.req.json());if(!parsed.success)return c.json({error:parsed.error.issues[0].message},400);
 const d=parsed.data,id=c.req.param('id');
 if(await c.env.DB.prepare('SELECT id FROM courses WHERE slug=? AND id<>? UNION SELECT course_id FROM course_redirects WHERE slug=? AND course_id<>?').bind(d.slug,id,d.slug,id).first())return c.json({error:'That page address is already in use.'},409);
 const r=await c.env.DB.prepare('UPDATE courses SET slug=?,title=?,category=?,summary=?,description=?,ages=?,schedule=?,price=?,image=?,published=?,sort_order=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?').bind(d.slug,d.title,d.category,d.summary,d.description,d.ages,d.schedule,d.price,d.image,d.published,d.sort_order,id,d.version).run();
 if(!r.meta.changes)return c.json({error:'This course has changed. Reload before saving.'},409);
 await audit(c,'course.update',id);return c.json({ok:true});
});
api.post('/admin/gallery',async c=>{
 const p=gallerySchema.safeParse(await c.req.json());if(!p.success)return c.json({error:p.error.issues[0].message},400);
 const d=p.data,id=crypto.randomUUID();await c.env.DB.prepare('INSERT INTO gallery(id,image,alt,category,published,sort_order) VALUES(?,?,?,?,?,?)').bind(id,d.image,d.alt,d.category,d.published,d.sort_order).run();await audit(c,'gallery.create',id);return c.json({ok:true},201);
});
api.put('/admin/gallery/:id',async c=>{
 const p=gallerySchema.safeParse(await c.req.json());if(!p.success)return c.json({error:p.error.issues[0].message},400);
 const d=p.data,id=c.req.param('id');const r=await c.env.DB.prepare('UPDATE gallery SET image=?,alt=?,category=?,published=?,sort_order=? WHERE id=?').bind(d.image,d.alt,d.category,d.published,d.sort_order,id).run();if(!r.meta.changes)return c.json({error:'Image not found'},404);await audit(c,'gallery.update',id);return c.json({ok:true});
});
api.delete('/admin/gallery/:id',async c=>{const id=c.req.param('id');await c.env.DB.prepare('DELETE FROM gallery WHERE id=?').bind(id).run();await audit(c,'gallery.delete',id);return c.json({ok:true})});
api.patch('/admin/enquiries/:id',async c=>{
 const p=statusSchema.safeParse((await c.req.json()).status);if(!p.success)return c.json({error:'Invalid status'},400);
 const id=c.req.param('id');const r=await c.env.DB.prepare('UPDATE enquiries SET status=? WHERE id=?').bind(p.data,id).run();if(!r.meta.changes)return c.json({error:'Enquiry not found'},404);await audit(c,'enquiry.status',id);return c.json({ok:true});
});
api.delete('/admin/enquiries/:id',async c=>{
 const id=c.req.param('id');const outbox=await c.env.DB.prepare('SELECT status,locked_at FROM mail_outbox WHERE enquiry_id=?').bind(id).first<{status:string;locked_at:number}>();
 if(outbox?.status==='sending'&&outbox.locked_at>Date.now()-120000)return c.json({error:'A notification is being sent. Please try again shortly.'},409);
 await c.env.DB.prepare('DELETE FROM enquiries WHERE id=?').bind(id).run();await audit(c,'enquiry.delete',id);return c.json({ok:true});
});
api.post('/admin/enquiries/:id/retry',async c=>{const id=c.req.param('id');await audit(c,'mail.retry',id);const ok=await sendEnquiry(c.env,id);return c.json(ok?{ok:true}:{error:'Not sent. Check the email status and service configuration.'},ok?200:409)});
api.post('/admin/media',async c=>{
 const form=await c.req.formData(),file=form.get('file');
 if(!(file instanceof File)||file.size>5*1024*1024||file.size<12)return c.json({error:'Choose a JPEG, PNG or WebP image under 5 MB.'},400);
 const bytes=new Uint8Array(await file.arrayBuffer());let ext='',type='';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){ext='jpg';type='image/jpeg'}
 else if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)){ext='png';type='image/png'}
 else if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'){ext='webp';type='image/webp'}
 else return c.json({error:'Only valid JPEG, PNG and WebP images are supported.'},400);
 const key=`${crypto.randomUUID()}.${ext}`;await c.env.MEDIA.put(key,bytes,{httpMetadata:{contentType:type,cacheControl:'public, max-age=31536000, immutable'}});await audit(c,'media.upload',key);return c.json({ok:true,path:`/media/${key}`},201);
});
export default api;
