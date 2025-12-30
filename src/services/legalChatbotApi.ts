// Legal Chatbot API Client (Port 8000)
const LEGAL_CHATBOT_BASE_URL = import.meta.env.VITE_LEGAL_CHATBOT_BASE_URL || 'http://localhost:8000/api';

// Document Analysis Service (Port 8001)
const DOCUMENT_SERVICE_BASE_URL = import.meta.env.VITE_DOCUMENT_SERVICE_BASE_URL || 'http://localhost:8001';

// Simple fetch wrapper for Legal Chatbot API
class LegalChatbotApiClient {
    private async request<T>(endpoint: string, config: RequestInit = {}): Promise<T> {
        const url = `${LEGAL_CHATBOT_BASE_URL}${endpoint}`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(config.headers as Record<string, string>),
        };

        // Inject Auth Token if available
        const token = localStorage.getItem('authToken');
        console.log('Checking for authToken:', token ? 'FOUND' : 'NOT FOUND');
        if (token) {
            console.log('Adding Authorization header with token:', token.substring(0, 20) + '...');
            headers['Authorization'] = `Bearer ${token}`;
        } else {
            console.warn('No authToken in localStorage - requests will fail with 403');
        }

        const response = await fetch(url, {
            ...config,
            headers,
        });

        if (!response.ok) {
            const error: any = new Error('Legal Chatbot API Error');
            error.status = response.status;
            error.statusText = response.statusText;
            try {
                error.data = await response.json();
            } catch (e) {
                error.data = null;
            }
            throw error;
        }

        // Handle empty responses
        if (response.status === 204) {
            return {} as T;
        }

        return response.json();
    }

    async get<T>(endpoint: string, config?: RequestInit): Promise<T> {
        return this.request<T>(endpoint, { ...config, method: 'GET' });
    }

    async post<TReq, TRes>(endpoint: string, data: TReq | null, config?: RequestInit): Promise<TRes> {
        return this.request<TRes>(endpoint, {
            ...config,
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    async put<TReq, TRes>(endpoint: string, data: TReq, config?: RequestInit): Promise<TRes> {
        return this.request<TRes>(endpoint, {
            ...config,
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async delete<T>(endpoint: string, config?: RequestInit): Promise<T> {
        return this.request<T>(endpoint, { ...config, method: 'DELETE' });
    }

    // Special method for raw responses (blobs, etc)
    async postRaw(endpoint: string, data: any, config?: RequestInit): Promise<Blob> {
        const url = `${LEGAL_CHATBOT_BASE_URL}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...config?.headers,
        };

        const response = await fetch(url, {
            ...config,
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const error: any = new Error('Legal Chatbot API Error');
            error.status = response.status;
            throw error;
        }

        return response.blob();
    }

    // Special method for FormData requests
    async postFormData<T>(endpoint: string, formData: FormData, config?: RequestInit): Promise<T> {
        // For FormData requests, we should not set Content-Type header
        // Let the browser set it with the proper boundary

        const headers = {
            ...config?.headers,
        };

        // Remove Content-Type from headers if it exists to let browser set it
        const finalHeaders = { ...headers };
        delete finalHeaders['Content-Type'];

        // Inject Auth Token if available
        const token = localStorage.getItem('authToken');
        console.log('Checking for authToken:', token ? 'FOUND' : 'NOT FOUND');
        if (token) {
            console.log('Adding Authorization header with token:', token.substring(0, 20) + '...');
            finalHeaders['Authorization'] = `Bearer ${token}`;
        } else {
            console.warn('No authToken in localStorage - requests will fail with 403');
        }

        const url = `${LEGAL_CHATBOT_BASE_URL}${endpoint}`;

        const response = await fetch(url, {
            ...config,
            method: 'POST',
            body: formData,
            headers: finalHeaders,
        });

        if (!response.ok) {
            const error: any = new Error('Legal Chatbot API Error');
            error.status = response.status;
            error.statusText = response.statusText;
            try {
                error.data = await response.json();
            } catch (e) {
                error.data = null;
            }
            throw error;
        }

        // Handle empty responses
        if (response.status === 204) {
            return {} as T;
        }

        return response.json();
    }
}

export const legalChatbotApiClient = new LegalChatbotApiClient();

// Document Management Endpoints
export const uploadDocuments = async (formData: FormData): Promise<any> => {
    try {
        const response = await legalChatbotApiClient.postFormData<any>('/documents/upload', formData);
        return response;
    } catch (error) {
        console.error('Failed to upload documents:', error);
        throw error;
    }
};

export const processDocuments = async (data: any): Promise<any> => {
    try {
        const response = await legalChatbotApiClient.post<any, any>('/documents/process', data);
        return response;
    } catch (error) {
        console.error('Failed to process documents:', error);
        throw error;
    }
};

// Chat Endpoints
export const chatWithAI = async (
    message: string,
    chatbotMode: 'Document Only' | 'Layman Explanation' | 'Hybrid (Smart)' | 'General Chat' = 'General Chat',
    conversationId: string = 'default'
): Promise<any> => {
    try {
        // First, ensure we have a valid session
        // For authenticated users, let the backend handle session management
        // based on the JWT token in the authorization header
        let sessionId = localStorage.getItem('backend_session_id');
        console.log('Current session ID from localStorage:', sessionId);

        // For authenticated users, we'll let the backend handle session ID
        // based on their JWT token, so we don't need to explicitly pass session ID
        if (!sessionId) {
            console.log('No active session found, backend will manage session based on JWT token');
        } else {
            console.log('Using session ID:', sessionId);
        }

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
            session_id: sessionId || undefined, // Use session ID if available, let backend handle if not
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

// Session Management
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

// Document Chat - Uses Document Analysis Service on Port 8001
export const chatWithDocument = async (
    message: string,
    documentId?: string,
    sessionId?: string
): Promise<any> => {
    try {
        const token = localStorage.getItem('authToken');

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Try the newer endpoint first
        const url = `${DOCUMENT_SERVICE_BASE_URL}/api/document/chat`;

        console.log('Calling document chat endpoint:', url);

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                message: message,
                document_id: documentId,
                session_id: sessionId || localStorage.getItem('backend_session_id'),
            }),
        });

        if (!response.ok) {
            // If the newer endpoint fails, try the older pattern
            if (response.status === 404) {
                console.log('Trying alternative endpoint...');
                const altUrl = `${DOCUMENT_SERVICE_BASE_URL}/chat-with-document/`;
                const altResponse = await fetch(altUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        message: message,
                        document_id: documentId,
                        session_id: sessionId || localStorage.getItem('backend_session_id'),
                    }),
                });

                if (!altResponse.ok) {
                    throw new Error(`Document chat failed: ${altResponse.status} ${altResponse.statusText}`);
                }

                return altResponse.json();
            }

            throw new Error(`Document chat failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
    } catch (error) {
        console.error('Document Chat API Error:', error);
        throw error;
    }
};