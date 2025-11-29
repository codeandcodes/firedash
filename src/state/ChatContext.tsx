import React, { createContext, useContext, useState } from 'react';

export interface ChatMessage {
  role: string;
  parts: { text: string }[];
}

interface ChatContextType {
  chatHistory: ChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  context: any;
  setContext: React.Dispatch<React.SetStateAction<any>>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [context, setContext] = useState<any>(null);

  return (
    <ChatContext.Provider value={{ chatHistory, setChatHistory, context, setContext }}>
      {children}
    </ChatContext.Provider>
  );
};


export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};