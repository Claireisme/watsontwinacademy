export {};
const menu=document.querySelector<HTMLButtonElement>('.menu-toggle');
menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));document.querySelector('#navigation')?.classList.toggle('is-open',open)});
declare global {interface Window {turnstile?:{reset:()=>void}}}
let toastTimer:ReturnType<typeof setTimeout>;
function toast(message:string){const el=document.querySelector('#toast');if(el){el.textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.textContent='',6000)}}
async function request(url:string,method:string,data?:unknown){
 const response=await fetch(url,{method,headers:data instanceof FormData?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:data instanceof FormData?data:JSON.stringify(data)});
 let result;try{result=await response.json() as {error?:string;path?:string;id?:string;redirect?:string}}catch{throw new Error('Could not read the response. Please reload and try again.')}
 if(!response.ok)throw new Error(result.error||'Something went wrong. Please try again.');return result;
}
function busy(form:HTMLFormElement,value:boolean){form.querySelectorAll<HTMLButtonElement>('button[type="submit"],button:not([type])').forEach(b=>b.disabled=value);form.setAttribute('aria-busy',String(value))}
function error(form:HTMLFormElement,e:unknown){const el=form.querySelector<HTMLElement>('.form-error');if(el){el.textContent=e instanceof Error?e.message:'Something went wrong. Please try again.';el.tabIndex=-1;el.focus()}}
document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
 document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button))});
 document.querySelectorAll<HTMLElement>('[data-category]').forEach(card=>card.hidden=button.dataset.filter!=='all'&&card.dataset.category!==button.dataset.filter);
}));
const enquiry=document.querySelector<HTMLFormElement>('#enquiry-form');
// randomUUID is unavailable on plain HTTP LAN origins; getRandomValues is supported.
function newEnquiryId(){
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const enquiryId=enquiry?newEnquiryId():'';
enquiry?.addEventListener('submit',async event=>{
 event.preventDefault();if(!enquiry.reportValidity())return;busy(enquiry,true);enquiry.querySelector('.form-error')!.textContent='';
 try{
  const d=new FormData(enquiry),payload={id:enquiryId,parent_name:d.get('parent_name'),email:d.get('email'),phone:d.get('phone'),age_group:d.get('age_group'),course_id:d.get('course_id'),message:d.get('message'),website:d.get('website'),consent:d.get('consent')==='on',turnstile:d.get('cf-turnstile-response')||''};
  if(!payload.turnstile)throw new Error('Please complete the security check before sending.');
  const result=await request('/api/enquiries','POST',payload);
  enquiry.hidden=true;const success=document.querySelector<HTMLElement>('#enquiry-success')!;success.hidden=false;document.querySelector('#enquiry-reference')!.textContent=result.id||enquiryId;success.focus();
 }catch(e){error(enquiry,e);window.turnstile?.reset()}finally{busy(enquiry,false)}
});
document.querySelectorAll<HTMLFormElement>('.editor-form').forEach(form=>form.addEventListener('submit',async event=>{
 event.preventDefault();if(!form.reportValidity())return;busy(form,true);form.querySelector('.form-error')!.textContent='';
 try{const d=Object.fromEntries(new FormData(form)) as Record<string,unknown>;for(const key of ['version','sort_order'])if(key in d)d[key]=Number(d[key]);if(form.querySelector('[name="noindex"]'))d.noindex=form.querySelector<HTMLInputElement>('[name="noindex"]')!.checked?1:0;if(form.dataset.pageEditor)d.action=(event as SubmitEvent).submitter?.getAttribute('value')||'draft';if(form.querySelector('[name="published"]'))d.published=(form.querySelector<HTMLInputElement>('[name="published"]')!.checked)?1:0;
 await request(form.dataset.endpoint!,form.dataset.method!,d);form.dataset.dirty='false';window.location.assign(form.dataset.success!);
 }catch(e){error(form,e);busy(form,false)}
}));
document.querySelectorAll<HTMLInputElement>('.image-upload').forEach(input=>input.addEventListener('change',async()=>{
 const file=input.files?.[0];if(!file)return;
 const form=input.closest('form')!;if(file.size>5*1024*1024){error(form,new Error('Please choose an image under 5 MB.'));input.value='';return}
 busy(form,true);input.disabled=true;toast('Uploading your photo…');
 try{const body=new FormData();body.append('file',file);const result=await request('/api/admin/media','POST',body);const editor=input.closest('.image-editor')!;editor.querySelector<HTMLInputElement>('input:not([type="file"])')!.value=result.path!;editor.querySelector<HTMLImageElement>('.image-preview')!.src=result.path!;form.dataset.dirty='true';toast('Photo uploaded. Save your changes to publish it.')}catch(e){error(form,e)}finally{busy(form,false);input.disabled=false;input.value=''}
}));
document.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(button=>button.addEventListener('click',async()=>{
 if(!window.confirm(button.dataset.confirm||'Delete this record?'))return;button.disabled=true;
 try{await request(button.dataset.delete!,'DELETE');window.location.reload()}catch(e){toast((e as Error).message);button.disabled=false}
}));
document.querySelectorAll<HTMLButtonElement>('[data-retry]').forEach(button=>button.addEventListener('click',async()=>{
 button.disabled=true;try{await request(`/api/admin/enquiries/${button.dataset.retry}/retry`,'POST',{});window.location.reload()}catch(e){toast((e as Error).message);button.disabled=false}
}));
document.querySelectorAll<HTMLFormElement>('.status-form').forEach(form=>form.addEventListener('submit',async e=>{
 e.preventDefault();busy(form,true);try{await request(`/api/admin/enquiries/${form.dataset.id}`,'PATCH',{status:new FormData(form).get('status')});window.location.reload()}catch(e){error(form,e);busy(form,false)}
}));
document.querySelector<HTMLFormElement>('#local-login')?.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget as HTMLFormElement;busy(form,true);try{await request('/api/local-login','POST',{token:new FormData(form).get('token')});window.location.assign('/admin')}catch(e){error(form,e);busy(form,false)}
});
document.querySelector('#logout')?.addEventListener('click',async()=>{try{const result=await request('/api/logout','POST',{});window.location.assign(result.redirect||'/admin')}catch(e){toast((e as Error).message)}});
const lightbox=document.querySelector<HTMLDialogElement>('#lightbox');
document.querySelectorAll<HTMLButtonElement>('.gallery-open').forEach(b=>b.addEventListener('click',()=>{if(!lightbox)return;const img=lightbox.querySelector('img')!;img.src=b.dataset.image!;img.alt=b.dataset.alt!;lightbox.querySelector('p')!.textContent=b.dataset.alt!;lightbox.showModal()}));
lightbox?.querySelector('button')?.addEventListener('click',()=>lightbox.close());
lightbox?.addEventListener('click',event=>{if(event.target===lightbox){const r=lightbox.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)lightbox.close()}});

// Protect unfinished content edits when navigating away.
document.querySelectorAll<HTMLFormElement>('.editor-form').forEach(form=>form.addEventListener('input',()=>{form.dataset.dirty='true'}));
window.addEventListener('beforeunload',event=>{if(document.querySelector('.editor-form[data-dirty="true"]')){event.preventDefault();event.returnValue=''}});
const seoTitle=document.querySelector<HTMLInputElement>('[data-seo-title]');
const seoDescription=document.querySelector<HTMLTextAreaElement>('[data-seo-description]');
seoTitle?.addEventListener('input',()=>{const out=document.querySelector<HTMLElement>('[data-preview-title]')!;out.textContent=(seoTitle.value||out.dataset.default)+' | Watson Twin Academy'});
seoDescription?.addEventListener('input',()=>{const out=document.querySelector<HTMLElement>('[data-preview-description]')!;out.textContent=seoDescription.value||out.dataset.default||''});
