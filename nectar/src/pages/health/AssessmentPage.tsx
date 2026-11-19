import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Calculator, Camera, ImagePlus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay, toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { BODY_METRICS, navyBodyFat, navyWaist } from '../../lib/body';
import { fitWithin, photoPath } from '../../lib/photos';
import { Field, FieldGroup } from '../../components/ui';
import type { BodyPhoto, Health } from './useHealth';

export const POSES: { key: BodyPhoto['pose']; label: string; hint: string }[] = [
  { key: 'front', label: 'Frente', hint: 'De frente, braços soltos ao lado do corpo' },
  { key: 'side', label: 'Lado', hint: 'Lado direito, braços à frente ou cruzados' },
  { key: 'back', label: 'Costas', hint: 'De costas, braços soltos' },
];
const I = { size: 16, strokeWidth: 1.5 } as const;

/** Signed links to private photos, valid for an hour. */
export function usePhotoUrls(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    if (!paths.length) { setUrls({}); return; }
    void supabase.storage.from('body-photos').createSignedUrls(paths, 3600).then(({ data }) => {
      setUrls(Object.fromEntries((data ?? []).map((d, i) => [paths[i], d.signedUrl ?? ''])));
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

/** A phone photo down to 1600 px as JPEG; the original when it cannot be read (e.g. HEIC on Chrome). */
async function shrink(file: File): Promise<{ blob: Blob; name: string; type: string }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const size = fitWithin(bitmap.width, bitmap.height);
    if (size.width === bitmap.width && file.size < 1_500_000) return { blob: file, name: file.name, type: file.type };
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    return blob ? { blob, name: 'foto.jpg', type: 'image/jpeg' } : { blob: file, name: file.name, type: file.type };
  } catch {
    return { blob: file, name: file.name, type: file.type || 'image/jpeg' };
  }
}

type Choice = { file: File; preview: string } | 'remove';

/**
 * A whole page for an assessment, new or existing: date and profile,
 * measurements, the three photos (with the last assessment's as a guide to
 * repeat the pose) and notes. Photos are sent together when saving.
 */
export default function AssessmentPage({ h, editId, onDone }: { h: Health; editId: string | null; onDone: (id: string | null) => void }) {
  const existing = editId ? h.assessments.rows.find((a) => a.id === editId) ?? null : null;
  const existingValues = useMemo(() => Object.fromEntries(
    h.measurements.rows.filter((m) => existing && m.assessment_id === existing.id).map((m) => [m.metric, String(m.value)]),
  ), [existing, h.measurements.rows]);
  const existingPhotos = h.bodyPhotos.rows.filter((p) => existing && p.assessment_id === existing.id);
  // The latest other assessment that has photos: its pictures guide the pose.
  const guideAssessment = h.assessments.rows
    .filter((a) => a.id !== existing?.id && h.bodyPhotos.rows.some((p) => p.assessment_id === a.id))
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const guidePhotos = guideAssessment ? h.bodyPhotos.rows.filter((p) => p.assessment_id === guideAssessment.id) : [];
  const urls = usePhotoUrls([...existingPhotos, ...guidePhotos].map((p) => p.storage_path));

  const [date, setDate] = useState(existing?.date ?? toDay(new Date()));
  const [values, setValues] = useState<Record<string, string>>(existingValues);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [height, setHeight] = useState(h.profile?.height_cm?.toString() ?? '');
  const [sex, setSex] = useState<'M' | 'F' | ''>(h.profile?.sex ?? '');
  const [picks, setPicks] = useState<Partial<Record<BodyPhoto['pose'], Choice>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => () => { for (const p of Object.values(picks)) if (p && p !== 'remove') URL.revokeObjectURL(p.preview); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const v = (k: string) => (values[k] ? Number(values[k]) : undefined);
  const navy = navyBodyFat({ sex: sex || null, height_cm: height ? Number(height) : null, neck_cm: v('neck_cm'), waist_cm: navyWaist(sex || null, { waist_cm: v('waist_cm'), abdomen_cm: v('abdomen_cm') }), hip_cm: v('hip_cm') });
  const photoCount = POSES.filter(({ key }) => { const p = picks[key]; return p ? p !== 'remove' : existingPhotos.some((x) => x.pose === key); }).length;

  function choose(pose: BodyPhoto['pose'], file: File) {
    setPicks((p) => {
      const old = p[pose];
      if (old && old !== 'remove') URL.revokeObjectURL(old.preview);
      return { ...p, [pose]: { file, preview: URL.createObjectURL(file) } };
    });
  }
  function drop(pose: BodyPhoto['pose']) {
    setPicks((p) => {
      const old = p[pose];
      if (old && old !== 'remove') URL.revokeObjectURL(old.preview);
      const next = { ...p };
      if (existingPhotos.some((x) => x.pose === pose)) next[pose] = 'remove'; else delete next[pose];
      return next;
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const filled = BODY_METRICS.filter((m) => values[m.key]);
    if (!filled.length && !photoCount) { alert('Preencha pelo menos uma medida ou adicione uma foto'); return; }
    setBusy('Salvando a avaliação…');
    if (height || sex) {
      await supabase.from('user_settings').upsert({ height_cm: height ? Number(height) : null, sex: sex || null }, { onConflict: 'user_id' });
      void h.userSettings.reload();
    }
    let id = existing?.id ?? null;
    if (existing) {
      if (!await write(supabase.from('body_assessments').update({ date, notes: notes || null }).eq('id', existing.id))) { setBusy(null); return; }
      await write(supabase.from('body_measurements').delete().eq('assessment_id', existing.id));
    } else {
      const { data, error } = await supabase.from('body_assessments').insert({ date, notes: notes || null }).select('id').single();
      if (error || !data) { setBusy(null); alert(`Não foi possível salvar: ${error?.message}`); return; }
      id = data.id as string;
    }
    const [y, mo, d] = date.split('-').map(Number);
    const measured_at = new Date(y, mo - 1, d, 8).toISOString();
    if (filled.length) {
      await write(supabase.from('body_measurements').insert(filled.map((m) => ({ assessment_id: id, metric: m.key, value: Number(values[m.key]), measured_at, source: 'avaliação' }))));
    }

    const failed: string[] = [];
    const { data: auth } = await supabase.auth.getUser();
    for (const { key, label } of POSES) {
      const pick = picks[key];
      if (!pick) continue;
      const old = existingPhotos.find((p) => p.pose === key);
      if (pick !== 'remove') {
        setBusy(`Enviando a foto de ${label.toLowerCase()}…`);
        const small = await shrink(pick.file);
        const path = photoPath(auth.user!.id, date, key, small.name, crypto.randomUUID());
        const { error } = await supabase.storage.from('body-photos').upload(path, small.blob, { contentType: small.type });
        if (error) { failed.push(label); continue; }
        if (old) {
          await supabase.storage.from('body-photos').remove([old.storage_path]);
          await supabase.from('body_photos').delete().eq('id', old.id);
        }
        await write(supabase.from('body_photos').insert({ assessment_id: id, pose: key, storage_path: path }));
      } else if (old) {
        await supabase.storage.from('body-photos').remove([old.storage_path]);
        await supabase.from('body_photos').delete().eq('id', old.id);
      }
    }
    await Promise.all([h.assessments.reload(), h.measurements.reload(), h.bodyPhotos.reload()]);
    setBusy(null);
    if (failed.length) alert(`A avaliação foi salva, mas não deu para enviar: ${failed.join(', ')}. Abra a avaliação e tente de novo.`);
    onDone(id);
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl pb-24">
      <button type="button" className="btn-ghost -ml-2 mb-2" onClick={() => onDone(existing?.id ?? null)}><ArrowLeft {...I} />Avaliações</button>
      <h1 className="mb-6 text-[28px] leading-8 font-medium tracking-[-0.01em]">{existing ? `Avaliação de ${formatDay(existing.date)}` : 'Nova avaliação'}</h1>

      <section className="card mb-6" aria-label="Dados">
        <div className="label mb-3">Dados</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Data"><input className="input" type="date" value={date} max={toDay(new Date())} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Altura (cm)"><input className="input" type="number" min={100} max={250} value={height} onChange={(e) => setHeight(e.target.value)} /></Field>
          <div className="col-span-2 sm:col-span-1">
            <FieldGroup label="Sexo (cálculo de gordura)">
              <div className="segmented">
                {([['M', 'Masculino'], ['F', 'Feminino']] as const).map(([k, l]) => <button type="button" key={k} aria-pressed={sex === k} className={sex === k ? 'tab-active' : 'tab'} onClick={() => setSex(k)}>{l}</button>)}
              </div>
            </FieldGroup>
          </div>
        </div>
      </section>

      <section className="card mb-6" aria-label="Fotos">
        <div className="mb-1 flex items-baseline gap-2">
          <div className="label mr-auto">Fotos</div>
          <span className="figure text-xs text-fg3">{photoCount}/3</span>
        </div>
        <p className="mb-4 text-[13px] text-fg3">Mesma luz, mesma distância e roupa justa em todas as avaliações: é isso que torna a comparação justa.{guideAssessment ? ` A miniatura mostra a pose de ${formatDay(guideAssessment.date)}.` : ''}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {POSES.map(({ key, label, hint }) => {
            const pick = picks[key];
            const saved = existingPhotos.find((p) => p.pose === key);
            const src = pick && pick !== 'remove' ? pick.preview : pick === 'remove' ? null : saved ? urls[saved.storage_path] : null;
            const guide = guidePhotos.find((p) => p.pose === key);
            return (
              <div key={key}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="mr-auto text-sm">{label}</span>
                  {src && <button type="button" className="icon-btn h-7 w-7" aria-label={`Remover foto de ${label.toLowerCase()}`} onClick={() => drop(key)}><Trash2 size={14} strokeWidth={1.5} /></button>}
                </div>
                <label className="relative block cursor-pointer">
                  {src
                    ? <img src={src} alt={`Foto de ${label.toLowerCase()}`} className="aspect-[3/4] w-full rounded-xl object-cover" />
                    : (
                      <span className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-3 text-center text-fg3 transition-colors duration-150 hover:bg-raised/50">
                        <ImagePlus size={20} strokeWidth={1.5} />
                        <span className="text-sm text-fg2">Tirar ou escolher foto</span>
                        <span className="text-xs">{hint}</span>
                      </span>
                    )}
                  {guide && urls[guide.storage_path] && (
                    <img src={urls[guide.storage_path]} alt={`Pose anterior de ${label.toLowerCase()}`} className="absolute right-2 bottom-2 w-14 rounded-md border border-line object-cover opacity-90 shadow" />
                  )}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label={`Foto de ${label.toLowerCase()}`}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(key, f); e.target.value = ''; }} />
                </label>
                {src && <label className="btn-ghost mt-2 w-full cursor-pointer justify-center text-sm"><Camera size={14} strokeWidth={1.5} />Trocar
                  <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label={`Trocar foto de ${label.toLowerCase()}`}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(key, f); e.target.value = ''; }} />
                </label>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card mb-6" aria-label="Medidas">
        <div className="label mb-3">Medidas</div>
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
          {BODY_METRICS.map((m) => (
            <Field key={m.key} label={`${m.label} (${m.unit})`}>
              <input className="input" type="number" min={0} step="0.1" inputMode="decimal" value={values[m.key] ?? ''} onChange={(e) => setValues({ ...values, [m.key]: e.target.value })} />
            </Field>
          ))}
        </div>
        {navy !== null && (
          <button type="button" className="btn-secondary w-full" onClick={() => setValues({ ...values, body_fat_pct: String(navy) })}>
            <Calculator {...I} />Usar {num(navy)}% de gordura (método da Marinha americana)
          </button>
        )}
      </section>

      <section className="card mb-6" aria-label="Observações">
        <Field label="Observações"><textarea className="input h-24 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Como está o treino, a dieta, o sono…" /></Field>
      </section>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="mr-auto text-sm text-fg3" aria-live="polite">{busy ?? `${Object.values(values).filter(Boolean).length} medidas · ${photoCount} fotos`}</span>
          <button type="button" className="btn-ghost" onClick={() => onDone(existing?.id ?? null)} disabled={!!busy}>Cancelar</button>
          <button className="btn-primary" disabled={!!busy}>{busy ? 'Salvando…' : 'Salvar avaliação'}</button>
        </div>
      </div>
    </form>
  );
}
