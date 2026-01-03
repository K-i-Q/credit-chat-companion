import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { ChatMessage as ChatMessageType } from '@/lib/storage';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const canCopy = !isUser && Boolean(message.content?.trim());

  const handleCopy = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success('Resposta copiada.');
    } catch (_error) {
      toast.error('Não foi possível copiar.');
    }
  };
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted text-foreground rounded-bl-md'
        }`}
      >
        {canCopy && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar prompt
            </button>
          </div>
        )}
        <div className="text-sm md:text-base leading-relaxed break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0">{children}</ol>,
              li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
              hr: () => <hr className="my-3 border-muted-foreground/20" />,
              a: ({ href, children }) => (
                <a href={href} className="underline" rel="noreferrer" target="_blank">
                  {children}
                </a>
              ),
              code: ({ inline, children }) =>
                inline ? (
                  <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
                    {children}
                  </code>
                ) : (
                  <pre className="mb-2 mt-2 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-[0.9em] whitespace-pre-wrap break-words">
                    <code>{children}</code>
                  </pre>
                ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        {canCopy && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar prompt
            </button>
          </div>
        )}
        <span className={`text-xs mt-2 block ${isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          {new Date(message.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};
