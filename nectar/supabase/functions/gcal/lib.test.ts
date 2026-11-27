import { describe, expect, it } from 'vitest';
import { googleToLocal, localToGoogle, midnight, planSync, signState, verifyState, type GoogleEvent, type LocalEvent } from './lib';

const TZ = 'America/Sao_Paulo';
const UID = '11111111-1111-4111-8111-111111111111';
const WINDOW = { from: '2026-10-01T00:00:00Z', to: '2027-12-31T00:00:00Z' };

describe('sign-in state', () => {
  it('accepts its own fresh state and refuses forged, other or old ones', async () => {
    const now = Date.UTC(2026, 10, 19, 12);
    const state = await signState(UID, now, 'segredo');
    expect(await verifyState(state, 'segredo', now + 60_000)).toBe(UID);
    expect(await verifyState(state, 'outro', now)).toBeNull();
    expect(await verifyState(state.replace(UID, '22222222-2222-4222-8222-222222222222'), 'segredo', now)).toBeNull();
    expect(await verifyState(state, 'segredo', now + 16 * 60_000)).toBeNull();
    expect(await verifyState('lixo', 'segredo', now)).toBeNull();
  });
});

describe('events both ways', () => {
  it('reads timed and all-day Google events', () => {
    expect(googleToLocal({ id: 'g', summary: ' Dentista ', location: 'Centro', start: { dateTime: '2026-11-20T14:00:00-03:00' }, end: { dateTime: '2026-11-20T15:00:00-03:00' } }, TZ))
      .toEqual({ title: 'Dentista', location: 'Centro', notes: null, all_day: false, start_at: '2026-11-20T17:00:00.000Z', end_at: '2026-11-20T18:00:00.000Z' });
    expect(googleToLocal({ id: 'g', summary: 'Feriado', start: { date: '2026-11-20' }, end: { date: '2026-11-21' } }, TZ))
      .toMatchObject({ all_day: true, start_at: '2026-11-20T03:00:00.000Z', end_at: null });
    expect(googleToLocal({ id: 'g', summary: 'Viagem', start: { date: '2026-12-20' }, end: { date: '2026-12-23' } }, TZ))
      .toMatchObject({ all_day: true, start_at: midnight('2026-12-20', TZ), end_at: midnight('2026-12-22', TZ) });
    expect(googleToLocal({ id: 'g', start: { dateTime: '2026-11-20T14:00:00Z' } }, TZ).title).toBe('(sem título)');
  });
  it('writes Painel appointments for Google, tagged with the Painel id', () => {
    const timed = localToGoogle({ id: 'p1', title: 'Reunião', start_at: '2026-11-20T17:00:00.000Z', end_at: null, all_day: false, location: null, notes: 'pauta' }, TZ);
    expect(timed).toMatchObject({ summary: 'Reunião', description: 'pauta', start: { dateTime: '2026-11-20T17:00:00.000Z', timeZone: TZ }, end: { dateTime: '2026-11-20T18:00:00.000Z' } });
    expect(timed.extendedProperties).toEqual({ private: { painel_id: 'p1' } });
    const allDay = localToGoogle({ id: 'p2', title: 'Folga', start_at: midnight('2026-11-20', TZ), end_at: null, all_day: true, location: null, notes: null }, TZ);
    expect(allDay).toMatchObject({ start: { date: '2026-11-20' }, end: { date: '2026-11-21' } });
  });
});

