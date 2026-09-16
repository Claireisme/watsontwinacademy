import type { Env, Settings, Course, GalleryItem } from './types';
import { defaults } from './defaults';
export async function getSettings(env: Env): Promise<{ data: Settings; version: number }> {
 const row = await env.DB.prepare('SELECT data, version FROM settings WHERE id=1').first<{data:string;version:number}>();
 return row ? { data: { ...defaults, ...JSON.parse(row.data) }, version: row.version } : { data: defaults, version: 0 };
}
export async function getCourses(env: Env, admin=false) {
 return (await env.DB.prepare(`SELECT * FROM courses ${admin ? '' : 'WHERE published=1'} ORDER BY sort_order,title`).all<Course>()).results;
}
export async function getGallery(env: Env, admin=false) {
 return (await env.DB.prepare(`SELECT * FROM gallery ${admin ? '' : 'WHERE published=1'} ORDER BY sort_order,id`).all<GalleryItem>()).results;
}
