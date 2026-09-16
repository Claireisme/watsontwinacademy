import { build } from 'esbuild';
import { mkdir, cp, writeFile,rename,readFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
const version=createHash('sha256').update(await readFile('public/assets/styles.css')).update(await readFile('src/client.ts')).digest('hex').slice(0,12);
await mkdir('dist/assets', { recursive: true });
await cp('public', 'dist', { recursive: true });
await Promise.all([
  build({entryPoints:['src/worker.ts'],outfile:'dist/_worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,define:{__ASSET_VERSION__:JSON.stringify(version)}}),
  build({entryPoints:['src/client.ts'],outfile:'dist/assets/app.js',bundle:true,format:'esm',target:'es2022',minify:true}),
]);
await cp('public/assets/styles.css',`dist/assets/styles.${version}.css`);
await cp('dist/assets/app.js',`dist/assets/app.${version}.js`);
await writeFile('dist/.routes.tmp', JSON.stringify({version:1,include:['/*'],exclude:['/assets/*','/favicon.svg']}));
await rename('dist/.routes.tmp','dist/_routes.json');
console.log('Cloudflare Pages build ready: dist');
