import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calculator, Camera, ImagePlus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay, toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { BODY_METRICS, navyBodyFat, navyWaist } from '../../lib/body';
import { fitWithin, photoPath } from '../../lib/photos';
import { Field, FieldGroup } from '../../components/ui';
export const POSES = [
    { key: 'front', label: 'Frente', hint: 'De frente, braços soltos ao lado do corpo' },
    { key: 'side', label: 'Lado', hint: 'Lado direito, braços à frente ou cruzados' },
    { key: 'back', label: 'Costas', hint: 'De costas, braços soltos' },
];
const I = { size: 16, strokeWidth: 1.5 };
/** Signed links to private photos, valid for an hour. */
export function usePhotoUrls(paths) {
    const [urls, setUrls] = useState({});
    const key = paths.join('|');
    useEffect(() => {
        if (!paths.length) {
            setUrls({});
            return;
        }
        void supabase.storage.from('body-photos').createSignedUrls(paths, 3600).then(({ data }) => {
            setUrls(Object.fromEntries((data ?? []).map((d, i) => [paths[i], d.signedUrl ?? ''])));
        });
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
    return urls;
}
/** A phone photo down to 1600 px as JPEG; the original when it cannot be read (e.g. HEIC on Chrome). */
async function shrink(file) {
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const size = fitWithin(bitmap.width, bitmap.height);
        if (size.width === bitmap.width && file.size < 1_500_000)
            return { blob: file, name: file.name, type: file.type };
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, size.width, size.height);
        const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
        return blob ? { blob, name: 'foto.jpg', type: 'image/jpeg' } : { blob: file, name: file.name, type: file.type };
    }
    catch {
        return { blob: file, name: file.name, type: file.type || 'image/jpeg' };
    }
}
/**
 * A whole page for an assessment, new or existing: date and profile,
 * measurements, the three photos (with the last assessment's as a guide to
 * repeat the pose) and notes. Photos are sent together when saving.
 */
