// Body photos: sized down before upload (a phone photo is 3 to 5 MB; at
// 1600 px it is a few hundred KB and still sharp for comparing), and stored
// under the user's folder so the bucket rules keep them private.
/** Size that fits within `max` on the longer side, keeping the proportion; never larger than the original. */
export function fitWithin(width, height, max = 1600) {
    const long = Math.max(width, height);
    if (long <= max)
        return { width, height };
    const k = max / long;
    return { width: Math.round(width * k), height: Math.round(height * k) };
}
/** Path in the body-photos bucket: '<user>/<date>-<pose>-<random>.<ext>'. */
export function photoPath(userId, date, pose, fileName, random) {
    const ext = (fileName.includes('.') ? fileName.split('.').pop() : 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    return `${userId}/${date}-${pose}-${random}.${ext === 'jpeg' ? 'jpg' : ext}`;
}
/** Two assessments to compare: the chosen one and, unless another is picked, the one before it. */
export function comparisonPair(list, currentId, otherId) {
    const current = list.find((a) => a.id === currentId) ?? list[0] ?? null;
    if (!current)
        return { current: null, other: null };
    const chosen = otherId && otherId !== current.id ? list.find((a) => a.id === otherId) ?? null : null;
    return { current, other: chosen ?? list[list.indexOf(current) + 1] ?? null };
}
