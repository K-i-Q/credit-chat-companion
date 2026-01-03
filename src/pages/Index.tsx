import { useState, useEffect, useRef } from 'react';
import {
  Gift,
  Heart,
  LogOut,
  Menu,
  Moon,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
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
import { useTheme } from 'next-themes';

type PixPayment = {
  id: string;
  status: string;
  qrCode?: string | null;
  qrCodeBase64?: string | null;
  ticketUrl?: string | null;
  receiverName?: string | null;
  receiverInstitution?: string | null;
};

type DonationPayment = PixPayment;

const Index = () => {
  const { user, signOut } = useAuth();
  const { role } = useProfileRole();
  const { theme, setTheme } = useTheme();
  const [credits, setCreditsState] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);
  const [donationModalOpen, setDonationModalOpen] = useState(false);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralLoading, setReferralLoading] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);
  const [pixCredits, setPixCredits] = useState('');
  const [pixLoading, setPixLoading] = useState(false);
  const [pixPayment, setPixPayment] = useState<PixPayment | null>(null);
  const [pixStatus, setPixStatus] = useState<string>('pending');
  const [donationAmount, setDonationAmount] = useState('');
  const [donationLoading, setDonationLoading] = useState(false);
  const [donationPayment, setDonationPayment] = useState<DonationPayment | null>(null);
  const [donationStatus, setDonationStatus] = useState<string>('pending');
  const [hasPaidAccess, setHasPaidAccess] = useState(false);
  const [paidAccessLoading, setPaidAccessLoading] = useState(false);
  const [communityModalOpen, setCommunityModalOpen] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pixPollingRef = useRef<number | null>(null);
  const donationPollingRef = useRef<number | null>(null);
  const whatsappGroupUrl = import.meta.env.VITE_WHATSAPP_GROUP_URL || '';
  const developerName = 'Carlos Oliveira';
  const supportNumber = '41998157500';

  const buildSupportLink = (message: string) => {
    const text = `Preciso de suporte no Mentorix. Erro: ${message}`;
    return `https://wa.me/55${supportNumber}?text=${encodeURIComponent(text)}`;
  };

  const showSupportError = (message: string) => {
    toast.error(message);
    setSupportError(message);
  };

  const clearSupportError = () => {
    setSupportError(null);
  };

  const streamAssistantReply = async (
    currentMessages: ChatMessageType[],
    onDelta: (chunk: string) => void
  ) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      throw new Error('Sua sessão expirou. Faça login novamente.');
    }

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        messages: currentMessages.map(({ role, content }) => ({ role, content })),
      }),
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody?.error || 'Erro ao buscar resposta.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const rawEvent of events) {
        const lines = rawEvent.split('\n');
        const dataLines = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, ''));
        if (dataLines.length === 0) continue;
        const data = dataLines.join('\n').trim();
        if (!data) continue;
        try {
          const payload = JSON.parse(data) as { type?: string; content?: string; message?: string };
          if (payload.type === 'delta' && payload.content) {
            onDelta(payload.content);
          }
          if (payload.type === 'error') {
            throw new Error(payload.message || 'Erro ao buscar resposta.');
          }
        } catch (_error) {
          // ignore parse errors
        }
      }
    }
  };

  const handleRedeemCoupon = async () => {
    const code = couponCode.trim().toLowerCase();
    if (!code) {
      toast.error('Informe um cupom válido.');
      return;
    }
    setRedeemLoading(true);
    setRedeemMessage(null);
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
        const status = (error as { context?: Response }).context?.status;
        const notFound = status === 404 || message.toLowerCase().includes('invite not found');
        if (!notFound) {
          showSupportError(message);
          return;
        }

        const referralResult = await supabase.functions.invoke('referral-apply', {
          body: { code },
        });
        if (referralResult.error) {
          const referralMessage = await getFunctionsErrorMessage(
            referralResult.error,
            'Erro ao aplicar cupom.'
          );
          const lower = referralMessage.toLowerCase();
          if (lower.includes('referral not found')) {
            toast.error('Cupom inválido ou expirado.');
          } else if (lower.includes('cannot use your own code')) {
            toast.error('Você não pode usar seu próprio cupom.');
          } else {
            showSupportError(referralMessage);
          }
          return;
        }
        if (referralResult.data?.already_redeemed) {
          setRedeemMessage('Você já aplicou um cupom de indicação.');
          return;
        }
        setRedeemMessage(
          'Cupom de indicação aplicado! O bônus de 10 créditos libera quando você comprar 10+ créditos.'
        );
        setCouponCode('');
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
      showSupportError('Erro ao resgatar cupom.');
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleOpenCredits = () => {
    setMobileMenuOpen(false);
    setRedeemMessage(null);
    setCreditsModalOpen(true);
  };

  const handleOpenDonation = () => {
    setMobileMenuOpen(false);
    setDonationModalOpen(true);
  };

  const handleOpenCommunity = () => {
    if (!hasPaidAccess) {
      toast.error('Compre créditos para desbloquear o acesso.');
      return;
    }
    setMobileMenuOpen(false);
    setCommunityModalOpen(true);
  };

  const handleOpenReferral = async () => {
    setMobileMenuOpen(false);
    setReferralModalOpen(true);
    if (referralCode) return;
    setReferralLoading(true);
    const { data, error } = await supabase.functions.invoke('referral-code');
    setReferralLoading(false);
    if (error) {
      const message = await getFunctionsErrorMessage(error, 'Erro ao carregar o cupom.');
      showSupportError(message);
      return;
    }
    setReferralCode(data?.code || '');
  };

  const handleCopyReferral = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      toast.success('Cupom copiado.');
    } catch (_error) {
      toast.error('Não foi possível copiar.');
    }
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
        showSupportError('Falha ao carregar créditos.');
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

  const loadPaidAccess = async () => {
    if (!user) return;
    setPaidAccessLoading(true);
    const { data, error } = await supabase
      .from('credit_purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .limit(1);
    if (!error) {
      setHasPaidAccess(Boolean(data?.length));
    }
    setPaidAccessLoading(false);
  };

  useEffect(() => {
    if (user) {
      loadPaidAccess();
    }
  }, [user]);

  useEffect(() => {
    if (creditsModalOpen && user) {
      loadPaidAccess();
    }
  }, [creditsModalOpen, user]);

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

  useEffect(() => {
    if (!creditsModalOpen && !donationModalOpen && !isTyping) {
      inputRef.current?.focus();
    }
  }, [creditsModalOpen, donationModalOpen, isTyping]);

  useEffect(() => {
    return () => {
      if (pixPollingRef.current) {
        window.clearInterval(pixPollingRef.current);
      }
      if (donationPollingRef.current) {
        window.clearInterval(donationPollingRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!creditsModalOpen && pixPollingRef.current) {
      window.clearInterval(pixPollingRef.current);
      pixPollingRef.current = null;
    }
  }, [creditsModalOpen]);

  useEffect(() => {
    if (!donationModalOpen && donationPollingRef.current) {
      window.clearInterval(donationPollingRef.current);
      donationPollingRef.current = null;
    }
  }, [donationModalOpen]);

  const startPixPolling = (paymentId: string) => {
    if (pixPollingRef.current) {
      window.clearInterval(pixPollingRef.current);
    }
    pixPollingRef.current = window.setInterval(async () => {
      const { data, error } = await supabase.functions.invoke('pix-status', {
        body: { payment_id: paymentId },
      });
      if (error) {
        showSupportError('Falha ao verificar o pagamento.');
        return;
      }
      if (data?.status) {
        setPixStatus(data.status);
      }
      if (data?.status === 'approved') {
        window.clearInterval(pixPollingRef.current ?? undefined);
        pixPollingRef.current = null;
        if (typeof data?.balance === 'number') {
          setCreditsState(data.balance);
          window.dispatchEvent(
            new CustomEvent('mentorix-credits-updated', { detail: data.balance })
          );
        }
        setHasPaidAccess(true);
        setCommunityModalOpen(true);
        toast.success('Pagamento confirmado. Créditos adicionados!');
      }
    }, 5000);
  };

  const startDonationPolling = (paymentId: string) => {
    if (donationPollingRef.current) {
      window.clearInterval(donationPollingRef.current);
    }
    donationPollingRef.current = window.setInterval(async () => {
      const { data, error } = await supabase.functions.invoke('donation-status', {
        body: { payment_id: paymentId },
      });
      if (error) {
        showSupportError('Falha ao verificar a doação.');
        return;
      }
      if (data?.status) {
        setDonationStatus(data.status);
      }
      if (data?.status === 'approved') {
        window.clearInterval(donationPollingRef.current ?? undefined);
        donationPollingRef.current = null;
        toast.success('Doação confirmada! Obrigado pelo apoio.');
      }
    }, 5000);
  };

  const handleCreatePixPayment = async () => {
    const creditsAmount = Number(pixCredits);
    if (!Number.isInteger(creditsAmount) || creditsAmount <= 0) {
      toast.error('Informe uma quantidade inteira de créditos.');
      return;
    }
    setPixLoading(true);
    setPixPayment(null);
    const { data, error } = await supabase.functions.invoke('pix-create', {
      body: { credits: creditsAmount },
    });
    setPixLoading(false);
    if (error) {
      const message = await getFunctionsErrorMessage(error, 'Erro ao gerar PIX.');
      showSupportError(message);
      return;
    }
    if (!data?.payment_id) {
      showSupportError('Não foi possível gerar o PIX.');
      return;
    }
    setPixStatus(data.status || 'pending');
    setPixPayment({
      id: data.payment_id,
      status: data.status || 'pending',
      qrCode: data.qr_code,
      qrCodeBase64: data.qr_code_base64,
      ticketUrl: data.ticket_url,
      receiverName: data.receiver_name,
      receiverInstitution: data.receiver_institution,
    });
    startPixPolling(data.payment_id);
  };

  const handleCreateDonation = async () => {
    const normalized = donationAmount.replace(',', '.');
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Informe um valor válido para doação.');
      return;
    }
    setDonationLoading(true);
    setDonationPayment(null);
    const { data, error } = await supabase.functions.invoke('donation-create', {
      body: { amount },
    });
    setDonationLoading(false);
    if (error) {
      const message = await getFunctionsErrorMessage(error, 'Erro ao gerar PIX.');
      showSupportError(message);
      return;
    }
    if (!data?.payment_id) {
      showSupportError('Não foi possível gerar o PIX.');
      return;
    }
    setDonationStatus(data.status || 'pending');
    setDonationPayment({
      id: data.payment_id,
      status: data.status || 'pending',
      qrCode: data.qr_code,
      qrCodeBase64: data.qr_code_base64,
      ticketUrl: data.ticket_url,
      receiverName: data.receiver_name,
      receiverInstitution: data.receiver_institution,
    });
    startDonationPolling(data.payment_id);
  };

  const handleCopyPix = async () => {
    if (!pixPayment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixPayment.qrCode);
      toast.success('Código PIX copiado.');
    } catch (_error) {
      toast.error('Não foi possível copiar.');
    }
  };

  const handleCopyDonation = async () => {
    if (!donationPayment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(donationPayment.qrCode);
      toast.success('Código PIX copiado.');
    } catch (_error) {
      toast.error('Não foi possível copiar.');
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || credits <= 0 || isTyping || creditsLoading) return;

    clearSupportError();
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
    inputRef.current?.focus();

    const assistantId = generateId();
    const assistantMessage: ChatMessageType = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    const seededMessages = [...newMessages, assistantMessage];
    setMessages(seededMessages);
    setChatHistory(seededMessages);

    try {
      await streamAssistantReply(newMessages, (chunk) => {
        setMessages((prev) => {
          const updated = prev.map((msg) =>
            msg.id === assistantId ? { ...msg, content: msg.content + chunk } : msg
          );
          setChatHistory(updated);
          return updated;
        });
      });

      if (user) {
        const { data, error } = await supabase.rpc('debit_credits', {
          p_user_id: user.id,
          p_amount: 1,
          p_meta: { source: 'chat' },
        });
        if (error) {
          showSupportError(error.message || 'Erro ao debitar créditos.');
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
      showSupportError(errorMessage);
      setMessages((prev) => {
        const updated = prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `Não foi possível obter resposta agora. ${errorMessage}` }
            : msg
        );
        setChatHistory(updated);
        return updated;
      });
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  };

  const handleResetChat = () => {
    setMessages([]);
    setChatHistory([]);
    setInputValue('');
    setIsTyping(false);
    clearSupportError();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const hasNoCredits = credits <= 0 && !creditsLoading;

  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      {/* Header */}
      <header className="relative fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 bg-card border-b border-border shadow-sm md:sticky md:top-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Mentorix</h1>
        </div>
        <div className="flex items-center gap-2">
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
            size="icon"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden md:flex items-center gap-3">
            {user?.email && (
              <span className="text-sm text-muted-foreground">{user.email}</span>
            )}
            {role === 'admin' && (
              <Button variant="ghost" size="sm" asChild className="gap-1.5">
                <Link to="/admin">
                  <Settings className="h-4 w-4" />
                  <span>Admin</span>
                </Link>
              </Button>
            )}
            {hasPaidAccess && (
              <Button variant="ghost" size="sm" onClick={handleOpenCommunity} className="gap-1.5">
                <Users className="h-4 w-4" />
                <span>Comunidade</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleOpenReferral} className="gap-1.5">
              <Gift className="h-4 w-4" />
              <span>Meu cupom</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleOpenDonation} className="gap-1.5">
              <Heart className="h-4 w-4" />
              <span>Apoiar</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="gap-1.5"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>Tema</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleResetChat} className="gap-1.5">
              <RotateCcw className="h-4 w-4" />
              <span>Reset</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </Button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="absolute right-4 top-full mt-2 w-56 rounded-xl border border-border bg-card shadow-lg p-2 md:hidden">
            {user?.email && (
              <div className="px-2 py-1 text-xs text-muted-foreground">{user.email}</div>
            )}
            {role === 'admin' && (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="w-full justify-start gap-2"
              >
                <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>
                  <Settings className="h-4 w-4" />
                  Admin
                </Link>
              </Button>
            )}
            {hasPaidAccess && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenCommunity}
                className="w-full justify-start gap-2"
              >
                <Users className="h-4 w-4" />
                Comunidade
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenReferral}
              className="w-full justify-start gap-2"
            >
              <Gift className="h-4 w-4" />
              Meu cupom
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenDonation}
              className="w-full justify-start gap-2"
            >
              <Heart className="h-4 w-4" />
              Apoiar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTheme(theme === 'dark' ? 'light' : 'dark');
                setMobileMenuOpen(false);
              }}
              className="w-full justify-start gap-2"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              Tema
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                handleResetChat();
                setMobileMenuOpen(false);
              }}
              className="w-full justify-start gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                signOut();
                setMobileMenuOpen(false);
              }}
              className="w-full justify-start gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        )}
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 pt-20 pb-28 md:pt-4 md:pb-4 scrollbar-thin">
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
        <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Créditos</DialogTitle>
            <DialogDescription>
              Recarregue sua conta ou resgate um cupom.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Aplicar cupom</h3>
                <p className="text-xs text-muted-foreground">
                  Aceita cupom de créditos ou cupom de indicação. Se for indicação, o bônus
                  libera após comprar 10+ créditos.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={couponCode}
                  onChange={(event) => {
                    setCouponCode(event.target.value);
                    setRedeemMessage(null);
                  }}
                  placeholder="Ex: mentorix10 ou mx1234abcd"
                  autoComplete="off"
                />
                <Button onClick={handleRedeemCoupon} disabled={redeemLoading}>
                  {redeemLoading ? 'Aplicando...' : 'Aplicar cupom'}
                </Button>
              </div>
              {redeemMessage && (
                <p className="text-xs text-muted-foreground">{redeemMessage}</p>
              )}
            </div>
            {!hasPaidAccess && (
              <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
                Compre qualquer quantidade de créditos para desbloquear a Comunidade WhatsApp.
              </div>
            )}
            <div className="border-t border-border pt-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Comprar créditos</h3>
                <p className="text-xs text-muted-foreground">
                  Cada crédito custa R$ 1,00. O acesso ao WhatsApp é liberado só após compra.
                </p>
              </div>
              <DialogFooter className="sm:justify-start">
                <div className="w-full space-y-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Quantidade de créditos</label>
                      <Input
                        type="number"
                        min={1}
                        value={pixCredits}
                        onChange={(event) => setPixCredits(event.target.value)}
                        placeholder="Ex: 10"
                      />
                    </div>
                    <Button onClick={handleCreatePixPayment} disabled={pixLoading}>
                      {pixLoading ? 'Gerando...' : 'Gerar PIX'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total: R$ {Number(pixCredits) > 0 ? Number(pixCredits).toFixed(2) : '0.00'}
                  </p>
                  {pixPayment && (
                    <div className="rounded-lg border border-border p-3 space-y-3">
                      <div className="text-xs text-muted-foreground">
                        Status:{" "}
                        <span className="font-semibold text-foreground">
                          {pixStatus === 'approved' ? 'Pago' : 'Aguardando pagamento'}
                        </span>
                      </div>
                      {pixStatus === 'approved' ? (
                        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                          Pagamento confirmado! Você já recebeu os créditos. Pode fechar a janela.
                        </div>
                      ) : (
                        <>
                          {pixPayment.receiverName && (
                            <div className="text-xs text-muted-foreground">
                              Recebedor:{" "}
                              <span className="font-semibold text-foreground">
                                {pixPayment.receiverName}
                              </span>
                            </div>
                          )}
                          {pixPayment.receiverInstitution && (
                            <div className="text-xs text-muted-foreground">
                              Instituição:{" "}
                              <span className="font-semibold text-foreground">
                                {pixPayment.receiverInstitution}
                              </span>
                            </div>
                          )}
                          {pixPayment.qrCodeBase64 && (
                            <div className="flex justify-center">
                              <img
                                src={`data:image/png;base64,${pixPayment.qrCodeBase64}`}
                                alt="QR Code Pix"
                                className="h-40 w-40"
                              />
                            </div>
                          )}
                          {pixPayment.qrCode && (
                            <div className="space-y-2">
                              <div className="text-xs text-muted-foreground">PIX copia e cola</div>
                              <Input value={pixPayment.qrCode} readOnly />
                              <Button type="button" variant="secondary" onClick={handleCopyPix}>
                                Copiar código PIX
                              </Button>
                            </div>
                          )}
                          {pixPayment.ticketUrl && (
                            <a
                              href={pixPayment.ticketUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary underline"
                            >
                              Abrir Pix em nova aba
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={donationModalOpen} onOpenChange={setDonationModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apoiar o projeto</DialogTitle>
            <DialogDescription>
              Doação livre, sem créditos. Apoie o desenvolvimento do Mentorix.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Desenvolvedor:{' '}
              <span className="font-semibold text-foreground">{developerName}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Valor da doação (R$)</label>
                <Input
                  type="number"
                  min={1}
                  step="0.01"
                  value={donationAmount}
                  onChange={(event) => setDonationAmount(event.target.value)}
                  placeholder="Ex: 20"
                />
              </div>
              <Button onClick={handleCreateDonation} disabled={donationLoading}>
                {donationLoading ? 'Gerando...' : 'Gerar PIX para doação'}
              </Button>
            </div>
            {donationPayment && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="text-xs text-muted-foreground">
                  Status:{' '}
                  <span className="font-semibold text-foreground">
                    {donationStatus === 'approved' ? 'Doação confirmada' : 'Aguardando pagamento'}
                  </span>
                </div>
                {donationStatus === 'approved' ? (
                  <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    Doação confirmada! Obrigado pelo apoio. Você pode fechar a janela.
                  </div>
                ) : (
                  <>
                    {donationPayment.receiverName && (
                      <div className="text-xs text-muted-foreground">
                        Recebedor:{' '}
                        <span className="font-semibold text-foreground">
                          {donationPayment.receiverName}
                        </span>
                      </div>
                    )}
                    {donationPayment.receiverInstitution && (
                      <div className="text-xs text-muted-foreground">
                        Instituição:{' '}
                        <span className="font-semibold text-foreground">
                          {donationPayment.receiverInstitution}
                        </span>
                      </div>
                    )}
                    {donationPayment.qrCodeBase64 && (
                      <div className="flex justify-center">
                        <img
                          src={`data:image/png;base64,${donationPayment.qrCodeBase64}`}
                          alt="QR Code Pix"
                          className="h-40 w-40"
                        />
                      </div>
                    )}
                    {donationPayment.qrCode && (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">PIX copia e cola</div>
                        <Input value={donationPayment.qrCode} readOnly />
                        <Button type="button" variant="secondary" onClick={handleCopyDonation}>
                          Copiar código PIX
                        </Button>
                      </div>
                    )}
                    {donationPayment.ticketUrl && (
                      <a
                        href={donationPayment.ticketUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline"
                      >
                        Abrir Pix em nova aba
                      </a>
                    )}
                  </>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Para comprar créditos, use a opção de créditos no topo. Doação não gera créditos.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={referralModalOpen} onOpenChange={setReferralModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Seu cupom exclusivo</DialogTitle>
            <DialogDescription>
              Compartilhe com amigos. Quando alguém usar o cupom e comprar 10 ou mais créditos,
              vocês dois ganham 10 créditos (o cupom deve ser aplicado antes da compra).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
              {referralLoading ? 'Gerando seu cupom...' : referralCode || 'Cupom indisponível.'}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCopyReferral}
                disabled={!referralCode || referralLoading}
              >
                Copiar cupom
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReferralModalOpen(false)}
              >
                Fechar
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>1. A pessoa cria conta e aplica o cupom na área de créditos antes da compra.</p>
              <p>2. Quando ela comprar 10+ créditos, ambos recebem +10 créditos.</p>
              <p>3. Cada pessoa pode usar apenas 1 cupom de indicação.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={communityModalOpen} onOpenChange={setCommunityModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comunidade Mentorix</DialogTitle>
            <DialogDescription>
              Suporte e comunidade exclusiva para quem comprou créditos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Você desbloqueou o acesso à comunidade no WhatsApp. Lá você pode pedir ajuda,
              relatar erros e trocar ideias com a galera.
            </p>
            {whatsappGroupUrl ? (
              <Button asChild variant="secondary">
                <a href={whatsappGroupUrl} target="_blank" rel="noreferrer">
                  Entrar no grupo
                </a>
              </Button>
            ) : (
              <p>Link do grupo não configurado.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Input Area */}
      <div className="fixed bottom-0 inset-x-0 z-40 p-4 bg-card border-t border-border md:sticky md:bottom-0">
        {supportError && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>Ocorreu um erro. Precisa de ajuda?</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-7 border-destructive/40 text-destructive hover:text-destructive"
                >
                  <a href={buildSupportLink(supportError)} target="_blank" rel="noreferrer">
                    Falar com suporte
                  </a>
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={clearSupportError}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-2 max-w-4xl mx-auto">
          <input
            type="text"
            value={inputValue}
            ref={inputRef}
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
