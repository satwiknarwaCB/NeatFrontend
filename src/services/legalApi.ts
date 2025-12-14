// Legal AId API Service
import { legalChatbotApiClient } from './legalChatbotApi';
import { documentAnalysisApiClient } from './documentAnalysisApi';

// Types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatResponse {
  response: string;
  sources: Array<{
    file_name: string;
    page?: number;
  }>;
  tokens_used: number;
  response_type: 'rag' | 'general_knowledge' | 'layman' | 'hybrid';
  conversation_id: string;
}

export interface DocumentDraft {
  document_type: string;
  requirements: string;
  jurisdictions?: string[];
  style?: string;
  length?: string;
  clauses?: string[];
  special_provisions?: string;
}

export interface DraftResponse {
  document: string;
  document_type: string;
  processing_time?: number;
  tokens_used?: number;
}

export interface UploadResponse {
  message: string;
  session_id: string;
}

export interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: number;
  mode: string;
}

export interface ConversationHistory {
  id: string;
  history: ChatMessage[];
  mode: string;
  title: string;
}

export interface ChatHistoryItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface SessionStats {
  total_queries: number;
  flagged_queries: number;
  total_tokens_used: number;
  input_tokens_used: number;
  output_tokens_used: number;
  session_duration_seconds: number;
  average_tokens_per_query: number;
  flagged_percentage: number;
  tokens_remaining: number;
  input_output_ratio: number;
}

// Create a new session
export const createSession = async (): Promise<string> => {
  try {
    console.log('Creating new session...');
    // Call the session creation endpoint - using the correct endpoint from documentation
    const response = await legalChatbotApiClient.post<null, { chat_session_id: string }>('/chat/new', null);
    console.log('Session creation response:', response);
    if (!response || !response.chat_session_id) {
      throw new Error('Invalid session creation response');
    }
    return response.chat_session_id;
  } catch (error) {
    console.error('Failed to create session:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      data: error.data
    });
    throw error;
  }
};

// Chat with the AI
export const chatWithAI = async (
  message: string,
  chatbotMode: 'Document Only' | 'Layman Explanation' | 'Hybrid (Smart)' | 'General Chat' = 'General Chat',
  conversationId: string = 'default'
): Promise<ChatResponse> => {
  try {
    // First, ensure we have a valid session
    let sessionId = localStorage.getItem('backend_session_id');
    console.log('Current session ID from localStorage:', sessionId);
    
    // Always create a new session to ensure we have a valid one
    // The "Session not found" error suggests our stored session is invalid
    console.log('Creating new session to ensure validity...');
    sessionId = await createSession();
    console.log('New session created:', sessionId);
    localStorage.setItem('backend_session_id', sessionId);
    
    console.log('Sending chat request with:', {
      message: message,
      session_id: sessionId,
      chatbot_mode: chatbotMode,
      enable_content_filter: true,
      enable_pii_detection: true
    });
    
    // Match the ChatRequest model expected by the backend - using the correct endpoint from documentation
    const response = await legalChatbotApiClient.post<any, any>('/chat', {
      message: message,
      session_id: sessionId, // Use the actual session ID
      chatbot_mode: chatbotMode,
      enable_content_filter: true,
      enable_pii_detection: true
    });
    
    console.log('Received chat response:', response);
    
    // Transform the response to match our expected ChatResponse interface
    return {
      response: response.response || response.answer || response.text || response.message || JSON.stringify(response),
      sources: response.sources || [],
      tokens_used: response.tokens_used || 0,
      response_type: response.response_type || 'general_knowledge',
      conversation_id: response.conversation_id || conversationId
    };
  } catch (error) {
    console.error('Chat API Error Details:', {
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      data: error.data
    });
    // If we get an error, re-throw it so the calling code can handle it appropriately
    throw error;
  }
};

// Get all conversations
export const getConversations = async (): Promise<Conversation[]> => {
  try {
    const sessions = await getChatHistory();
    // Convert ChatSession to Conversation format
    return sessions.map(session => ({
      id: session.id,
      title: session.title,
      lastMessage: '',
      timestamp: new Date(session.updated_at).getTime(),
      mode: 'general'
    }));
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    return [];
  }
};

