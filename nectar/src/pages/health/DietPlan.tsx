import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { num } from '../../lib/format';
import { Calendar, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { kcalFromMacros, nutrientsFor, shoppingList, sumNutrients, type DayTarget, type DayType } from '../../lib/nutrition';
import { gramsFromPercent, percentFromGrams } from '../../lib/diary';
import { formatDay, toDay, weekdayShort } from '../../lib/dates';
import {
  ACTIVITY_LEVELS,
  KETO_PRESETS,
  calculateBmr,
  computeKetoTargets,
  computeWeightGoalForecast,
  type ActivityLevel,
  type KetoPreset,
} from '../../lib/metabolism';
import { Empty, Field, Modal } from '../../components/ui';
import FoodSearch from './FoodSearch';
import { DEFAULT_WEIGHT_KG, type Health } from './useHealth';

const VIEWS = ['Metas', 'Metabolismo & Peso', 'Macro Scheduler', 'Refeições do plano', 'Lista de compras'] as const;

export default function DietPlan({ h }: { h: Health }) {
  const [view, setView] = useState<(typeof VIEWS)[number]>('Metas');
  if (!h.plan) return <CreatePlan h={h} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1">
        {VIEWS.map((v) => <button key={v} className={v === view ? 'tab-active' : 'tab'} onClick={() => setView(v)}>{v}</button>)}
      </div>
      {view === 'Metas' && <Targets h={h} />}
      {view === 'Metabolismo & Peso' && <MetabolicProfileView h={h} />}
      {view === 'Macro Scheduler' && <MacroSchedulerView h={h} />}
      {view === 'Refeições do plano' && <PlanMeals h={h} />}
      {view === 'Lista de compras' && <Shopping h={h} />}
    </>
  );
}

function CreatePlan({ h }: { h: Health }) {
  const [name, setName] = useState('Meu plano');
  return (
    <div className="card max-w-md">
      <p className="mb-3 text-sm text-fg2">Cadastre o plano nutricional: metas para dia de treino e de descanso, metabolismo, agenda semanal de macros e refeições.</p>
      <Field label="Nome do plano"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <button className="btn-primary" onClick={async () => {
        if (await write(supabase.from('diet_plans').insert({ name, is_active: true }))) void h.plans.reload();
      }}>Criar plano</button>
    </div>
  );
}

