import { useEffect } from 'react';
import { indicatorVars } from '../lib/motion';
const GROUPS = '.segmented, .slide-group';
const ACTIVE = ':scope > .tab-active, :scope > [aria-current="page"], :scope > [aria-selected="true"], :scope > [aria-pressed="true"]';
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
/**
 * Motion for the whole app, mounted once: a pill that glides to the active tab
 * of every tab group (page tabs, filters, the sidebar, the phone bar), content
 * that fades in when a page's tab changes, and the soft light that follows the
 * pointer over .glow cards. Groups are found in the page, so screens only use
 * the shared classes.
 */
export function Motion() {
    useEffect(() => {
        const last = new WeakMap();
        let frame = 0;
        const place = (group) => {
            const active = group.querySelector(ACTIVE);
            const vars = active ? indicatorVars({ left: active.offsetLeft, top: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight }) : null;
            if (!vars || !active) {
                if (group.dataset.ind) {
                    delete group.dataset.ind;
                    last.delete(group);
                }
                return;
            }
            for (const [k, v] of Object.entries(vars))
                if (group.style.getPropertyValue(k) !== v)
                    group.style.setProperty(k, v);
            const first = !group.dataset.ind;
            if (first) {
                // Placed without a transition the first time, then it glides.
                group.dataset.ind = 'on';
                requestAnimationFrame(() => { if (group.dataset.ind && !reduced())
                    group.dataset.ind = 'glide'; });
            }
            if (last.get(group) !== active) {
                if (!first && group.scrollWidth > group.clientWidth) {
                    group.scrollTo({ left: active.offsetLeft - 24, behavior: reduced() ? 'auto' : 'smooth' });
                }
                last.set(group, active);
            }
        };
        const update = () => { frame = 0; document.querySelectorAll(GROUPS).forEach(place); };
        const schedule = () => { if (!frame)
            frame = requestAnimationFrame(update); };
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-current', 'aria-selected', 'aria-pressed'] });
        const resize = new ResizeObserver(schedule);
        resize.observe(document.body);
        window.addEventListener('resize', schedule);
        void document.fonts?.ready.then(schedule);
        schedule();
        // A page's tab changed: let the new content rise in.
        const onClick = (e) => {
            const tab = e.target?.closest?.('main > header [role="tab"]');
            if (!tab || tab.getAttribute('aria-selected') === 'true' || reduced())
                return;
            const main = tab.closest('main');
            requestAnimationFrame(() => {
                if (!main)
                    return;
                main.classList.remove('tab-swap');
                void main.offsetWidth;
                main.classList.add('tab-swap');
            });
        };
        document.addEventListener('click', onClick, true);
        // The light under the pointer on .glow cards.
        const onMove = (e) => {
            const card = e.target?.closest?.('.glow');
            if (!card)
                return;
            const r = card.getBoundingClientRect();
            card.style.setProperty('--mx', `${e.clientX - r.left}px`);
            card.style.setProperty('--my', `${e.clientY - r.top}px`);
        };
        document.addEventListener('pointermove', onMove, { passive: true });
        return () => {
            observer.disconnect();
            resize.disconnect();
            window.removeEventListener('resize', schedule);
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('pointermove', onMove);
            if (frame)
                cancelAnimationFrame(frame);
        };
    }, []);
    return null;
}
