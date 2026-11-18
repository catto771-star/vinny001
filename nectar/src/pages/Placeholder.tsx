import { Hammer } from 'lucide-react';
import { Empty, PageHeader } from '../components/ui';

export default function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="card">
        <Empty icon={<Hammer size={18} strokeWidth={1.5} />}>Esta seção entra numa próxima fase. As tabelas dela já existem no banco</Empty>
      </div>
    </>
  );
}
