import { useState, useEffect, useRef } from 'react';
import { LogOut, Send, Settings, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChatMessage } from '@/components/ChatMessage';
import { CreditsBanner } from '@/components/CreditsBanner';
import { useAuth } from '@/hooks/useAuth';
import { useProfileRole } from '@/hooks/useProfileRole';
import { Link } from 'react-router-dom';
import { 
  getChatHistory, 
  setChatHistory, 
  generateId,
  ChatMessage as ChatMessageType 
} from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { getFunctionsErrorMessage } from '@/lib/functions';

const Index = () => {
  const { user, signOut } = useAuth();
  const { role } = useProfileRole();
  const [credits, setCreditsState] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const requestAssistantReply = async (currentMessages: ChatMessageType[]) => {
    const { data, error } = await supabase.functions.invoke('chat', {
      body: {
        messages: currentMessages.map(({ role, content }) => ({ role, content })),
      },
    });

    if (error) {
      const message = await getFunctionsErrorMessage(error, 'Erro ao buscar resposta.');
      throw new Error(message);
    }
    if (!data?.reply) {
      throw new Error('Resposta vazia');
    }
    return data.reply as string;
  };

  const handleRedeemCoupon = async () => {
    const code = couponCode.trim().toLowerCase();
    if (!code) {
      toast.error('Informe um cupom válido.');
      return;
    }
    setRedeemLoading(true);
    try {
      if (!user) {
        toast.error('Faça login para resgatar um cupom.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('invite-redeem', {
        body: { code },
      });

      if (error) {
        const message = await getFunctionsErrorMessage(error, 'Erro ao resgatar cupom.');
        if (message.toLowerCase().includes('invite not found')) {
          toast.error('Cupom inválido ou expirado.');
        } else {
          toast.error(message);
        }
        return;
      }

      if (data?.already_redeemed) {
        toast.error('Este cupom já foi resgatado.');
        return;
      }

      const newBalance = typeof data?.new_balance === 'number' ? data.new_balance : null;
      if (newBalance !== null) {
        setCreditsState(newBalance);
        window.dispatchEvent(
          new CustomEvent('mentorix-credits-updated', { detail: newBalance })
        );
      }
      setCouponCode('');
      setCreditsModalOpen(false);
      toast.success('Cupom resgatado com sucesso.');
    } catch (error) {
      toast.error('Erro ao resgatar cupom.');
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleOpenCredits = () => {
    setCreditsModalOpen(true);
  };

  useEffect(() => {
    setMessages(getChatHistory());
  }, []);

  useEffect(() => {
    const loadCredits = async () => {
      if (!user) return;
      setCreditsLoading(true);
      let { data, error } = await supabase
        .from('credit_wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        toast.error('Falha ao carregar créditos.');
      } else if (!data) {
        await supabase.rpc('ensure_user_bootstrap').catch(() => {});
        const retry = await supabase
          .from('credit_wallets')
          .select('balance')
          .eq('user_id', user.id)
          .maybeSingle();
        data = retry.data ?? null;
      }
      setCreditsState(data?.balance ?? 0);
      setCreditsLoading(false);
    };

    if (user) {
      loadCredits();
    }
  }, [user]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<number>;
      if (typeof customEvent.detail === 'number') {
        setCreditsState(customEvent.detail);
        setCreditsLoading(false);
      }
    };
    window.addEventListener('mentorix-credits-updated', handler as EventListener);
    return () => {
      window.removeEventListener('mentorix-credits-updated', handler as EventListener);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || credits <= 0 || isTyping || creditsLoading) return;

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

      if (user) {
        const { data, error } = await supabase.rpc('debit_credits', {
          p_user_id: user.id,
          p_amount: 1,
          p_meta: { source: 'chat' },
        });
        if (error) {
          toast.error(error.message || 'Erro ao debitar créditos.');
        } else {
          const newBalance = Array.isArray(data) ? data[0]?.new_balance : data?.new_balance;
          if (typeof newBalance === 'number') {
            setCreditsState(newBalance);
          }
        }
      }
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

  const hasNoCredits = credits <= 0 && !creditsLoading;

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
          <button
            type="button"
            onClick={handleOpenCredits}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              hasNoCredits
                ? 'bg-destructive/15 text-destructive'
                : 'bg-credits text-credits-foreground'
            }`}
          >
            Créditos: {creditsLoading ? '...' : credits}
          </button>
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
      {hasNoCredits && <CreditsBanner onOpenCredits={handleOpenCredits} />}

      <Dialog open={creditsModalOpen} onOpenChange={setCreditsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Créditos</DialogTitle>
            <DialogDescription>
              Recarregue sua conta ou resgate um cupom.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Resgatar cupom</h3>
                <p className="text-xs text-muted-foreground">
                  Insira o código do cupom para receber créditos.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value)}
                  placeholder="Ex: mentorix10"
                  autoComplete="off"
                />
                <Button onClick={handleRedeemCoupon} disabled={redeemLoading}>
                  {redeemLoading ? 'Resgatando...' : 'Resgatar'}
                </Button>
              </div>
            </div>
            <div className="border-t border-border pt-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Comprar créditos</h3>
                <p className="text-xs text-muted-foreground">
                  Em breve você poderá comprar créditos direto no app.
                </p>
              </div>
              <DialogFooter className="sm:justify-start">
                <Button type="button" variant="outline" disabled>
                  Em breve
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Input Area */}
      <div className="p-4 bg-card border-t border-border">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={hasNoCredits ? "Sem créditos disponíveis..." : "Digite sua pergunta..."}
            disabled={hasNoCredits || isTyping || creditsLoading}
            className="flex-1 px-4 py-3 bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || hasNoCredits || isTyping || creditsLoading}
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
