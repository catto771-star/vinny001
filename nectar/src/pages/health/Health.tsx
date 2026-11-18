import { useState } from 'react';
import { formatDay, toDay } from '../../lib/dates';
import { PageHeader } from '../../components/ui';
import { useHealth } from './useHealth';
import Today from './Today';
import Training from './Training';
import Diet from './Diet';
import DietPlan from './DietPlan';
import Dashboard from './Dashboard';
import Body from './Body';

const TABS = ['Hoje', 'Treino', 'Dieta', 'Plano', 'Corpo', 'Painel'] as const;
type Tab = (typeof TABS)[number];

export default function Health() {
  const [tab, setTab] = useState<Tab>('Hoje');
  const h = useHealth();
  const error = [h.exercises, h.workouts, h.sets, h.foodLogs, h.plans].find((t) => t.error)?.error;
  return (
    <>
      <PageHeader title="Saúde" subtitle={formatDay(toDay(new Date()))} tabs={TABS} tab={tab} onTab={(t) => setTab(t as Tab)} />
      {error && <p className="mb-4 text-sm text-negative">{error}</p>}
      {tab === 'Hoje' && <Today h={h} onGo={setTab} />}
      {tab === 'Treino' && <Training h={h} />}
      {tab === 'Dieta' && <Diet h={h} />}
      {tab === 'Plano' && <DietPlan h={h} />}
      {tab === 'Corpo' && <Body h={h} />}
      {tab === 'Painel' && <Dashboard h={h} />}
    </>
  );
}
