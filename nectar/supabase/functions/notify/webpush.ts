// Web Push with WebCrypto only: the message is encrypted for the browser
// (RFC 8291, aes128gcm) and signed for the push service (VAPID, RFC 8292).
// Runs the same in Deno (the edge function) and Node (the tests).

export interface PushSubscription { endpoint: string; p256dh: string; auth: string }

const enc = new TextEncoder();
/** Bytes over a plain ArrayBuffer, which is what WebCrypto takes. */
type Bytes = Uint8Array<ArrayBuffer>;

export function b64url(bytes: Bytes): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(text: string): Bytes {
  const b = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** The content key and nonce both sides derive (RFC 8291 section 3.4). */
export async function deriveKeys(shared: Bytes, authSecret: Bytes, uaPublic: Bytes, asPublic: Bytes, salt: Bytes) {
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  return { cek, nonce };
}

/** Encrypts a payload for one subscription: the request body to POST to its endpoint. */
export async function encryptPayload(sub: Pick<PushSubscription, 'p256dh' | 'auth'>, payload: string): Promise<Bytes> {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { cek, nonce } = await deriveKeys(shared, authSecret, uaPublic, asPublic, salt);
  // One record: the payload, then the 0x02 delimiter that marks the last record.
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** A VAPID key pair: the private key as JWK (kept secret), the public key as base64url (given to browsers). */
export async function generateVapidKeys(): Promise<{ privateJwk: JsonWebKey; publicKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  return { privateJwk, publicKey };
}

/** The public key (base64url, uncompressed point) of a private JWK. */
export function publicKeyOf(jwk: JsonWebKey): string {
  return b64url(concat(new Uint8Array([4]), fromB64url(jwk.x!), fromB64url(jwk.y!)));
}

/** The Authorization header for a push service: a JWT signed with the VAPID key, valid 12 hours. */
export async function vapidHeader(endpoint: string, privateJwk: JsonWebKey, subject: string, now = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', { ...privateJwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${publicKeyOf(privateJwk)}`;
}

/**
 * Sends one notification. Returns the push service's status: 201 delivered to
 * the service; 404 or 410 means the subscription is gone and can be deleted.
 */
export async function sendPush(sub: PushSubscription, payload: unknown, privateJwk: JsonWebKey, subject: string): Promise<number> {
  const body = await encryptPayload(sub, JSON.stringify(payload));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(sub.endpoint, privateJwk, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body,
  });
  await res.body?.cancel();
  return res.status;
}
