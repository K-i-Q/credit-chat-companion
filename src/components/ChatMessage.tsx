import { ChatMessage as ChatMessageType } from '@/lib/storage';

interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted text-foreground rounded-bl-md'
        }`}
      >
        <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">
          {message.content.split('\n').map((line, i) => {
            if (line.startsWith('**') && line.includes(':**')) {
              const parts = line.split(':**');
              const label = parts[0].replace(/\*\*/g, '');
              const rest = parts.slice(1).join(':**');
              return (
                <p key={i} className="mb-2">
                  <span className="font-semibold text-accent-foreground">{label}:</span>
                  {rest}
                </p>
              );
            }
            return <p key={i} className={line ? 'mb-1' : 'mb-2'}>{line}</p>;
          })}
        </div>
        <span className={`text-xs mt-2 block ${isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          {new Date(message.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};