// Get a specific conversation
export const getConversation = async (conversationId: string): Promise<ConversationHistory> => {
  try {
    const historyItems = await getChatSession(conversationId);
    // Convert ChatHistoryItem to ChatMessage format
    const history = historyItems.map(item => ({
      role: item.role as 'user' | 'assistant',
      content: item.content,
      timestamp: new Date(item.timestamp)
    }));
    
    return {
      id: conversationId,
      history: history,
      mode: 'general',
      title: 'Chat Session'
    };
  } catch (error) {
    console.error(`Failed to fetch conversation ${conversationId}:`, error);
    return {
      id: conversationId,
      history: [],
      mode: 'general',
      title: 'Chat Session'
    };
  }
};

// Create a new conversation
export const createConversation = async (mode: string = 'general'): Promise<Conversation> => {
  try {
    const newSession = await startNewChatSession();
    return {
      id: newSession.id,
      title: newSession.title,
      lastMessage: '',
      timestamp: new Date(newSession.created_at).getTime(),
      mode: mode
    };
  } catch (error) {
    console.error('Failed to create conversation:', error);
    throw error;
  }
};

// Delete a conversation
export const deleteConversation = async (conversationId: string): Promise<boolean> => {
  try {
    return await deleteChatSession(conversationId);
  } catch (error) {
    console.error(`Failed to delete conversation ${conversationId}:`, error);
    return false;
  }
};

// Draft a legal document - using the correct endpoint from documentation
export const draftDocument = async (data: DocumentDraft): Promise<DraftResponse> => {
  try {
    // First, ensure we have a valid session
    let sessionId = localStorage.getItem('backend_session_id');
    console.log('Current session ID from localStorage:', sessionId);
    
    // Always create a new session to ensure we have a valid one
    console.log('Creating new session to ensure validity...');
    sessionId = await createSession();
    console.log('New session created:', sessionId);
    localStorage.setItem('backend_session_id', sessionId);
    
    // Prepare the request data to match backend expectations
    const requestData: any = {
      doc_type: data.document_type,  // Changed from document_type to doc_type to match backend
      requirements: data.requirements,
      session_id: sessionId
    };
    
    // Only add optional fields if they exist and are not empty
    if (data.jurisdictions && data.jurisdictions.length > 0) {
      requestData.jurisdictions = data.jurisdictions;
    }
    if (data.style) {
      requestData.style = data.style;
    }
    if (data.length) {
      requestData.length = data.length;
    }
    if (data.clauses && data.clauses.length > 0) {
      requestData.clauses = data.clauses;
    }
    if (data.special_provisions) {
      requestData.special_provisions = data.special_provisions;
    }
    
    console.log('Sending draft request with data:', requestData);
    
    const response = await legalChatbotApiClient.post<DocumentDraft, DraftResponse>('/drafting/generate', requestData);
    return response;
  } catch (error) {
    console.error('Failed to draft document:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      data: error.data
    });
    throw error;
  }
};

// Upload documents for RAG - using the correct endpoint from documentation
export const uploadDocuments = async (files: Array<{ name: string; content: string }>): Promise<UploadResponse> => {
  try {
    // Always create a new session to ensure we have a valid one
    console.log('Creating new session for upload...');
    const sessionId = await createSession();
    console.log('New session created:', sessionId);
    localStorage.setItem('backend_session_id', sessionId);
    
    const response = await legalChatbotApiClient.post<any, UploadResponse>('/documents/upload', {
      files: files,
      session_id: sessionId
    });
    
    return response;
  } catch (error) {
    console.error('Failed to upload documents:', error);
    throw error;
  }
};

