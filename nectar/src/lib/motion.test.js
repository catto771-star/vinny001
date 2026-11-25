import { describe, expect, it } from 'vitest';
import { indicatorVars } from './motion';
describe('sliding indicator', () => {
    it('sits exactly over the active tab, in whole pixels', () => {
        expect(indicatorVars({ left: 4, top: 4, width: 63.6, height: 32 })).toEqual({
            '--ind-x': '4px', '--ind-y': '4px', '--ind-w': '64px', '--ind-h': '32px',
        });
    });
    it('hides when there is nothing to point at', () => {
        expect(indicatorVars(null)).toBeNull();
        expect(indicatorVars({ left: 0, top: 0, width: 0, height: 0 })).toBeNull();
    });
});