export default function AssessmentPage({ h, editId, onDone }) {
    const existing = editId ? h.assessments.rows.find((a) => a.id === editId) ?? null : null;
    const existingValues = useMemo(() => Object.fromEntries(h.measurements.rows.filter((m) => existing && m.assessment_id === existing.id).map((m) => [m.metric, String(m.value)])), [existing, h.measurements.rows]);
    const existingPhotos = h.bodyPhotos.rows.filter((p) => existing && p.assessment_id === existing.id);
    // The latest other assessment that has photos: its pictures guide the pose.
    const guideAssessment = h.assessments.rows
        .filter((a) => a.id !== existing?.id && h.bodyPhotos.rows.some((p) => p.assessment_id === a.id))
        .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
    const guidePhotos = guideAssessment ? h.bodyPhotos.rows.filter((p) => p.assessment_id === guideAssessment.id) : [];
    const urls = usePhotoUrls([...existingPhotos, ...guidePhotos].map((p) => p.storage_path));
    const [date, setDate] = useState(existing?.date ?? toDay(new Date()));
    const [values, setValues] = useState(existingValues);
    const [notes, setNotes] = useState(existing?.notes ?? '');
    const [height, setHeight] = useState(h.profile?.height_cm?.toString() ?? '');
    const [sex, setSex] = useState(h.profile?.sex ?? '');
    const [picks, setPicks] = useState({});
    const [busy, setBusy] = useState(null);
    useEffect(() => () => { for (const p of Object.values(picks))
        if (p && p !== 'remove')
            URL.revokeObjectURL(p.preview); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const v = (k) => (values[k] ? Number(values[k]) : undefined);
    const navy = navyBodyFat({ sex: sex || null, height_cm: height ? Number(height) : null, neck_cm: v('neck_cm'), waist_cm: navyWaist(sex || null, { waist_cm: v('waist_cm'), abdomen_cm: v('abdomen_cm') }), hip_cm: v('hip_cm') });
    const photoCount = POSES.filter(({ key }) => { const p = picks[key]; return p ? p !== 'remove' : existingPhotos.some((x) => x.pose === key); }).length;
    function choose(pose, file) {
        setPicks((p) => {
            const old = p[pose];
            if (old && old !== 'remove')
                URL.revokeObjectURL(old.preview);
            return { ...p, [pose]: { file, preview: URL.createObjectURL(file) } };
        });
    }
    function drop(pose) {
        setPicks((p) => {
            const old = p[pose];
            if (old && old !== 'remove')
                URL.revokeObjectURL(old.preview);
            const next = { ...p };
            if (existingPhotos.some((x) => x.pose === pose))
                next[pose] = 'remove';
            else
                delete next[pose];
            return next;
        });
    }
    async function save(e) {
        e.preventDefault();
        const filled = BODY_METRICS.filter((m) => values[m.key]);
        if (!filled.length && !photoCount) {
            alert('Preencha pelo menos uma medida ou adicione uma foto');
            return;
        }
        setBusy('Salvando a avaliação…');
        if (height || sex) {
            await supabase.from('user_settings').upsert({ height_cm: height ? Number(height) : null, sex: sex || null }, { onConflict: 'user_id' });
            void h.userSettings.reload();
        }
        let id = existing?.id ?? null;
        if (existing) {
            if (!await write(supabase.from('body_assessments').update({ date, notes: notes || null }).eq('id', existing.id))) {
                setBusy(null);
                return;
            }
            await write(supabase.from('body_measurements').delete().eq('assessment_id', existing.id));
        }
        else {
            const { data, error } = await supabase.from('body_assessments').insert({ date, notes: notes || null }).select('id').single();
            if (error || !data) {
                setBusy(null);
                alert(`Não foi possível salvar: ${error?.message}`);
                return;
            }
            id = data.id;
        }
        const [y, mo, d] = date.split('-').map(Number);
        const measured_at = new Date(y, mo - 1, d, 8).toISOString();
        if (filled.length) {
            await write(supabase.from('body_measurements').insert(filled.map((m) => ({ assessment_id: id, metric: m.key, value: Number(values[m.key]), measured_at, source: 'avaliação' }))));
        }
        const failed = [];
        const { data: auth } = await supabase.auth.getUser();
        for (const { key, label } of POSES) {
            const pick = picks[key];
            if (!pick)
                continue;
            const old = existingPhotos.find((p) => p.pose === key);
            if (pick !== 'remove') {
                setBusy(`Enviando a foto de ${label.toLowerCase()}…`);
                const small = await shrink(pick.file);
                const path = photoPath(auth.user.id, date, key, small.name, crypto.randomUUID());
                const { error } = await supabase.storage.from('body-photos').upload(path, small.blob, { contentType: small.type });
                if (error) {
                    failed.push(label);
                    continue;
                }
                if (old) {
                    await supabase.storage.from('body-photos').remove([old.storage_path]);
                    await supabase.from('body_photos').delete().eq('id', old.id);
                }
                await write(supabase.from('body_photos').insert({ assessment_id: id, pose: key, storage_path: path }));
            }
            else if (old) {
                await supabase.storage.from('body-photos').remove([old.storage_path]);
                await supabase.from('body_photos').delete().eq('id', old.id);
            }
        }
        await Promise.all([h.assessments.reload(), h.measurements.reload(), h.bodyPhotos.reload()]);
        setBusy(null);
        if (failed.length)
            alert(`A avaliação foi salva, mas não deu para enviar: ${failed.join(', ')}. Abra a avaliação e tente de novo.`);
        onDone(id);
    }
    return (_jsxs("form", { onSubmit: save, className: "mx-auto max-w-3xl pb-24", children: [_jsxs("button", { type: "button", className: "btn-ghost -ml-2 mb-2", onClick: () => onDone(existing?.id ?? null), children: [_jsx(ArrowLeft, { ...I }), "Avalia\u00E7\u00F5es"] }), _jsx("h1", { className: "display mb-8", children: existing ? `Avaliação de ${formatDay(existing.date)}` : 'Nova avaliação' }), _jsxs("section", { className: "card mb-6", "aria-label": "Dados", children: [_jsx("div", { className: "label mb-3", children: "Dados" }), _jsxs("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-3", children: [_jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: date, max: toDay(new Date()), onChange: (e) => setDate(e.target.value), required: true }) }), _jsx(Field, { label: "Altura (cm)", children: _jsx("input", { className: "input", type: "number", min: 100, max: 250, value: height, onChange: (e) => setHeight(e.target.value) }) }), _jsx("div", { className: "col-span-2 sm:col-span-1", children: _jsx(FieldGroup, { label: "Sexo (c\u00E1lculo de gordura)", children: _jsx("div", { className: "segmented", children: [['M', 'Masculino'], ['F', 'Feminino']].map(([k, l]) => _jsx("button", { type: "button", "aria-pressed": sex === k, className: sex === k ? 'tab-active' : 'tab', onClick: () => setSex(k), children: l }, k)) }) }) })] })] }), _jsxs("section", { className: "card mb-6", "aria-label": "Fotos", children: [_jsxs("div", { className: "mb-1 flex items-baseline gap-2", children: [_jsx("div", { className: "label mr-auto", children: "Fotos" }), _jsxs("span", { className: "figure text-xs text-fg3", children: [photoCount, "/3"] })] }), _jsxs("p", { className: "mb-4 text-[13px] text-fg3", children: ["Mesma luz, mesma dist\u00E2ncia e roupa justa em todas as avalia\u00E7\u00F5es: \u00E9 isso que torna a compara\u00E7\u00E3o justa.", guideAssessment ? ` A miniatura mostra a pose de ${formatDay(guideAssessment.date)}.` : ''] }), _jsx("div", { className: "grid gap-4 sm:grid-cols-3", children: POSES.map(({ key, label, hint }) => {
                            const pick = picks[key];
                            const saved = existingPhotos.find((p) => p.pose === key);
                            const src = pick && pick !== 'remove' ? pick.preview : pick === 'remove' ? null : saved ? urls[saved.storage_path] : null;
                            const guide = guidePhotos.find((p) => p.pose === key);
                            return (_jsxs("div", { children: [_jsxs("div", { className: "mb-2 flex items-center gap-2", children: [_jsx("span", { className: "mr-auto text-sm", children: label }), src && _jsx("button", { type: "button", className: "icon-btn h-7 w-7", "aria-label": `Remover foto de ${label.toLowerCase()}`, onClick: () => drop(key), children: _jsx(Trash2, { size: 14, strokeWidth: 1.5 }) })] }), _jsxs("label", { className: "relative block cursor-pointer", children: [src
                                                ? _jsx("img", { src: src, alt: `Foto de ${label.toLowerCase()}`, className: "aspect-[3/4] w-full rounded-xl object-cover" })
                                                : (_jsxs("span", { className: "flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-3 text-center text-fg3 transition-colors duration-150 hover:bg-raised/50", children: [_jsx(ImagePlus, { size: 20, strokeWidth: 1.5 }), _jsx("span", { className: "text-sm text-fg2", children: "Tirar ou escolher foto" }), _jsx("span", { className: "text-xs", children: hint })] })), guide && urls[guide.storage_path] && (_jsx("img", { src: urls[guide.storage_path], alt: `Pose anterior de ${label.toLowerCase()}`, className: "absolute right-2 bottom-2 w-14 rounded-md border border-line object-cover opacity-90 shadow" })), _jsx("input", { type: "file", accept: "image/*", capture: "environment", className: "sr-only", "aria-label": `Foto de ${label.toLowerCase()}`, onChange: (e) => { const f = e.target.files?.[0]; if (f)
                                                    choose(key, f); e.target.value = ''; } })] }), src && _jsxs("label", { className: "btn-ghost mt-2 w-full cursor-pointer justify-center text-sm", children: [_jsx(Camera, { size: 14, strokeWidth: 1.5 }), "Trocar", _jsx("input", { type: "file", accept: "image/*", capture: "environment", className: "sr-only", "aria-label": `Trocar foto de ${label.toLowerCase()}`, onChange: (e) => { const f = e.target.files?.[0]; if (f)
                                                    choose(key, f); e.target.value = ''; } })] })] }, key));
                        }) })] }), _jsxs("section", { className: "card mb-6", "aria-label": "Medidas", children: [_jsx("div", { className: "label mb-3", children: "Medidas" }), _jsx("div", { className: "grid grid-cols-2 gap-x-3 sm:grid-cols-3", children: BODY_METRICS.map((m) => (_jsx(Field, { label: `${m.label} (${m.unit})`, children: _jsx("input", { className: "input", type: "number", min: 0, step: "0.1", inputMode: "decimal", value: values[m.key] ?? '', onChange: (e) => setValues({ ...values, [m.key]: e.target.value }) }) }, m.key))) }), navy !== null && (_jsxs("button", { type: "button", className: "btn-secondary w-full", onClick: () => setValues({ ...values, body_fat_pct: String(navy) }), children: [_jsx(Calculator, { ...I }), "Usar ", num(navy), "% de gordura (m\u00E9todo da Marinha americana)"] }))] }), _jsx("section", { className: "card mb-6", "aria-label": "Observa\u00E7\u00F5es", children: _jsx(Field, { label: "Observa\u00E7\u00F5es", children: _jsx("textarea", { className: "input h-24 py-2", value: notes, onChange: (e) => setNotes(e.target.value), placeholder: "Como est\u00E1 o treino, a dieta, o sono\u2026" }) }) }), _jsx("div", { className: "fixed inset-x-0 bottom-16 z-20 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60", children: _jsxs("div", { className: "mx-auto flex max-w-3xl items-center gap-3", children: [_jsx("span", { className: "mr-auto text-sm text-fg3", "aria-live": "polite", children: busy ?? `${Object.values(values).filter(Boolean).length} medidas · ${photoCount} fotos` }), _jsx("button", { type: "button", className: "btn-ghost", onClick: () => onDone(existing?.id ?? null), disabled: !!busy, children: "Cancelar" }), _jsx("button", { className: "btn-primary", disabled: !!busy, children: busy ? 'Salvando…' : 'Salvar avaliação' })] }) })] }));
}