// Health check - using the correct endpoint from documentation
export const healthCheck = async (): Promise<{ status: string; message: string }> => {
  try {
    const response = await legalChatbotApiClient.get<{ status: string; message: string }>('/status');
    return response;
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
};

export interface DocumentType {
  id: string;
  name: string;
  description: string;
}

export interface DraftingStyle {
  id: string;
  name: string;
  description: string;
}

export interface LegalClause {
  id: string;
  name: string;
  description: string;
}

// Get available document types - using the correct endpoint from documentation
export const getDocumentTypes = async (): Promise<DocumentType[]> => {
  try {
    const response = await legalChatbotApiClient.get<{ document_types: DocumentType[] }>('/drafting/document-types');
    return response.document_types || [];
  } catch (error) {
    console.error('Failed to fetch document types:', error);
    return [];
  }
};

// Get available drafting styles - using the correct endpoint from documentation
export const getDraftingStyles = async (): Promise<DraftingStyle[]> => {
  try {
    const response = await legalChatbotApiClient.get<{ drafting_styles: DraftingStyle[] }>('/drafting/styles');
    return response.drafting_styles || [];
  } catch (error) {
    console.error('Failed to fetch drafting styles:', error);
    return [];
  }
};

// Get available legal clauses - using the correct endpoint from documentation
export const getAvailableClauses = async (): Promise<LegalClause[]> => {
  try {
    const response = await legalChatbotApiClient.get<{ clauses: LegalClause[] }>('/drafting/clauses');
    return response.clauses || [];
  } catch (error) {
    console.error('Failed to fetch legal clauses:', error);
    return [];
  }
};

// Export report in specified format - using the correct endpoint from documentation
export const exportReport = async (
  content: any,
  format: 'pdf' | 'docx' | 'txt' = 'pdf'
): Promise<Blob> => {
  try {
    const response = await legalChatbotApiClient.postRaw('/drafting/export', {
      format: format,
      content: content
    });
    return response;
  } catch (error) {
    console.error('Failed to export report:', error);
    throw error;
  }
};

// Process documents with FormData - using the correct endpoint from documentation
export const processDocuments = async (data: any): Promise<any> => {
  try {
    const response = await legalChatbotApiClient.post<any, any>('/documents/process', data);
    return response;
  } catch (error) {
    console.error('Failed to process documents:', error);
    // Log more detailed error information
    if (error.response) {
      console.error('Error response data:', error.response.data);
      console.error('Error response status:', error.response.status);
      console.error('Error response headers:', error.response.headers);
    } else if (error.request) {
      console.error('Error request data:', error.request);
    } else {
      console.error('Error message:', error.message);
    }
    throw error;
  }
};

// Get chat history for current user - using the correct endpoint from documentation
export const getChatHistory = async (): Promise<ChatSession[]> => {
  try {
    const response = await legalChatbotApiClient.get<ChatSession[]>('/chat/history');
    return response || [];
  } catch (error) {
    console.error('Failed to fetch chat history:', error);
    return [];
  }
};

// Get specific chat session messages - using the correct endpoint from documentation
export const getChatSession = async (sessionId: string): Promise<ChatHistoryItem[]> => {
  try {
    const response = await legalChatbotApiClient.get<ChatHistoryItem[]>(`/chat/${sessionId}`);
    return response || [];
  } catch (error) {
    console.error(`Failed to fetch chat session ${sessionId}:`, error);
    return [];
  }
};

// Delete a chat session - using the correct endpoint from documentation
export const deleteChatSession = async (sessionId: string): Promise<boolean> => {
  try {
    await legalChatbotApiClient.delete(`/chat/${sessionId}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete chat session ${sessionId}:`, error);
    return false;
  }
};

// Start a new chat session - using the correct endpoint from documentation
export const startNewChatSession = async (): Promise<ChatSession> => {
  try {
    const response = await legalChatbotApiClient.post<null, ChatSession>('/chat/new', null);
    return response;
  } catch (error) {
    console.error('Failed to start new chat session:', error);
    throw error;
  }
};

// Download a drafted document - using the correct endpoint from documentation
export const downloadDocument = async (
  format: 'txt' | 'pdf' | 'docx',
  content: any
): Promise<Blob> => {
  try {
    const response = await legalChatbotApiClient.postRaw(`/drafting/download/${format}`, content);
    return response;
  } catch (error) {
    console.error(`Failed to download document in ${format} format:`, error);
    throw error;
  }
};

// Get embeddings status - using the correct endpoint from documentation
export const getEmbeddingsStatus = async (): Promise<any> => {
  try {
    const response = await legalChatbotApiClient.get<any>('/status');
    return response;
  } catch (error) {
    console.error('Failed to fetch embeddings status:', error);
    throw error;
  }
};

// Get session statistics - using the correct endpoint from documentation
export const getSessionStats = async (): Promise<SessionStats> => {
  try {
    const response = await legalChatbotApiClient.get<SessionStats>('/session/stats');
    return response;
  } catch (error) {
    console.error('Failed to fetch session stats:', error);
    throw error;
  }
};

// Reset user session - using the correct endpoint from documentation
export const resetSession = async (): Promise<boolean> => {
  try {
    await legalChatbotApiClient.post<null, any>('/session/reset', null);
    // Clear local storage session ID as well
    localStorage.removeItem('backend_session_id');
    return true;
  } catch (error) {
    console.error('Failed to reset session:', error);
    return false;
  }
};