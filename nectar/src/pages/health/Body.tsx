import { useState } from 'react';
import { Camera, Pencil, Plus, Ruler, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { compareAssessments, type Assessment } from '../../lib/body';
import { comparisonPair } from '../../lib/photos';
import { Empty, ListSkeleton } from '../../components/ui';
import type { Health } from './useHealth';
import { POSES, usePhotoUrls } from './AssessmentPage';

const I = { size: 16, strokeWidth: 1.5 } as const;

function assessmentsOf(h: Health): Assessment[] {
  return [...h.assessments.rows].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).map((a) => ({
    id: a.id, date: a.date,
    values: Object.fromEntries(h.measurements.rows.filter((m) => m.assessment_id === a.id).map((m) => [m.metric, Number(m.value)])),
  }));
}

/** The list of assessments and the open one compared with another. New and edit open AssessmentPage. */
export default function Body({ h, onEdit }: { h: Health; onEdit: (id: string | null) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [otherId, setOtherId] = useState<string | null>(null);
  const list = assessmentsOf(h);
  const { current, other } = comparisonPair(list, openId, otherId);
  const photosOf = (id: string) => h.bodyPhotos.rows.filter((p) => p.assessment_id === id).length;

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="mr-auto text-lg font-medium">Avaliações</h2>
        <button className="btn-primary" onClick={() => onEdit(null)}><Plus {...I} />Nova avaliação</button>
      </div>
      {h.assessments.loading ? <ListSkeleton /> : !list.length ? (
        <div className="card"><Empty icon={<Ruler size={18} strokeWidth={1.5} />} action={<button className="btn-secondary" onClick={() => onEdit(null)}>Nova avaliação</button>}>
          Registre peso, medidas e fotos para acompanhar a evolução do corpo
        </Empty></div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {current && (
            <Detail h={h} list={list} current={current} other={other}
              onOther={setOtherId} onEdit={() => onEdit(current.id)}
              onDeleted={() => { setOpenId(null); setOtherId(null); }} />
          )}
          <section className="card h-fit">
            <div className="label mb-2">Histórico</div>
            <ul className="divide-y divide-line">
              {list.map((a) => (
                <li key={a.id}>
                  <button className={`flex w-full items-center gap-3 py-2.5 text-left text-sm ${a.id === current?.id ? 'text-fg' : 'text-fg2 hover:text-fg'}`} onClick={() => { setOpenId(a.id); setOtherId(null); }}>
                    <span className="mr-auto">{formatDay(a.date)}</span>
                    {photosOf(a.id) > 0 && <span className="flex items-center gap-1 text-xs text-fg3" title="Fotos"><Camera size={12} strokeWidth={1.5} />{photosOf(a.id)}</span>}
                    {a.values.weight_kg !== undefined && <span className="figure">{num(a.values.weight_kg)} kg</span>}
                    {a.values.body_fat_pct !== undefined && <span className="figure text-fg3">{num(a.values.body_fat_pct)}%</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}

function Detail({ h, list, current, other, onOther, onEdit, onDeleted }: {
  h: Health; list: Assessment[]; current: Assessment; other: Assessment | null;
  onOther: (id: string) => void; onEdit: () => void; onDeleted: () => void;
}) {
  const deltas = compareAssessments(current, other);
  const notes = h.assessments.rows.find((a) => a.id === current.id)?.notes;
  async function remove() {
    if (!confirm('Excluir esta avaliação, com medidas e fotos?')) return;
    const photos = h.bodyPhotos.rows.filter((p) => p.assessment_id === current.id);
    if (photos.length) await supabase.storage.from('body-photos').remove(photos.map((p) => p.storage_path));
    if (await write(supabase.from('body_assessments').delete().eq('id', current.id))) {
      await Promise.all([h.assessments.reload(), h.measurements.reload(), h.bodyPhotos.reload()]);
      onDeleted();
    }
  }
  return (
    <div className="space-y-6">
      <section className="card">
        <div className="mb-4 flex flex-wrap items-start gap-2">
          <div className="mr-auto">
            <div className="text-lg font-medium">{formatDay(current.date)}</div>
            {list.length > 1 ? (
              <label className="mt-1 flex items-center gap-2 text-[13px] text-fg3">
                comparar com
                <select className="input w-auto py-1 text-[13px]" aria-label="Comparar com" value={other?.id ?? ''} onChange={(e) => onOther(e.target.value)}>
                  {list.filter((a) => a.id !== current.id).map((a) => <option key={a.id} value={a.id}>{formatDay(a.date)}</option>)}
                </select>
              </label>
            ) : <div className="text-[13px] text-fg3">primeira avaliação</div>}
          </div>
          <button className="btn-secondary" onClick={onEdit}><Pencil {...I} />Editar</button>
          <button className="icon-btn hover:text-negative" onClick={remove} aria-label="Excluir avaliação"><Trash2 {...I} /></button>
        </div>
        {deltas.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-fg3"><th className="pb-2 font-normal">Medida</th><th className="pb-2 text-right font-normal">{formatDay(current.date).split(',')[1]?.trim() ?? 'Agora'}</th><th className="pb-2 text-right font-normal">{other ? formatDay(other.date).split(',')[1]?.trim() : 'Antes'}</th><th className="pb-2 text-right font-normal">Diferença</th></tr></thead>
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
        )}
        {notes && <p className="mt-4 text-sm text-fg2">{notes}</p>}
      </section>
      <PhotoCompare h={h} current={current} other={other} onEdit={onEdit} />
    </div>
  );
}

/** The photos of two assessments per pose: side by side, or one over the other with a slider. */
function PhotoCompare({ h, current, other, onEdit }: { h: Health; current: Assessment; other: Assessment | null; onEdit: () => void }) {
  const [mode, setMode] = useState<'side' | 'overlay'>('side');
  const [split, setSplit] = useState(50);
  const mine = h.bodyPhotos.rows.filter((p) => p.assessment_id === current.id);
  const theirs = other ? h.bodyPhotos.rows.filter((p) => p.assessment_id === other.id) : [];
  const urls = usePhotoUrls([...mine, ...theirs].map((p) => p.storage_path));
  const both = POSES.some(({ key }) => mine.some((p) => p.pose === key) && theirs.some((p) => p.pose === key));

  if (!mine.length && !theirs.length) {
    return (
      <section className="card">
        <Empty icon={<Camera size={18} strokeWidth={1.5} />} action={<button className="btn-secondary" onClick={onEdit}>Adicionar fotos</button>}>
          Sem fotos nesta avaliação. Fotos de frente, lado e costas mostram o que a balança não mostra.
        </Empty>
      </section>
    );
  }
  const img = (path: string | undefined, alt: string) => (path && urls[path]
    ? <img src={urls[path]} alt={alt} className="aspect-[3/4] w-full rounded-xl object-cover" draggable={false} />
    : <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl border border-dashed border-line-strong text-xs text-fg3">sem foto</div>);

  return (
    <section className="card" aria-label="Comparação de fotos">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto font-medium">Fotos</div>
        {both && (
          <div className="segmented" role="tablist" aria-label="Modo de comparação">
            <button role="tab" aria-selected={mode === 'side'} className={mode === 'side' ? 'tab-active' : 'tab'} onClick={() => setMode('side')}>Lado a lado</button>
            <button role="tab" aria-selected={mode === 'overlay'} className={mode === 'overlay' ? 'tab-active' : 'tab'} onClick={() => setMode('overlay')}>Sobrepor</button>
          </div>
        )}
      </div>
      {mode === 'overlay' && both && (
        <label className="mb-4 flex items-center gap-3 text-xs text-fg3">
          <span className="figure">{other && formatDay(other.date).split(',')[1]}</span>
          <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="flex-1 accent-[var(--brand)]" aria-label="Divisão entre as fotos" />
          <span className="figure">{formatDay(current.date).split(',')[1]}</span>
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {POSES.map(({ key, label }) => {
          const now = mine.find((p) => p.pose === key)?.storage_path;
          const then = theirs.find((p) => p.pose === key)?.storage_path;
          return (
            <figure key={key}>
              <figcaption className="mb-2 text-[13px] text-fg2">{label}</figcaption>
              {mode === 'overlay' && now && then && urls[now] && urls[then] ? (
                <div className="relative select-none overflow-hidden rounded-xl">
                  <img src={urls[then]} alt={`${label}, ${other && formatDay(other.date)}`} className="aspect-[3/4] w-full object-cover" draggable={false} />
                  <img src={urls[now]} alt={`${label}, ${formatDay(current.date)}`} className="absolute inset-0 aspect-[3/4] w-full object-cover" style={{ clipPath: `inset(0 0 0 ${split}%)` }} draggable={false} />
                  <span className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${split}%` }} aria-hidden />
                </div>
              ) : (
                <div className={`grid gap-2 ${other ? 'grid-cols-2' : ''}`}>
                  {other && <div>{img(then, `${label}, ${formatDay(other.date)}`)}<div className="figure mt-1 text-[11px] text-fg3">{formatDay(other.date).split(',')[1]}</div></div>}
                  <div>{img(now, `${label}, ${formatDay(current.date)}`)}{other && <div className="figure mt-1 text-[11px] text-fg3">{formatDay(current.date).split(',')[1]}</div>}</div>
                </div>
              )}
            </figure>
          );
        })}
      </div>
    </section>
  );
}
