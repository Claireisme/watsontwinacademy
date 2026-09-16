import {readFileSync} from 'node:fs';
const config=readFileSync('wrangler.toml','utf8');
if(config.includes('00000000-0000-0000-0000-000000000000'))throw new Error('Configure the real D1 database_id in wrangler.toml before deployment. See docs/DEPLOYMENT.md.');
if(!/ENVIRONMENT\s*=\s*"production"/.test(config))throw new Error('Production deployment requires ENVIRONMENT="production".');
console.log('Deployment configuration checked. Runtime secrets and Access policies must be configured in Cloudflare.');
