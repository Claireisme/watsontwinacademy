import type {Env} from './types';
export interface PageCopy {eyebrow:string;title:string;intro:string;body:string}
export interface PageRecord {path:string;draft_data:string;published_data:string|null;version:number;updated_at:string;published_at:string|null}
export const pageDefaults:Record<string,PageCopy>={
 '/classes':{eyebrow:'FIND YOUR RHYTHM',title:'A class to call your own.',intro:'Irish dance at our heart. A world of movement to explore. Discover our academy and the wider WTA Dance Studios programme.',body:''},
 '/timetable':{eyebrow:'MAKE ROOM FOR DANCE',title:'Timetable & fees',intro:'Explore current class information. Where details are not yet listed, Clare and Lisa can help you find a suitable group.',body:''},
 '/about':{eyebrow:'TWO SISTERS. ONE SHARED PASSION.',title:'A family story. A dance family.',intro:'Meet Clare and Lisa, the twins behind Watson Twin Academy.',body:''},
 '/gallery':{eyebrow:'LIFE AT THE ACADEMY',title:'A few of our favourite moments.',intro:'The people, places and shared love of dance that make WTA a community.',body:''},
 '/enrolment':{eyebrow:'LET’S START SOMETHING LOVELY',title:'Your dance journey starts here.',intro:'Tell us a little about your dancer and we’ll help you find their place. No commitment, just a conversation.',body:''},
 '/contact':{eyebrow:'WE’D LOVE TO HEAR FROM YOU',title:'Let’s talk dance.',intro:'Questions about classes, joining the academy or a special performance? Get in touch with Clare and Lisa.',body:''},
 '/privacy':{eyebrow:'YOUR INFORMATION',title:'Privacy notice',intro:'How we use the information you share with the academy.',body:''}
};
export async function pageRecord(env:Env,path:string){return env.DB.prepare('SELECT * FROM page_content WHERE path=?').bind(path).first<PageRecord>()}
export async function publishedCopy(env:Env,path:string){const r=await pageRecord(env,path);return r?.published_data?JSON.parse(r.published_data) as PageCopy:pageDefaults[path]}
