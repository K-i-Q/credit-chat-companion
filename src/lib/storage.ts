const CREDITS_KEY = 'mentorix_credits';
const CHAT_KEY = 'mentorix_chat';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export const getCredits = (): number => {
  const stored = localStorage.getItem(CREDITS_KEY);
  return stored ? parseInt(stored, 10) : 10;
};

export const setCredits = (credits: number): void => {
  localStorage.setItem(CREDITS_KEY, credits.toString());
};

export const getChatHistory = (): ChatMessage[] => {
  const stored = localStorage.getItem(CHAT_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const setChatHistory = (messages: ChatMessage[]): void => {
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
};

export const resetAll = (): void => {
  localStorage.removeItem(CREDITS_KEY);
  localStorage.removeItem(CHAT_KEY);
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};
