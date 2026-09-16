import { readFile, writeFile } from 'node:fs/promises';
// Generate a reviewed, repeat-safe seed migration from the shared source data.
import { build } from 'esbuild';
await build({entryPoints:['src/defaults.ts'],outfile:'.wrangler/seed-data.mjs',bundle:true,format:'esm',platform:'node'});
const {defaults,seedCourses} = await import('../.wrangler/seed-data.mjs');
const q = s => "'"+String(s).replaceAll("'","''")+"'";
let sql = `INSERT OR IGNORE INTO settings(id,data) VALUES(1,${q(JSON.stringify(defaults))});\n`;
seedCourses.forEach((c,i)=> {sql+=`INSERT OR IGNORE INTO courses(id,slug,title,category,summary,description,image,published,sort_order) VALUES(${[c.id,c.slug,c.title,c.category,c.summary,c.description,c.image].map(q).join(',')},1,${i});\n`});
for(const [id,image,alt,order] of [['academy','/assets/irish-dance.jpg','Irish dancers from Watson Twin Academy',0],['teachers','/assets/teachers.jpg','Clare and Lisa Watson',1],['studio','/assets/studio.jpg','Watson Twin Academy studio',2]]) sql+=`INSERT OR IGNORE INTO gallery(id,image,alt,sort_order) VALUES(${q(id)},${q(image)},${q(alt)},${order});\n`;
await writeFile('migrations/0002_seed.sql',sql);
