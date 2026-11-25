import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(__dirname, '../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'));
describe('installable app', () => {
    it('has what browsers require to install it', () => {
        expect(manifest).toMatchObject({ name: 'Painel', display: 'standalone', start_url: './' });
        const sizes = manifest.icons.map((i) => i.sizes);
        expect(sizes).toContain('192x192');
        expect(sizes).toContain('512x512');
        expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    });
    it('points to icon files that exist', () => {
        for (const icon of manifest.icons)
            expect(() => readFileSync(resolve(root, 'public', icon.src))).not.toThrow();
    });
    it('never caches requests to other sites, such as the database', () => {
        const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8');
        expect(sw).toContain('url.origin !== self.location.origin) return');
    });
});