function Targets({ h }: { h: Health }) {
  const plan = h.plan!;
  const get = (t: DayType) => h.targets.rows.find((x) => x.plan_id === plan.id && x.day_type === t);
  const [ketoPreset, setKetoPreset] = useState<KetoPreset>('moderate');
  const [ketoKcal, setKetoKcal] = useState<number>(get('rest')?.kcal || 2000);

  const ketoPreview = useMemo(
    () =>
      computeKetoTargets({
        kcal: ketoKcal || 2000,
        weightKg: h.latestWeight ?? DEFAULT_WEIGHT_KG,
        bodyFatPct: h.latestBodyFatPct,
        preset: ketoPreset,
      }),
    [ketoKcal, h.latestWeight, h.latestBodyFatPct, ketoPreset],
  );

  async function applyKetoToRestAndTraining() {
    const ok1 = await write(supabase.from('diet_day_targets').upsert({ plan_id: plan.id, day_type: 'rest', ...ketoPreview }, { onConflict: 'plan_id,day_type' }));
    const ok2 = await write(supabase.from('diet_day_targets').upsert({ plan_id: plan.id, day_type: 'training', ...ketoPreview }, { onConflict: 'plan_id,day_type' }));
    if (ok1 || ok2) await h.targets.reload();
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TargetForm h={h} dayType="rest" current={get('rest')} />
      <TargetForm h={h} dayType="training" current={get('training')} />

      {/* Keto / Low-Carb Calculator */}
      <section className="card md:col-span-2">
        <div className="mb-1 font-medium">Calculadora Cetogênica / Low-Carb</div>
        <p className="mb-3 text-[13px] text-fg3">
          Calcula proteína pela sua massa magra ({num(h.latestWeight ?? DEFAULT_WEIGHT_KG)} kg{h.latestBodyFatPct ? ` · ${num(h.latestBodyFatPct)}% BF` : ''}), limita carboidratos líquidos e completa a energia com gorduras.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nível Low-Carb / Keto">
            <select className="input" value={ketoPreset} onChange={(e) => setKetoPreset(e.target.value as KetoPreset)}>
              {(Object.keys(KETO_PRESETS) as KetoPreset[]).map((k) => (
                <option key={k} value={k}>{KETO_PRESETS[k].label}</option>
              ))}
            </select>
          </Field>
          <Field label="Calorias alvo">
            <input className="input figure" type="number" min={1000} max={6000} value={ketoKcal} onChange={(e) => setKetoKcal(Number(e.target.value))} />
          </Field>
          <div className="flex items-end pb-4">
            <button type="button" className="btn-secondary w-full justify-center" onClick={() => void applyKetoToRestAndTraining()}>
              Aplicar ({ketoPreview.protein_g}P / {ketoPreview.carbs_g}C / {ketoPreview.fat_g}G)
            </button>
          </div>
        </div>
      </section>

      <WeekdayTargets h={h} />

      <div className="card md:col-span-2">
        <div className="label mb-2">Meta nos dias de treino</div>
        <label className="mb-1 flex items-start gap-2 text-sm">
          <input type="radio" name="mode" checked={plan.training_target_mode === 'fixed'} onChange={() => setMode(h, 'fixed')} />
          <span><strong>Fixa:</strong> usa a meta de dia de treino como cadastrada.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="mode" checked={plan.training_target_mode === 'dynamic'} onChange={() => setMode(h, 'dynamic')} />
          <span><strong>Ajustada pelo treino:</strong> parte da meta de descanso e soma as calorias gastas no treino e no cardio do dia, convertidas em carboidrato.</span>
        </label>
      </div>
    </div>
  );
}

