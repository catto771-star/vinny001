import { describe, expect, it } from 'vitest';
import { advanceLabel, b64urlToBytes, deviceName, pushSupport, VAPID_PUBLIC_KEY } from './push';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
describe('push helpers', () => {
    it('names devices', () => {
        expect(deviceName(ANDROID)).toBe('Android · Chrome');
        expect(deviceName(IPHONE)).toBe('iPhone · Safari');
        expect(deviceName(EDGE)).toBe('Windows · Edge');
        expect(deviceName(SAMSUNG)).toBe('Android · Samsung Internet');
    });
    it('knows when push can work', () => {
        expect(pushSupport({ ua: ANDROID, standalone: false, hasPush: true, hasSW: true })).toBe('ok');
        expect(pushSupport({ ua: IPHONE, standalone: false, hasPush: false, hasSW: true })).toBe('ios-install');
        expect(pushSupport({ ua: IPHONE, standalone: true, hasPush: true, hasSW: true })).toBe('ok');
        expect(pushSupport({ ua: EDGE, standalone: false, hasPush: false, hasSW: true })).toBe('unsupported');
    });
    it('reads the public key as a P-256 point', () => {
        const bytes = b64urlToBytes(VAPID_PUBLIC_KEY);
        expect(bytes.length).toBe(65);
        expect(bytes[0]).toBe(4);
    });
    it('labels the advance', () => {
        expect([0, 15, 60, 120].map(advanceLabel)).toEqual(['Na hora', '15 min antes', '1 h antes', '2 h antes']);
    });
});
