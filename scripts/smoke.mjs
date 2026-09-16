import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const origin='http://localhost:8788';
const local=readFileSync('.dev.vars','utf8');
assert.match(local,/^ENVIRONMENT=local$/m,'Smoke tests require local environment');
assert.ok(!/^RESEND_API_KEY=\S+/m.test(local),'Refusing to run smoke tests with a real email key');
const token=local.match(/^LOCAL_ADMIN_TOKEN=(.+)$/m)?.[1]?.trim();assert.ok(token&&token.length>=32);
let cookie='';let checks=0;
async function call(path,method='GET',data,admin=false){const headers={Origin:origin};if(admin)headers.Cookie=cookie;if(!(data instanceof FormData))headers['Content-Type']='application/json';return fetch(origin+path,{method,headers,body:data===undefined?undefined:data instanceof FormData?data:JSON.stringify(data)})}
const login=await call('/api/local-login','POST',{token});assert.equal(login.status,200,'Local login');cookie=login.headers.get('set-cookie').split(';')[0];checks++;
for(const path of ['/','/classes','/classes/irish-dance','/about','/gallery','/contact','/enrolment','/timetable','/privacy','/robots.txt','/sitemap.xml','/assets/app.js','/assets/styles.css','/admin','/admin/courses','/admin/courses/new','/admin/courses/irish-dance','/admin/content','/admin/gallery','/admin/enquiries','/admin/activity']){
 const response=await call(path,'GET',undefined,path.startsWith('/admin'));assert.equal(response.status,200,path);checks++;
}
assert.equal((await call('/admin')).status,401);checks++;
assert.equal((await call('/api/admin/settings','PUT',{})).status,401);checks++;
const denied=await fetch(origin+'/api/admin/settings',{method:'PUT',headers:{Origin:'https://invalid.example',Cookie:cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);checks++;
assert.equal((await call('/does-not-exist')).status,404);checks++;
const payload={id:crypto.randomUUID(),parent_name:'Local integration test',email:'local-test@example.com',phone:'',age_group:'5–7',course_id:'irish-dance',message:'Local verification only. Remove after testing.',consent:true,website:'',turnstile:'XXXX.DUMMY.TOKEN.XXXX'};
let saved=false;
try{
 const submitted=await call('/api/enquiries','POST',payload);const result=await submitted.json();assert.equal(submitted.status,201,JSON.stringify(result));saved=true;checks++;
 const duplicate=await call('/api/enquiries','POST',payload);assert.equal(duplicate.status,200);checks++;
 const updated=await call('/api/admin/enquiries/'+payload.id,'PATCH',{status:'contacted'},true);assert.equal(updated.status,200);checks++;
 const page=await(await call('/admin/enquiries','GET',undefined,true)).text();assert.ok(page.includes(payload.id));checks++;
 const retry=await call('/api/admin/enquiries/'+payload.id+'/retry','POST',{},true);assert.equal(retry.status,409);checks++;
}finally{if(saved){const removed=await call('/api/admin/enquiries/'+payload.id,'DELETE',undefined,true);assert.equal(removed.status,200,'Remove test enquiry');checks++}}
// Reject an SVG upload, even when its filename claims it is JPEG.
const bad=new FormData();bad.append('file',new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],'fake.jpg',{type:'image/jpeg'}));
assert.equal((await call('/api/admin/media','POST',bad,true)).status,400);checks++;
const upload=new FormData();const image=readFileSync('public/assets/irish-dance.jpg');upload.append('file',new File([image],'test.jpg',{type:'image/jpeg'}));
const uploaded=await call('/api/admin/media','POST',upload,true);assert.equal(uploaded.status,201);const {path:mediaPath}=await uploaded.json();checks++;
try{const media=await call(mediaPath);assert.equal(media.status,200);assert.equal(media.headers.get('content-type'),'image/jpeg');assert.equal((await media.arrayBuffer()).byteLength,image.byteLength);checks++}
finally{execFileSync('./node_modules/.bin/wrangler',['r2','object','delete','wta-media/'+mediaPath.split('/').pop(),'--local'],{stdio:'pipe'})}
console.log(`Passed ${checks} Cloudflare-local HTTP checks; test enquiry removed; no real email sent.`);
