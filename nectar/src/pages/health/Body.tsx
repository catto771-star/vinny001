import { useEffect, useState, type FormEvent } from 'react';
import { Calculator, Camera, Plus, Ruler, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay, toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { BODY_METRICS, compareAssessments, navyBodyFat, navyWaist, type Assessment } from '../../lib/body';
import { Empty, Field, FieldGroup, ListSkeleton, Modal } from '../../components/ui';
import type { BodyPhoto, Health } from './useHealth';

const POSES: { key: BodyPhoto['pose']; label: string }[] = [
  { key: 'front', label: 'Frente' }, { key: 'side', label: 'Lado' }, { key: 'back', label: 'Costas' },
];
const I = { size: 16, strokeWidth: 1.5 } as const;

function assessmentsOf(h: Health): Assessment[] {
  return h.assessments.rows.map((a) => ({
    id: a.id, date: a.date,
    values: Object.fromEntries(h.measurements.rows.filter((m) => m.assessment_id === a.id).map((m) => [m.metric, Number(m.value)])),
  }));
}

export default function Body({ h }: { h: Health }) {
  const [form, setForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = assessmentsOf(h);
  const open = list.find((a) => a.id === openId) ?? list[0] ?? null;
  const prev = open ? list[list.indexOf(open) + 1] ?? null : null;

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="mr-auto text-lg font-medium">Avaliações</h2>
        <button className="btn-primary" onClick={() => setForm(true)}><Plus {...I} />Nova avaliação</button>
      </div>
      {h.assessments.loading ? <ListSkeleton /> : !list.length ? (
        <div className="card"><Empty icon={<Ruler size={18} strokeWidth={1.5} />} action={<button className="btn-secondary" onClick={() => setForm(true)}>Nova avaliação</button>}>
          Registre peso, medidas e fotos para acompanhar a evolução do corpo
        </Empty></div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {open && <Detail h={h} current={open} previous={prev} />}
          <section className="card h-fit">
            <div className="label mb-2">Histórico</div>
            <ul className="divide-y divide-line">
              {list.map((a) => (
                <li key={a.id}>
                  <button className={`flex w-full items-center gap-3 py-2.5 text-left text-sm ${a.id === open?.id ? 'text-fg' : 'text-fg2 hover:text-fg'}`} onClick={() => setOpenId(a.id)}>
                    <span className="mr-auto">{formatDay(a.date)}</span>
                    {a.values.weight_kg !== undefined && <span className="figure">{num(a.values.weight_kg)} kg</span>}
                    {a.values.body_fat_pct !== undefined && <span className="figure text-fg3">{num(a.values.body_fat_pct)}%</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {form && <AssessmentForm h={h} onClose={() => setForm(false)} onSaved={(id) => { setForm(false); setOpenId(id); }} />}
    </>
  );
}

function Detail({ h, current, previous }: { h: Health; current: Assessment; previous: Assessment | null }) {
  const deltas = compareAssessments(current, previous);
  const notes = h.assessments.rows.find((a) => a.id === current.id)?.notes;
  async function remove() {
    if (!confirm('Excluir esta avaliação, com medidas e fotos?')) return;
    const photos = h.bodyPhotos.rows.filter((p) => p.assessment_id === current.id);
    if (photos.length) await supabase.storage.from('body-photos').remove(photos.map((p) => p.storage_path));
    if (await write(supabase.from('body_assessments').delete().eq('id', current.id))) {
      await Promise.all([h.assessments.reload(), h.measurements.reload(), h.bodyPhotos.reload()]);
    }
  }
  return (
    <div className="space-y-6">
      <section className="card">
        <div className="mb-4 flex items-start gap-2">
          <div className="mr-auto">
            <div className="text-lg font-medium">{formatDay(current.date)}</div>
            <div className="text-[13px] text-fg3">{previous ? `comparado com ${formatDay(previous.date)}` : 'primeira avaliação'}</div>
          </div>
          <button className="icon-btn hover:text-negative" onClick={remove} aria-label="Excluir avaliação"><Trash2 {...I} /></button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-fg3"><th className="pb-2 font-normal">Medida</th><th className="pb-2 text-right font-normal">Agora</th><th className="pb-2 text-right font-normal">Antes</th><th className="pb-2 text-right font-normal">Diferença</th></tr></thead>
          <tbody>
            {deltas.map((d) => (
              <tr key={d.key} className="border-t border-line">
                <td className="py-2">{d.label}</td>
                <td className="figure py-2 text-right">{num(d.current)} <span className="text-fg3">{d.unit}</span></td>
                <td className="figure py-2 text-right text-fg3">{d.previous === null ? '—' : num(d.previous)}</td>
                <td className="figure py-2 text-right">{d.change === null ? '—' : d.change === 0 ? '0' : `${d.change > 0 ? '+' : '−'}${num(Math.abs(d.change))}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {notes && <p className="mt-4 text-sm text-fg2">{notes}</p>}
      </section>
      <Photos h={h} current={current} previous={previous} />
    </div>
  );
}

function usePhotoUrls(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    if (!paths.length) return setUrls({});
    void supabase.storage.from('body-photos').createSignedUrls(paths, 3600).then(({ data }) => {
      setUrls(Object.fromEntries((data ?? []).map((d, i) => [paths[i], d.signedUrl ?? ''])));
    });
  }, [key]);
  return urls;
}

function Photos({ h, current, previous }: { h: Health; current: Assessment; previous: Assessment | null }) {
  const mine = h.bodyPhotos.rows.filter((p) => p.assessment_id === current.id);
  const before = previous ? h.bodyPhotos.rows.filter((p) => p.assessment_id === previous.id) : [];
  const urls = usePhotoUrls([...mine, ...before].map((p) => p.storage_path));
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(pose: BodyPhoto['pose'], file: File) {
    setBusy(pose);
    const { data: auth } = await supabase.auth.getUser();
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${auth.user?.id}/${current.date}-${pose}-${crypto.randomUUID()}.${ext}`;
    const old = mine.find((p) => p.pose === pose);
    const { error } = await supabase.storage.from('body-photos').upload(path, file, { contentType: file.type });
    if (error) alert(`Não foi possível enviar a foto: ${error.message}`);
    else {
      if (old) {
        await supabase.storage.from('body-photos').remove([old.storage_path]);
        await supabase.from('body_photos').delete().eq('id', old.id);
      }
      await write(supabase.from('body_photos').insert({ assessment_id: current.id, pose, storage_path: path }));
      await h.bodyPhotos.reload();
    }
    setBusy(null);
  }

  return (
    <section className="card">
      <div className="mb-4 font-medium">Fotos{previous && before.length ? <span className="ml-2 text-[13px] font-normal text-fg3">antes e agora</span> : null}</div>
      <div className="grid grid-cols-3 gap-3">
        {POSES.map(({ key, label }) => {
          const now = mine.find((p) => p.pose === key);
          const then = before.find((p) => p.pose === key);
          return (
            <div key={key}>
              <div className="mb-2 text-[13px] text-fg2">{label}</div>
              <div className="grid gap-2">
                {then && urls[then.storage_path] && (
                  <figure>
                    <img src={urls[then.storage_path]} alt={`${label}, avaliação anterior`} className="aspect-[3/4] w-full rounded-xl object-cover" />
                    <figcaption className="figure mt-1 text-xs text-fg3">{previous && formatDay(previous.date)}</figcaption>
                  </figure>
                )}
                <figure>
                  {now && urls[now.storage_path]
                    ? <img src={urls[now.storage_path]} alt={`${label}, ${formatDay(current.date)}`} className="aspect-[3/4] w-full rounded-xl object-cover" />
                    : <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl border border-dashed border-line-strong text-fg3"><Camera {...I} /></div>}
                  {then && <figcaption className="figure mt-1 text-xs text-fg3">{formatDay(current.date)}</figcaption>}
                </figure>
                <label className={`btn-secondary cursor-pointer ${busy === key ? 'opacity-50' : ''}`}>
                  <Camera {...I} />{busy === key ? 'Enviando…' : now ? 'Trocar' : 'Adicionar'}
                  <input type="file" accept="image/*" capture="environment" className="hidden" aria-label={`Foto de ${label.toLowerCase()}`} disabled={busy !== null}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(key, f); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AssessmentForm({ h, onClose, onSaved }: { h: Health; onClose: () => void; onSaved: (id: string) => void }) {
  const [date, setDate] = useState(toDay(new Date()));
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [height, setHeight] = useState(h.profile?.height_cm?.toString() ?? '');
  const [sex, setSex] = useState<'M' | 'F' | ''>(h.profile?.sex ?? '');
  const [busy, setBusy] = useState(false);
  const v = (k: string) => (values[k] ? Number(values[k]) : undefined);
  const navy = navyBodyFat({ sex: sex || null, height_cm: height ? Number(height) : null, neck_cm: v('neck_cm'), waist_cm: navyWaist(sex || null, { waist_cm: v('waist_cm'), abdomen_cm: v('abdomen_cm') }), hip_cm: v('hip_cm') });

  async function save(e: FormEvent) {
    e.preventDefault();
    const filled = BODY_METRICS.filter((m) => values[m.key]);
    if (!filled.length) return alert('Preencha pelo menos uma medida');
    setBusy(true);
    if (height || sex) {
      await supabase.from('user_settings').upsert({ height_cm: height ? Number(height) : null, sex: sex || null }, { onConflict: 'user_id' });
      void h.userSettings.reload();
    }
    const { data, error } = await supabase.from('body_assessments').insert({ date, notes: notes || null }).select('id').single();
    if (error || !data) { setBusy(false); return alert(`Não foi possível salvar: ${error?.message}`); }
    const [y, mo, d] = date.split('-').map(Number);
    const measured_at = new Date(y, mo - 1, d, 8).toISOString();
    const ok = await write(supabase.from('body_measurements').insert(filled.map((m) => ({ assessment_id: data.id, metric: m.key, value: Number(values[m.key]), measured_at, source: 'avaliação' }))));
    await Promise.all([h.assessments.reload(), h.measurements.reload()]);
    setBusy(false);
    if (ok) onSaved(data.id);
  }

  return (
    <Modal title="Nova avaliação" onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Altura (cm)"><input className="input" type="number" min={100} max={250} value={height} onChange={(e) => setHeight(e.target.value)} /></Field>
        </div>
        <FieldGroup label="Sexo (para o cálculo de gordura)">
          <div className="segmented">
            {([['M', 'Masculino'], ['F', 'Feminino']] as const).map(([k, l]) => <button type="button" key={k} aria-pressed={sex === k} className={sex === k ? 'tab-active' : 'tab'} onClick={() => setSex(k)}>{l}</button>)}
          </div>
        </FieldGroup>
        <div className="grid grid-cols-2 gap-x-3">
          {BODY_METRICS.map((m) => (
            <Field key={m.key} label={`${m.label} (${m.unit})`}>
              <input className="input" type="number" min={0} step="0.1" value={values[m.key] ?? ''} onChange={(e) => setValues({ ...values, [m.key]: e.target.value })} />
            </Field>
          ))}
        </div>
        {navy !== null && (
          <button type="button" className="btn-secondary mb-4 w-full" onClick={() => setValues({ ...values, body_fat_pct: String(navy) })}>
            <Calculator {...I} />Usar {num(navy)}% de gordura (método da Marinha americana)
          </button>
        )}
        <Field label="Observações"><textarea className="input h-20 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <p className="mb-4 text-xs text-fg3">As fotos de frente, lado e costas são adicionadas depois de salvar</p>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Salvando…' : 'Salvar avaliação'}</button>
      </form>
    </Modal>
  );
}
