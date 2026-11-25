// Geometry for the sliding indicator under the active tab. The indicator is
// one shape per tab group, moved with a transform, so switching tabs glides
// instead of jumping.
/** CSS variables that place the indicator over a tab; null when there is no tab to point at. */
export function indicatorVars(box) {
    if (!box || box.width <= 0 || box.height <= 0)
        return null;
    const px = (n) => `${Math.round(n)}px`;
    return { '--ind-x': px(box.left), '--ind-y': px(box.top), '--ind-w': px(box.width), '--ind-h': px(box.height) };
}
