import type { Env,Enquiry } from './types';
export async function sendEnquiry(env:Env,id:string):Promise<boolean>{
 const now=Date.now();
 const claimed=await env.DB.prepare("UPDATE mail_outbox SET status='sending',locked_at=?,attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE enquiry_id=? AND (status IN ('pending','failed') OR (status='sending' AND locked_at<?)) RETURNING enquiry_id").bind(now,id,now-120000).first();
 if(!claimed)return false;
 try{
  if(!env.RESEND_API_KEY||!env.MAIL_FROM||!env.NOTIFICATION_EMAIL)throw new Error('Email service is not configured');
  const row=await env.DB.prepare('SELECT e.*, c.title AS course_title FROM enquiries e LEFT JOIN courses c ON c.id=e.course_id WHERE e.id=?').bind(id).first<Enquiry>();
  if(!row)throw new Error('Enquiry no longer exists');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`wta-enquiry-${id}`},body:JSON.stringify({from:env.MAIL_FROM,to:[env.NOTIFICATION_EMAIL],reply_to:row.email,subject:`New dance enquiry — ${row.course_title||'Help choosing a class'}`,text:`New Watson Twin Academy enquiry\n\nParent / guardian: ${row.parent_name}\nEmail: ${row.email}\nPhone: ${row.phone||'Not provided'}\nAge group: ${row.age_group||'Not provided'}\nClass: ${row.course_title||'Help choosing a class'}\n\nMessage:\n${row.message||'No additional message'}\n\nReference: ${id}\nReceived: ${row.created_at}\n\nManage enquiries: ${env.SITE_URL}/admin/enquiries`}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`Email provider returned ${response.status}`);
  const data=await response.json() as {id?:string};
  if(!data.id)throw new Error('Email provider did not confirm acceptance');
  await env.DB.prepare("UPDATE mail_outbox SET status='sent',provider_id=?,last_error=NULL,locked_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE enquiry_id=?").bind(data.id,id).run();return true;
 }catch(e){
  await env.DB.prepare("UPDATE mail_outbox SET status='failed',last_error=?,locked_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE enquiry_id=?").bind(e instanceof Error?e.message:'Email service unavailable',id).run();return false;
 }
}
