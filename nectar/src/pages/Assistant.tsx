import { PageHeader } from '../components/ui';
import { AssistantWorkspace } from '../components/AssistantWorkspace';

export default function Assistant() {
  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col md:h-[calc(100dvh-7.5rem)]">
      <PageHeader
        title="Assistente"
        subtitle="Conversas, memória contínua e ações diretas nos seus dados"
      />
      <AssistantWorkspace mode="page" />
    </div>
  );
}
