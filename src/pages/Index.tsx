import { useState, useEffect, useRef } from 'react';
import { LogOut, Send, Settings, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessage } from '@/components/ChatMessage';
import { CreditsBanner } from '@/components/CreditsBanner';
import { useAuth } from '@/hooks/useAuth';
import { useProfileRole } from '@/hooks/useProfileRole';
import { Link } from 'react-router-dom';
import { 
  getCredits, 
  setCredits, 
  getChatHistory, 
  setChatHistory, 
  generateId,
  ChatMessage as ChatMessageType 
} from '@/lib/storage';

const Index = () => {
  const { user, signOut } = useAuth();
  const { role } = useProfileRole();
  const [credits, setCreditsState] = useState(10);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const requestAssistantReply = async (currentMessages: ChatMessageType[]) => {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const endpoint = apiBaseUrl ? `${apiBaseUrl}/api/chat` : '/api/chat';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: currentMessages.map(({ role, content }) => ({ role, content })),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Erro ao buscar resposta (${response.status})`);
    }
    if (!data?.reply) {
      throw new Error('Resposta vazia');
    }
    return data.reply as string;
  };

  useEffect(() => {
    setCreditsState(getCredits());
    setMessages(getChatHistory());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || credits <= 0 || isTyping) return;

    const userMessage: ChatMessageType = {
      id: generateId(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setChatHistory(newMessages);
    setInputValue('');
    setIsTyping(true);

    try {
      const reply = await requestAssistantReply(newMessages);

      const assistantMessage: ChatMessageType = {
        id: generateId(),
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);
      setChatHistory(updatedMessages);

      setCreditsState((prevCredits) => {
        const nextCredits = Math.max(prevCredits - 1, 0);
        setCredits(nextCredits);
        return nextCredits;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('Chat request failed', error);
      const assistantMessage: ChatMessageType = {
        id: generateId(),
        role: 'assistant',
        content: `Não foi possível obter resposta agora. ${errorMessage}`,
        timestamp: Date.now(),
      };
      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);
      setChatHistory(updatedMessages);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const hasNoCredits = credits <= 0;

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-card border-b border-border shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Mentorix</h1>
        </div>
        <div className="flex items-center gap-3">
          {user?.email && (
            <span className="hidden sm:inline text-sm text-muted-foreground">{user.email}</span>
          )}
          {role === 'admin' && (
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <Link to="/admin">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            </Button>
          )}
          <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
            hasNoCredits 
              ? 'bg-destructive/15 text-destructive' 
              : 'bg-credits text-credits-foreground'
          }`}>
            Créditos: {credits}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="gap-1.5"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Bem-vindo ao Mentorix!
            </h2>
            <p className="text-muted-foreground max-w-md">
              Faça qualquer pergunta e receba orientações personalizadas. 
              Cada resposta consome 1 crédito.
            </p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isTyping && (
              <div className="flex justify-start mb-4">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Credits Banner */}
      {hasNoCredits && <CreditsBanner />}

      {/* Input Area */}
      <div className="p-4 bg-card border-t border-border">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={hasNoCredits ? "Sem créditos disponíveis..." : "Digite sua pergunta..."}
            disabled={hasNoCredits || isTyping}
            className="flex-1 px-4 py-3 bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || hasNoCredits || isTyping}
            className="px-4 py-3 h-auto rounded-xl"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
