const CHAT_KEY = 'mentorix_chat';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export const getChatHistory = (): ChatMessage[] => {
  const stored = localStorage.getItem(CHAT_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const setChatHistory = (messages: ChatMessage[]): void => {
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
};

export const resetAll = (): void => {
  localStorage.removeItem(CHAT_KEY);
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};
