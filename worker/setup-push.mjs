// One-time: creates the VAPID key pair for push notifications and stores both halves as Worker secrets.
import { execSync } from 'node:child_process';

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const pub = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');

const put = (name, value) => execSync(`npx wrangler secret put ${name}`, { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
put('VAPID_PRIVATE', JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }));
put('VAPID_PUBLIC', pub);
console.log('\nPush keys saved. Reminders are ready.');
