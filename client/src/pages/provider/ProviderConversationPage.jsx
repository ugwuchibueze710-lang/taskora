import { useParams } from 'react-router-dom';
import ConversationThread from '../../components/ConversationThread.jsx';

export default function ProviderConversationPage() {
  const { id } = useParams();
  return (
    <div>
      <h1 className="font-display text-2xl mb-4">Conversation</h1>
      <ConversationThread conversationId={id} />
    </div>
  );
}