/** Metabolic Profile (BMR Mifflin/Katch-McArdle, Baseline Activity, TEF, Hydration) + Weight Goal Forecast. */
function MetabolicProfileView({ h }: { h: Health }) {
  const p = h.profile;
  const [sex, setSex] = useState<'M' | 'F'>(p?.sex ?? 'M');
  const [heightCm, setHeightCm] = useState(String(p?.height_cm ?? '175'));
  const [birthDate, setBirthDate] = useState(p?.birth_date ?? '1996-01-01');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(p?.activity_level ?? 'lightly_active');
  const [customBmr, setCustomBmr] = useState(p?.custom_bmr ? String(p.custom_bmr) : '');
  const [includeTef, setIncludeTef] = useState(p?.include_tef ?? true);
  const [netCarbsMode, setNetCarbsMode] = useState(p?.net_carbs_mode ?? false);
  const [waterGoalMl, setWaterGoalMl] = useState(String(p?.water_goal_ml ?? 2500));
  const [waterCupMl, setWaterCupMl] = useState(String(p?.water_cup_ml ?? 250));
  const [targetWeightKg, setTargetWeightKg] = useState(p?.target_weight_kg ? String(p.target_weight_kg) : '');
  const [weeklyRateKg, setWeeklyRateKg] = useState(p?.weekly_rate_kg ? String(p.weekly_rate_kg) : '-0.5');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const today = toDay(new Date());
  const currentWeight = h.latestWeight ?? DEFAULT_WEIGHT_KG;

  const bmrInfo = useMemo(
    () =>
      calculateBmr({
        weightKg: currentWeight,
        heightCm: Number(heightCm) || null,
        sex,
        birthDate,
        bodyFatPct: h.latestBodyFatPct,
        customBmr: customBmr ? Number(customBmr) : null,
        asOfDate: today,
      }),
    [currentWeight, heightCm, sex, birthDate, h.latestBodyFatPct, customBmr, today],
  );

  const baselineKcal = Math.round(bmrInfo.bmr * ACTIVITY_LEVELS[activityLevel].factor);
  const maintenanceKcal = bmrInfo.bmr + baselineKcal;

  const forecast = useMemo(() => {
    const tw = Number(targetWeightKg);
    if (!tw || tw < 25) return null;
    return computeWeightGoalForecast({
      currentWeightKg: currentWeight,
      targetWeightKg: tw,
      weeklyRateKg: Number(weeklyRateKg) || -0.5,
      maintenanceKcal,
      today,
    });
  }, [currentWeight, targetWeightKg, weeklyRateKg, maintenanceKcal, today]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavedMsg(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const payload = {
      user_id: auth.user.id,
      sex,
      height_cm: Number(heightCm) || null,
      birth_date: birthDate || null,
      activity_level: activityLevel,
      custom_bmr: customBmr ? Number(customBmr) : null,
      include_tef: includeTef,
      net_carbs_mode: netCarbsMode,
      water_goal_ml: Math.max(500, Number(waterGoalMl) || 2500),
      water_cup_ml: Math.max(50, Number(waterCupMl) || 250),
      target_weight_kg: targetWeightKg ? Number(targetWeightKg) : null,
      weekly_rate_kg: weeklyRateKg ? Number(weeklyRateKg) : null,
    };
    if (await write(supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' }))) {
      await h.userSettings.reload();
      setSavedMsg('Perfil metabólico salvo.');
    }
  }

  async function applySuggestedCalories() {
    if (!forecast || !h.plan) return;
    const kcal = forecast.suggestedTargetKcal;
    const protein_g = Math.round(currentWeight * 1.8);
    const fat_g = Math.round((kcal * 0.27) / 9);
    const carbs_g = Math.max(30, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
    if (await write(supabase.from('diet_day_targets').upsert({ plan_id: h.plan.id, day_type: 'rest', kcal, protein_g, carbs_g, fat_g }, { onConflict: 'plan_id,day_type' }))) {
      await h.targets.reload();
      setSavedMsg(`Meta de ${kcal} kcal aplicada ao Dia de Descanso.`);
    }
  }

  return (
    <form onSubmit={saveProfile} className="grid gap-4 lg:grid-cols-2">
      <section className="card space-y-3">
        <div>
          <h3 className="font-medium text-fg">Taxa Metabólica Basal (TMB) & Gasto Diário</h3>
          <p className="text-xs text-fg3">
            Usa <strong>Katch-McArdle</strong> automaticamente quando você tem % de gordura em Corpo, ou <strong>Mifflin-St Jeor</strong>.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-raised/40 p-3 text-center">
          <div>
            <div className="text-[11px] text-fg3">TMB ({bmrInfo.formula === 'katch_mcardle' ? 'Katch-McArdle' : bmrInfo.formula === 'custom' ? 'Manual' : 'Mifflin'})</div>
            <div className="figure mt-0.5 text-base font-medium text-fg">{num(bmrInfo.bmr)} kcal</div>
          </div>
          <div className="border-x border-line">
            <div className="text-[11px] text-fg3">Atividade basal</div>
            <div className="figure mt-0.5 text-base font-medium text-fg">+{num(baselineKcal)} kcal</div>
          </div>
          <div>
            <div className="text-[11px] text-fg3">Manutenção base</div>
            <div className="figure mt-0.5 text-base font-medium text-fg">{num(maintenanceKcal)} kcal</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Sexo biológico">
            <select className="input" value={sex} onChange={(e) => setSex(e.target.value as 'M' | 'F')}>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </Field>
          <Field label="Altura (cm)">
            <input className="input figure" type="number" min={100} max={250} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
          </Field>
          <Field label="Nascimento">
            <input className="input" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Nível de atividade fora dos treinos">
          <select className="input" value={activityLevel} onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}>
            {(Object.keys(ACTIVITY_LEVELS) as ActivityLevel[]).map((lvl) => (
              <option key={lvl} value={lvl}>
                {ACTIVITY_LEVELS[lvl].label} — {ACTIVITY_LEVELS[lvl].description}
              </option>
            ))}
          </select>
        </Field>

        <Field label="TMB manual kcal (opcional — deixe vazio para cálculo automático)">
          <input className="input figure" type="number" min={800} max={5000} placeholder={`${bmrInfo.bmr} kcal`} value={customBmr} onChange={(e) => setCustomBmr(e.target.value)} />
        </Field>

        <label className="flex items-center gap-2 text-xs text-fg2">
          <input type="checkbox" checked={includeTef} onChange={(e) => setIncludeTef(e.target.checked)} />
          Somar Efeito Térmico dos Alimentos (TEF) no gasto calórico diário
        </label>
        <label className="flex items-center gap-2 text-xs text-fg2">
          <input type="checkbox" checked={netCarbsMode} onChange={(e) => setNetCarbsMode(e.target.checked)} />
          Rastrear Carboidratos Líquidos (Total − Fibras) por padrão no Diário
        </label>
      </section>

      <section className="card flex flex-col space-y-3">
        <div>
          <h3 className="font-medium text-fg">Meta de Peso, Previsão (`Goal Forecast`) & Água</h3>
          <p className="text-xs text-fg3">
            Peso atual: <strong className="figure text-fg2">{num(currentWeight)} kg</strong>{bmrInfo.leanMassKg ? ` · Massa magra: ${num(bmrInfo.leanMassKg)} kg` : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Peso meta (kg)">
            <input className="input figure" type="number" min={30} max={350} step="0.1" placeholder="Ex.: 94.0" value={targetWeightKg} onChange={(e) => setTargetWeightKg(e.target.value)} />
          </Field>
          <Field label="Ritmo semanal (kg/sem)">
            <input className="input figure" type="number" min={-2} max={2} step="0.1" value={weeklyRateKg} onChange={(e) => setWeeklyRateKg(e.target.value)} />
          </Field>
        </div>

        {forecast && (
          <div className="rounded-xl border border-line bg-raised/50 p-3.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs text-fg3">
                <Calendar size={14} strokeWidth={1.5} /> Previsão da meta
              </span>
              <span className="font-medium text-fg">
                {forecast.forecastDate ? formatDay(forecast.forecastDate) : 'Meta atingida'}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-fg2">
              <span>
                Variação: <strong className="figure">{forecast.deltaKg > 0 ? '+' : ''}{num(forecast.deltaKg)} kg</strong> ({forecast.daysToGoal} dias · {forecast.dailyKcalAdjustment > 0 ? '+' : ''}{num(forecast.dailyKcalAdjustment)} kcal/dia)
              </span>
              <button type="button" className="btn-secondary h-7 px-2.5 text-xs" onClick={() => void applySuggestedCalories()}>
                Usar {num(forecast.suggestedTargetKcal)} kcal
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Field label="Meta diária de água (mL)">
            <input className="input figure" type="number" min={500} max={10000} step={100} value={waterGoalMl} onChange={(e) => setWaterGoalMl(e.target.value)} />
          </Field>
          <Field label="Tamanho de 1 copo rápido (mL)">
            <input className="input figure" type="number" min={50} max={1500} step={50} value={waterCupMl} onChange={(e) => setWaterCupMl(e.target.value)} />
          </Field>
        </div>

        {savedMsg && <p className="text-xs text-positive">{savedMsg}</p>}
        <button className="btn-primary mt-auto w-full justify-center">Salvar configurações metabólicas</button>
      </section>
    </form>
  );
}

/** Named Macro Scheduler templates assigned to specific weekdays. */
function MacroSchedulerView({ h }: { h: Health }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [macros, setMacros] = useState<DayTarget>({ kcal: 2200, protein_g: 160, carbs_g: 240, fat_g: 65 });
  const [weekdays, setWeekdays] = useState<number[]>([]);

  function toggleWd(wd: number) {
    setWeekdays((prev) => (prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd].sort()));
  }

  async function saveTemplate(e: FormEvent) {
    e.preventDefault();
    const kcal = macros.kcal > 0 ? macros.kcal : kcalFromMacros(macros);
    if (await write(supabase.from('macro_templates').insert({ name: name.trim(), ...macros, kcal, weekdays }))) {
      setCreating(false);
      setName('');
      setWeekdays([]);
      await h.macroTemplates.reload();
    }
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-medium text-fg">Macro Scheduler · Templates da Semana</h3>
            <p className="text-xs text-fg3">
              Crie perfis reutilizáveis (ex.: <em>High Carb / Pernas</em>, <em>Low Carb / Descanso</em>, <em>Refeed Sábado</em>) e vincule aos dias da semana.
            </p>
          </div>
          <button type="button" className="btn-primary text-xs" onClick={() => setCreating(true)}>
            <Plus size={16} strokeWidth={1.5} /> Novo template
          </button>
        </div>

        {!h.macroTemplates.rows.length ? (
          <Empty>Nenhum template criado. Clique em Novo template para agendar macros na semana.</Empty>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {h.macroTemplates.rows.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-fg">{t.name}</div>
                  <div className="figure text-xs text-fg3">
                    {num(t.kcal)} kcal · P {t.protein_g} g · C {t.carbs_g} g · G {t.fat_g} g
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
                    const active = t.weekdays?.includes(wd);
                    return (
                      <button
                        key={wd}
                        type="button"
                        onClick={async () => {
                          const next = active ? t.weekdays.filter((x) => x !== wd) : [...(t.weekdays ?? []), wd];
                          if (await write(supabase.from('macro_templates').update({ weekdays: next }).eq('id', t.id))) {
                            void h.macroTemplates.reload();
                          }
                        }}
                        className={`rounded border px-2 py-0.5 text-xs ${
                          active ? 'border-brand bg-raised font-medium text-fg' : 'border-line text-fg3 hover:text-fg2'
                        }`}
                      >
                        {weekdayShort(wd)}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="text-fg3 hover:text-negative"
                  aria-label={`Excluir template ${t.name}`}
                  onClick={async () => {
                    if (await write(supabase.from('macro_templates').delete().eq('id', t.id))) {
                      void h.macroTemplates.reload();
                    }
                  }}
                >
                  <Trash2 size={15} strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {creating && (
        <Modal title="Novo template de macros" onClose={() => setCreating(false)}>
          <form onSubmit={saveTemplate}>
            <Field label="Nome do template">
              <input className="input" placeholder="Ex.: High Carb · Treino Inferior" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </Field>
            <MacroEditor value={macros} onChange={setMacros} idSuffix="template" />
            <div className="mb-4">
              <div className="label mb-1.5">Dias da semana ativos</div>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                  <button
                    key={wd}
                    type="button"
                    onClick={() => toggleWd(wd)}
                    className={`rounded-md border px-2.5 py-1 text-xs ${
                      weekdays.includes(wd) ? 'border-brand bg-raised text-fg font-medium' : 'border-line text-fg3'
                    }`}
                  >
                    {WEEKDAY_FULL[wd]}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-primary w-full justify-center">Salvar template</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

async function setMode(h: Health, mode: 'fixed' | 'dynamic') {
  h.plans.setRows((rows) => rows.map((p) => (p.id === h.plan!.id ? { ...p, training_target_mode: mode } : p)));
  if (await write(supabase.from('diet_plans').update({ training_target_mode: mode }).eq('id', h.plan!.id))) void h.plans.reload();
}

/** Calories and macros, entered in grams or as a percentage of the calories. */
export function MacroEditor({ value, onChange, idSuffix }: { value: DayTarget; onChange: (v: DayTarget) => void; idSuffix: string }) {
  const [mode, setMode] = useState<'g' | '%'>('g');
  const pct = percentFromGrams(value);
  const [p, setP] = useState(pct);
  const fromMacros = kcalFromMacros(value);
  const setPct = (next: typeof pct) => { setP(next); onChange({ ...value, ...gramsFromPercent(value.kcal, next) }); };
  const g = (k: 'protein_g' | 'carbs_g' | 'fat_g', label: string) => (
    <Field label={label}><input className="input" type="number" min={0} aria-label={`${label} (${idSuffix})`} value={value[k]} onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })} /></Field>
  );
  const pc = (k: keyof typeof pct, label: string) => (
    <Field label={`${label} (%)`}><input className="input" type="number" min={0} max={100} aria-label={`${label} % (${idSuffix})`} value={p[k]} onChange={(e) => setPct({ ...p, [k]: Number(e.target.value) })} /></Field>
  );
  return (
    <>
      <div className="mb-3 flex items-end gap-3">
        <div className="flex-1"><Field label="Calorias"><input className="input" type="number" min={0} aria-label={`Calorias (${idSuffix})`} value={value.kcal} onChange={(e) => onChange({ ...value, kcal: Number(e.target.value), ...(mode === '%' ? gramsFromPercent(Number(e.target.value), p) : {}) })} /></Field></div>
        <div className="segmented mb-4">
          {(['g', '%'] as const).map((m) => <button type="button" key={m} className={m === mode ? 'tab-active' : 'tab'} onClick={() => { setMode(m); if (m === '%') setP(percentFromGrams(value)); }}>{m === 'g' ? 'Gramas' : '%'}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {mode === 'g'
          ? <>{g('protein_g', 'Proteína (g)')}{g('carbs_g', 'Carboidrato (g)')}{g('fat_g', 'Gordura (g)')}</>
          : <>{pc('protein', 'Proteína')}{pc('carbs', 'Carboidrato')}{pc('fat', 'Gordura')}</>}
      </div>
      <p className="mb-3 text-xs text-fg3">
        {mode === '%' ? `${value.protein_g} g de proteína, ${value.carbs_g} g de carboidrato e ${value.fat_g} g de gordura${p.protein + p.carbs + p.fat !== 100 ? ` · os percentuais somam ${p.protein + p.carbs + p.fat}%` : ''}`
          : `Os macros somam ${num(fromMacros)} kcal${value.kcal && Math.abs(value.kcal - fromMacros) > 50 ? `, diferente das ${num(value.kcal)} kcal informadas` : ''}`}
      </p>
    </>
  );
}

function TargetForm({ h, dayType, current }: { h: Health; dayType: DayType; current?: DayTarget }) {
  const [v, setV] = useState<DayTarget>({ kcal: current?.kcal ?? 0, protein_g: current?.protein_g ?? 0, carbs_g: current?.carbs_g ?? 0, fat_g: current?.fat_g ?? 0 });
  useEffect(() => { if (current) setV({ kcal: current.kcal, protein_g: current.protein_g, carbs_g: current.carbs_g, fat_g: current.fat_g }); }, [current?.kcal, current?.protein_g, current?.carbs_g, current?.fat_g]);
  async function save() {
    const kcal = v.kcal > 0 ? v.kcal : kcalFromMacros(v);
    if (kcal <= 0) return alert('Informe as calorias ou os macros');
    if (await write(supabase.from('diet_day_targets').upsert({ plan_id: h.plan!.id, day_type: dayType, ...v, kcal }, { onConflict: 'plan_id,day_type' }))) void h.targets.reload();
  }
  return (
    <div className="card">
      <div className="mb-3 font-medium">{dayType === 'rest' ? 'Dia de descanso' : 'Dia de treino'}</div>
      <MacroEditor value={v} onChange={setV} idSuffix={dayType === 'rest' ? 'descanso' : 'treino'} />
      <button className="btn-primary" onClick={save}>Salvar meta</button>
    </div>
  );
}

const WEEKDAY_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function WeekdayTargets({ h }: { h: Health }) {
  const [editing, setEditing] = useState<number | null>(null);
  const plan = h.plan!;
  const rows = h.weekdayTargets.rows.filter((t) => t.plan_id === plan.id);
  return (
    <section className="card md:col-span-2">
      <div className="mb-1 font-medium">Metas fixas por dia da semana</div>
      <p className="mb-4 text-[13px] text-fg3">Opcional. Um dia com meta própria ignora a de treino ou descanso; os outros seguem as metas acima</p>
      <ul className="divide-y divide-line">
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
          const t = rows.find((r) => r.weekday === wd);
          return (
            <li key={wd} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-24">{WEEKDAY_FULL[wd]}</span>
              <span className="mr-auto text-fg3">
                {t ? <><span className="figure text-fg">{num(t.kcal)}</span> kcal · P {t.protein_g} · C {t.carbs_g} · G {t.fat_g}</> : 'segue treino ou descanso'}
              </span>
              <button className="btn-ghost" onClick={() => setEditing(wd)} aria-label={`Editar meta de ${WEEKDAY_FULL[wd]}`}>{t ? 'Editar' : 'Definir'}</button>
            </li>
          );
        })}
      </ul>
      {editing !== null && <WeekdayForm h={h} weekday={editing} current={rows.find((r) => r.weekday === editing)} onClose={() => setEditing(null)} />}
    </section>
  );
}

function WeekdayForm({ h, weekday, current, onClose }: { h: Health; weekday: number; current?: DayTarget; onClose: () => void }) {
  const fallback = h.targets.rows.find((t) => t.plan_id === h.plan!.id && t.day_type === 'rest');
  const [v, setV] = useState<DayTarget>(current ?? (fallback ? { kcal: fallback.kcal, protein_g: fallback.protein_g, carbs_g: fallback.carbs_g, fat_g: fallback.fat_g } : { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 }));
  async function save() {
    const kcal = v.kcal > 0 ? v.kcal : kcalFromMacros(v);
    if (await write(supabase.from('diet_weekday_targets').upsert({ plan_id: h.plan!.id, weekday, ...v, kcal }, { onConflict: 'plan_id,weekday' }))) { await h.weekdayTargets.reload(); onClose(); }
  }
  async function clear() {
    if (await write(supabase.from('diet_weekday_targets').delete().eq('plan_id', h.plan!.id).eq('weekday', weekday))) { await h.weekdayTargets.reload(); onClose(); }
  }
  return (
    <Modal title={`Meta de ${WEEKDAY_FULL[weekday].toLowerCase()} (${weekdayShort(weekday)})`} onClose={onClose}>
      <MacroEditor value={v} onChange={setV} idSuffix={WEEKDAY_FULL[weekday].toLowerCase()} />
      <div className="flex gap-2">
        {current && <button className="btn-ghost" onClick={clear}>Remover meta do dia</button>}
        <button className="btn-primary ml-auto" onClick={save}>Salvar</button>
      </div>
    </Modal>
  );
}

function PlanMeals({ h }: { h: Health }) {
  const plan = h.plan!;
  const meals = h.meals.rows.filter((m) => m.plan_id === plan.id);
  const [adding, setAdding] = useState<string | null>(null);
  const [newMeal, setNewMeal] = useState(false);
  const day = sumNutrients(h.items.rows.filter((i) => meals.some((m) => m.id === i.meal_id) && i.food).map((i) => nutrientsFor(i.food!, i.quantity_g)));
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-fg3">Plano por dia: {num(day.kcal)} kcal · P {num(day.protein_g)} g · C {num(day.carbs_g)} g · G {num(day.fat_g)} g</span>
        <button className="btn-primary ml-auto" onClick={() => setNewMeal(true)}><Plus size={16} strokeWidth={1.5} />Refeição</button>
      </div>
      {!meals.length && <div className="card"><Empty>Nenhuma refeição no plano ainda.</Empty></div>}
      {meals.map((m) => {
        const items = h.items.rows.filter((i) => i.meal_id === m.id);
        return (
          <section key={m.id} className="card mb-3">
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="font-medium">{m.name}</h3>
              {m.time_of_day && <span className="text-xs text-fg3">{m.time_of_day.slice(0, 5)}</span>}
              <button className="btn-ghost ml-auto" onClick={() => setAdding(m.id)}><Plus size={16} strokeWidth={1.5} />Alimento</button>
              <button className="text-xs text-negative" onClick={async () => {
                if (confirm(`Excluir a refeição ${m.name}?`) && await write(supabase.from('diet_plan_meals').delete().eq('id', m.id))) { void h.meals.reload(); void h.items.reload(); }
              }}>excluir</button>
            </div>
            <ul className="text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex gap-2 border-t border-line py-1.5">
                  <span className="mr-auto">{i.food?.name} <span className="text-fg3">· {num(i.quantity_g)} g</span></span>
                  {i.food && <span className="text-xs text-fg3">{nutrientsFor(i.food, i.quantity_g).kcal} kcal</span>}
                  <button className="text-fg3 hover:text-negative" aria-label={`Remover ${i.food?.name}`} onClick={async () => {
                    if (await write(supabase.from('diet_plan_items').delete().eq('id', i.id))) void h.items.reload();
                  }}><X size={16} strokeWidth={1.5} /></button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {adding && (
        <FoodSearch title="Adicionar ao plano" favoriteIds={h.favoriteIds} onClose={() => setAdding(null)} onPick={async (food, grams) => {
          if (await write(supabase.from('diet_plan_items').insert({ meal_id: adding, food_id: food.id, quantity_g: grams }))) { setAdding(null); void h.items.reload(); }
        }} />
      )}
      {newMeal && <MealForm onClose={() => setNewMeal(false)} onSave={async (name, time) => {
        if (await write(supabase.from('diet_plan_meals').insert({ plan_id: plan.id, name, time_of_day: time || null, order_index: meals.length }))) { setNewMeal(false); void h.meals.reload(); }
      }} />}
    </>
  );
}

function MealForm({ onClose, onSave }: { onClose: () => void; onSave: (name: string, time: string) => void }) {
  const [name, setName] = useState('');
  const [time, setTime] = useState('');
  return (
    <Modal title="Nova refeição do plano" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(name, time); }}>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Café da manhã" required autoFocus /></Field>
        <Field label="Horário (opcional)"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <button className="btn-primary w-full justify-center">Salvar</button>
      </form>
    </Modal>
  );
}

const CHECKS_KEY = 'painel.shopping.checked';

function Shopping({ h }: { h: Health }) {
  const [days, setDays] = useState(7);
  const [checked, setChecked] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CHECKS_KEY) ?? '[]')); } catch { return new Set(); }
  });
  const meals = new Set(h.meals.rows.filter((m) => m.plan_id === h.plan!.id).map((m) => m.id));
  const items = h.items.rows.filter((i) => meals.has(i.meal_id));
  const foods = new Map(items.filter((i) => i.food).map((i) => [i.food_id, { id: i.food_id, name: i.food!.name }]));
  const list = shoppingList(items, foods, days);
  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
    try { localStorage.setItem(CHECKS_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
  }
  const fmt = (g: number) => (g >= 1000 ? `${num(g / 1000, 2)} kg` : `${num(g)} g`);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm">Comprar para</span>
        <input className="input w-20" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value)))} aria-label="Dias" />
        <span className="text-sm">dias</span>
        <button className="btn-ghost ml-auto" onClick={() => { setChecked(new Set()); try { localStorage.removeItem(CHECKS_KEY); } catch { /* ignore */ } }}>desmarcar tudo</button>
      </div>
      {!list.length ? <div className="card"><Empty>Monte as refeições do plano para gerar a lista.</Empty></div> : (
        <ul className="card divide-y divide-line p-0">
          {list.map((i) => (
            <li key={i.food_id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={checked.has(i.food_id)} onChange={() => toggle(i.food_id)} aria-label={`Comprado: ${i.name}`} />
              <span className={`mr-auto ${checked.has(i.food_id) ? 'text-fg3 line-through' : ''}`}>{i.name}</span>
              <span className="text-fg3">{fmt(i.grams)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-fg3">Quantidades em peso dos alimentos como cadastrados no plano (cru ou cozido, conforme a tabela escolhida).</p>
    </>
  );
}
