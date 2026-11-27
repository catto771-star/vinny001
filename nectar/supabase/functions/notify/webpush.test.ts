import { describe, expect, it } from 'vitest';
import { b64url, deriveKeys, encryptPayload, fromB64url, generateVapidKeys, publicKeyOf, vapidHeader } from './webpush';

/** What a browser does with a push message: read the header, derive the keys, decrypt. */
async function browserDecrypt(body: Uint8Array, uaPrivate: CryptoKey, uaPublic: Uint8Array, authSecret: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPrivate, 256));
  const { cek, nonce } = await deriveKeys(shared, authSecret, uaPublic, asPublic, salt);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  expect(plain[plain.length - 1]).toBe(2); // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe('web push', () => {
  it('base64url round-trips bytes', () => {
    const bytes = Uint8Array.from([0, 250, 251, 252, 253, 254, 255, 62, 63]);
    expect(fromB64url(b64url(bytes))).toEqual(bytes);
    expect(b64url(bytes)).not.toMatch(/[+/=]/);
  });

  it('encrypts so that the browser holding the subscription keys can read it', async () => {
    const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const payload = JSON.stringify({ title: 'Lembrete', body: 'Tomar a vitamina D às 09:00 ✓' });
    const body = await encryptPayload({ p256dh: b64url(uaPublic), auth: b64url(authSecret) }, payload);
    expect(await browserDecrypt(body, ua.privateKey, uaPublic, authSecret)).toBe(payload);
  });

  it('signs a VAPID token the push service can verify with the public key', async () => {
    const { privateJwk, publicKey } = await generateVapidKeys();
    expect(publicKeyOf(privateJwk)).toBe(publicKey);
    const header = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc', privateJwk, 'https://painel.example', Date.UTC(2026, 10, 19));
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(publicKey);
    const [h, c, s] = token.split('.');
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(c)));
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: Date.UTC(2026, 10, 19) / 1000 + 43200, sub: 'https://painel.example' });
    const pub = await crypto.subtle.importKey('raw', fromB64url(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(s), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });
});
