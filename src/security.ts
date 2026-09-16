import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Context } from 'hono';
import type { AppEnv, Env } from './types';
const jwksCache=new Map<string,ReturnType<typeof createRemoteJWKSet>>();
export function localPreviewOrigin(env:Env) {
 try {
  const url=new URL(env.LOCAL_PREVIEW_ORIGIN||'');
  return /^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname) && ['http:','https:'].includes(url.protocol) ? url.origin : null;
 } catch { return null }
}
export function isLocal(env:Env,url:string) {
 const request=new URL(url);
 return env.ENVIRONMENT==='local' && (['localhost','127.0.0.1','[::1]'].includes(request.hostname)||request.origin===localPreviewOrigin(env));
}
export async function authenticate(c:Context<AppEnv>):Promise<string|null> {
 if(isLocal(c.env,c.req.url)&&c.env.LOCAL_ADMIN_TOKEN&&c.env.LOCAL_ADMIN_TOKEN.length>=32){
  const cookie=c.req.header('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('wta_local='))?.slice(10);
  if(cookie&&cookie===c.env.LOCAL_ADMIN_TOKEN)return 'local-developer';
 }
 const team=c.env.ACCESS_TEAM_DOMAIN;
 if(!team||!c.env.ACCESS_AUD||!c.env.ADMIN_EMAILS||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team))return null;
 const token=c.req.header('Cf-Access-Jwt-Assertion');if(!token)return null;
 try{
  let keys=jwksCache.get(team);if(!keys){keys=createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));jwksCache.set(team,keys)}
  const {payload}=await jwtVerify(token,keys,{issuer:team,audience:c.env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub']});
  const email=typeof payload.email==='string'?payload.email.toLowerCase():'';
  return c.env.ADMIN_EMAILS.split(',').map(s=>s.trim().toLowerCase()).includes(email)&&email ? email : null;
 }catch{return null}
}
export function sameOrigin(req:Request){return req.headers.get('origin')===new URL(req.url).origin}
export async function rateLimit(env:Env,ip:string,scope:string,limit:number){
 const now=Date.now(),window=Math.floor(now/600000);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${scope}:${ip}:${window}`));
 const key=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 const row=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+600000).first<{count:number}>();
 await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now).run();
 return (row?.count??limit+1)<=limit;
}
export async function verifyTurnstile(env:Env,token:string,ip:string,hostname:string){
 if(!env.TURNSTILE_SECRET_KEY)return false;
 try{
 const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:ip}),signal:AbortSignal.timeout(8000)});
 const data=await r.json() as {success:boolean;hostname?:string};
 const preview=localPreviewOrigin(env);
 const localHost=env.ENVIRONMENT==='local'&&(['localhost','127.0.0.1','[::1]'].includes(hostname)||(preview!==null&&new URL(preview).hostname===hostname));
 return data.success && (localHost||data.hostname===hostname);
 }catch{return false}
}