const local = (over: Partial<LocalEvent>): LocalEvent => ({
  id: 'l1', title: 'X', start_at: '2026-11-20T17:00:00.000Z', end_at: null, all_day: false, location: null, notes: null,
  source: 'manual', external_id: null, updated_at: '2026-11-19T10:00:00Z', synced_at: null, ...over,
});
const google = (over: Partial<GoogleEvent>): GoogleEvent => ({
  id: 'g1', summary: 'X', updated: '2026-11-19T10:00:00Z', start: { dateTime: '2026-11-20T14:00:00-03:00' }, end: { dateTime: '2026-11-20T15:00:00-03:00' }, ...over,
});
const keys = (p: ReturnType<typeof planSync>) => ({
  insertLocal: p.insertLocal.map((x) => x.external_id), updateLocal: p.updateLocal.map((x) => x.id), deleteLocal: p.deleteLocal,
  createGoogle: p.createGoogle.map((x) => x.id), patchGoogle: p.patchGoogle.map((x) => x.googleId), deleteGoogle: p.deleteGoogle,
});
const none = { insertLocal: [], updateLocal: [], deleteLocal: [], createGoogle: [], patchGoogle: [], deleteGoogle: [] };

describe('sync plan', () => {
  it('brings new Google events and sends new Painel appointments', () => {
    expect(keys(planSync([local({})], [google({})], [], WINDOW, TZ))).toEqual({ ...none, insertLocal: ['g1'], createGoogle: ['l1'] });
  });
  it('does nothing when neither side changed', () => {
    const synced = local({ external_id: 'g1', updated_at: '2026-11-19T10:00:02Z', synced_at: '2026-11-19T10:00:01Z' });
    expect(keys(planSync([synced], [google({ updated: '2026-11-19T10:00:01Z' })], [], WINDOW, TZ))).toEqual(none);
  });
  it('sends the side that changed, and the later one on a conflict', () => {
    const base = { external_id: 'g1', synced_at: '2026-11-19T10:00:00Z' };
    expect(keys(planSync([local({ ...base, updated_at: '2026-11-19T12:00:00Z' })], [google({ updated: '2026-11-19T10:00:00Z' })], [], WINDOW, TZ)).patchGoogle).toEqual(['g1']);
    expect(keys(planSync([local({ ...base, updated_at: '2026-11-19T10:00:01Z' })], [google({ updated: '2026-11-19T12:00:00Z' })], [], WINDOW, TZ)).updateLocal).toEqual(['l1']);
    expect(keys(planSync([local({ ...base, updated_at: '2026-11-19T13:00:00Z' })], [google({ updated: '2026-11-19T12:00:00Z' })], [], WINDOW, TZ)).patchGoogle).toEqual(['g1']);
    expect(keys(planSync([local({ ...base, updated_at: '2026-11-19T12:00:00Z' })], [google({ updated: '2026-11-19T13:00:00Z' })], [], WINDOW, TZ)).updateLocal).toEqual(['l1']);
  });
  it('deletes on one side what was deleted on the other', () => {
    // Deleted in Google: the Painel copy goes.
    expect(keys(planSync([local({ external_id: 'g9', synced_at: '2026-11-19T10:00:00Z' })], [], [], WINDOW, TZ)).deleteLocal).toEqual(['l1']);
    // Deleted in the Painel (recorded): the Google copy goes, even if Google no longer lists it.
    expect(keys(planSync([], [google({})], ['g1'], WINDOW, TZ)).deleteGoogle).toEqual(['g1']);
    expect(keys(planSync([], [], ['g7'], WINDOW, TZ)).deleteGoogle).toEqual(['g7']);
    // Made in the Painel, gone from it without a record: still removed from Google.
    expect(keys(planSync([], [google({ extendedProperties: { private: { painel_id: 'gone' } } })], [], WINDOW, TZ)).deleteGoogle).toEqual(['g1']);
  });
  it('leaves alone what is outside the window and Google cancellations', () => {
    const old = local({ external_id: 'g5', start_at: '2025-01-01T12:00:00Z', synced_at: '2025-01-01T00:00:00Z' });
    expect(keys(planSync([old], [google({ id: 'g2', status: 'cancelled' })], [], WINDOW, TZ))).toEqual(none);
  });
  it('links a copy found by its Painel id when the local link was lost', () => {
    const p = planSync([local({ id: 'l1', external_id: null })], [google({ extendedProperties: { private: { painel_id: 'l1' } } })], [], WINDOW, TZ);
    expect(keys(p)).toEqual({ ...none, patchGoogle: ['g1'] });
  });
});
