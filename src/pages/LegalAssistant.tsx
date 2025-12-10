import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Sparkles,
    Loader2,
    FileText as FileTextIcon,
    MessageCircle,
    User,
    Send,
    Bot,
    Plus,
    Trash2,
    ChevronRight,
    ChevronLeft,
    Settings,
    Wand2,
    FileSearch,
    Paperclip,
    Scale,
    RefreshCw,
    Activity,
    Database,
    BarChart3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { chatWithAI, getConversations, getConversation, createConversation, deleteConversation, getEmbeddingsStatus, getSessionStats, resetSession } from "@/services/legalApi";
import { Conversation as ApiConversation } from "@/services/legalApi";
import { useAuth } from "@/hooks/useAuth";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

const LegalAssistant = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [conversations, setConversations] = useState<ApiConversation[]>([]);
    const [currentConversation, setCurrentConversation] = useState<ApiConversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [responseMode, setResponseMode] = useState<"Hybrid (Smart)" | "Document Only" | "General Chat" | "Layman Explanation">("General Chat");
    const { toast } = useToast();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // UI states
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isTyping, setIsTyping] = useState(false);

    // Additional data states
    const [sessionStats, setSessionStats] = useState<any>(null);
    const [embeddingsStatus, setEmbeddingsStatus] = useState<any>(null);
    const [loadingStats, setLoadingStats] = useState(true);

    // Typing animation states
    const [typingMessages, setTypingMessages] = useState<Record<string, string>>({});
    const [currentLines, setCurrentLines] = useState<Record<string, number>>({});

    // Effect to handle typing animation
    useEffect(() => {
        const timers: NodeJS.Timeout[] = [];

        const currentMessageIds = messages.map(m => m.id);
        const typingMessageIds = Object.keys(typingMessages);
        const obsoleteIds = typingMessageIds.filter(id => !currentMessageIds.includes(id));

        if (obsoleteIds.length > 0) {
            setTypingMessages(prev => {
                const updated = { ...prev };
                obsoleteIds.forEach(id => delete updated[id]);
                return updated;
            });
            setCurrentLines(prev => {
                const updated = { ...prev };
                obsoleteIds.forEach(id => delete updated[id]);
                return updated;
            });
        }

        messages.forEach((message) => {
            if (message.role === "assistant") {
                if (!typingMessages[message.id] && message.content) {
                    const lines = message.content.split('\n');
                    let currentLine = 0;
                    let displayedContent = "";

                    const typeNextLine = () => {
                        if (currentLine < lines.length) {
                            setCurrentLines(prev => ({
                                ...prev,
                                [message.id]: currentLine
                            }));

                            displayedContent += lines[currentLine] + (currentLine < lines.length - 1 ? '\n' : '');
                            setTypingMessages(prev => ({
                                ...prev,
                                [message.id]: displayedContent
                            }));
                            currentLine++;
                            const timer = setTimeout(typeNextLine, 200);
                            timers.push(timer);
                        }
                    };
                    const timer = setTimeout(typeNextLine, 200);
                    timers.push(timer);
                }
            }
        });

        return () => {
            timers.forEach(timer => clearTimeout(timer));
        };
    }, [messages]);

    // Load conversations on mount
    useEffect(() => {
        loadConversations();
    }, []);

    // Load messages when conversation changes
    useEffect(() => {
        if (currentConversation) {
            loadConversationMessages(currentConversation.id);
        } else {
            setMessages([]);
        }
    }, [currentConversation]);

    // Scroll to bottom
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Close sidebar when typing
    useEffect(() => {
        if (input.trim() && isSidebarOpen) {
            setIsSidebarOpen(false);
        }
    }, [input, isSidebarOpen]);

    // Load additional data (stats, embeddings status)
    useEffect(() => {
        loadAdditionalData();
    }, []);

    const loadAdditionalData = async () => {
        try {
            setLoadingStats(true);
            // Load session statistics
            const stats = await getSessionStats();
            setSessionStats(stats);

            // Load embeddings status
            const status = await getEmbeddingsStatus();
            setEmbeddingsStatus(status);
        } catch (error) {
            console.error("Failed to load additional data:", error);
        } finally {
            setLoadingStats(false);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const loadConversations = async () => {
        try {
            const fetchedConversations = await getConversations();
            setConversations(fetchedConversations);

            if (!currentConversation && fetchedConversations.length > 0) {
                setCurrentConversation(fetchedConversations[0]);
            } else if (fetchedConversations.length === 0) {
                createNewConversation();
            }
        } catch (error) {
            console.error("Failed to load conversations:", error);
            toast({
                title: "Error",
                description: "Failed to load conversations.",
                variant: "destructive"
            });
        }
    };

    const loadConversationMessages = async (conversationId: string) => {
        try {
            const conversation = await getConversation(conversationId);
            const formattedMessages: Message[] = conversation.history.map((msg, index) => ({
                id: `${conversationId}-${index}`,
                role: msg.role as "user" | "assistant",
                content: msg.content,
                timestamp: new Date()
            }));
            setMessages(formattedMessages);

            const initialTypingMessages: Record<string, string> = {};
            const initialCurrentLines: Record<string, number> = {};
            formattedMessages.forEach(message => {
                if (message.role === "assistant") {
                    initialTypingMessages[message.id] = message.content;
                    const lines = message.content.split('\n');
                    initialCurrentLines[message.id] = lines.length;
                }
            });
            setTypingMessages(initialTypingMessages);
            setCurrentLines(initialCurrentLines);
        } catch (error) {
            console.error("Failed to load conversation messages:", error);
            toast({
                title: "Error",
                description: "Failed to load conversation messages.",
                variant: "destructive"
            });
        }
    };

    const createNewConversation = async () => {
        try {
            const newConversation = await createConversation("General Chat");

            setConversations([newConversation, ...conversations]);
            setCurrentConversation(newConversation);
            setMessages([]);
            setInput("");
            setTypingMessages({});
            setCurrentLines({});

            toast({
                title: "New conversation created",
                description: "Start chatting with the Legal Assistant."
            });
        } catch (error) {
            console.error("Failed to create conversation:", error);
            toast({
                title: "Error",
                description: "Failed to create new conversation.",
                variant: "destructive"
            });
        }
    };

    const selectConversation = (conversation: ApiConversation) => {
        setCurrentConversation(conversation);
    };

    const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
        e.stopPropagation();

        try {
            const success = await deleteConversation(conversationId);
            if (success) {
                const updatedConversations = conversations.filter(conv => conv.id !== conversationId);
                setConversations(updatedConversations);

                if (currentConversation?.id === conversationId) {
                    if (updatedConversations.length > 0) {
                        setCurrentConversation(updatedConversations[0]);
                    } else {
                        setCurrentConversation(null);
                        createNewConversation();
                    }
                    setTypingMessages({});
                    setCurrentLines({});
                }

                toast({
                    title: "Conversation deleted",
                    description: "The conversation has been removed."
                });
            }
        } catch (error) {
            console.error("Failed to delete conversation:", error);
            toast({
                title: "Error",
                description: "Failed to delete conversation.",
                variant: "destructive"
            });
        }
    };

    const handleResetSession = async () => {
        try {
            const success = await resetSession();
            if (success) {
                // Reload additional data after reset
                await loadAdditionalData();
                toast({
                    title: "Session reset",
                    description: "Your session has been reset successfully."
                });
            }
        } catch (error) {
            console.error("Failed to reset session:", error);
            toast({
                title: "Error",
                description: "Failed to reset session.",
                variant: "destructive"
            });
        }
    };

    const handleRefreshData = async () => {
        await loadAdditionalData();
        toast({
            title: "Data refreshed",
            description: "Session data has been updated."
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        try {
            setIsLoading(true);
            setIsTyping(true);

            const userMessage: Message = {
                id: Date.now().toString(),
                role: "user",
                content: input,
                timestamp: new Date()
            };

            const newMessages = [...messages, userMessage];
            setMessages(newMessages);
            setInput("");

            const response = await chatWithAI(
                input,
                responseMode,
                currentConversation?.id || "default"
            );

            setTimeout(() => {
                const aiMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: response.response,
                    timestamp: new Date()
                };

                setMessages([...newMessages, aiMessage]);
            }, 300);

            if (messages.length === 0 && currentConversation) {
                const updatedConversations = conversations.map(conv =>
                    conv.id === currentConversation.id
                        ? { ...conv, title: input.substring(0, 30) + (input.length > 30 ? "..." : "") }
                        : conv
                );
                setConversations(updatedConversations);
            }

            if (currentConversation) {
                const updatedConversations = conversations.map(conv =>
                    conv.id === currentConversation.id
                        ? { ...conv, lastMessage: input.substring(0, 50) + (input.length > 50 ? "..." : "") }
                        : conv
                );
                setConversations(updatedConversations);
            }

        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to get response. Please try again.",
                variant: "destructive",
            });
            console.error("Chat error:", error);
        } finally {
            setIsLoading(false);
            setIsTyping(false);
        }
    };

    const quickSuggestions = [
        "What are my rights as a tenant?",
        "How do I file for divorce?",
        "What is the statute of limitations for personal injury?",
        "How do I create a will?"
    ];

    return (
        <div className="flex h-screen w-full bg-background">
            {/* Toggle Sidebar Button */}
            {!isSidebarOpen && (
                <Button
                    variant="outline"
                    size="icon"
                    className="fixed top-20 right-4 z-20 p-2"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                >
                    <ChevronLeft className="h-5 w-5" />
                </Button>
            )}

            {/* Main Chat Area */}
            <div className={`flex-1 flex flex-col overflow-hidden relative ${isSidebarOpen ? 'mr-96' : ''}`}>
                {/* Messages Area */}
                <ScrollArea className="flex-1 p-4 pb-32">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center max-w-2xl mx-auto">
                            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                <Scale className="h-8 w-8 text-primary" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                                How can I help you today?
                            </h2>
                            <p className="text-muted-foreground mb-8">
                                Ask any legal question and get expert answers.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg">
                                {quickSuggestions.map((suggestion, index) => (
                                    <Button
                                        key={index}
                                        variant="outline"
                                        className="h-auto p-4 text-left justify-start whitespace-normal break-words hover:border-primary/50 transition-colors"
                                        onClick={() => setInput(suggestion)}
                                    >
                                        <span className="text-sm">{suggestion}</span>
                                    </Button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 max-w-5xl mx-auto pb-20">
                            {messages.map((message) => {
                                const displayContent = message.role === "assistant"
                                    ? typingMessages[message.id] || ""
                                    : message.content;

                                const lines = displayContent.split('\n');
                                const currentLine = message.role === "assistant" ? currentLines[message.id] || 0 : lines.length;

                                return (
                                    <div
                                        key={message.id}
                                        className={cn(
                                            "flex gap-3",
                                            message.role === "user" ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        {message.role === "assistant" && (
                                            <Avatar className="h-8 w-8 flex-shrink-0">
                                                <AvatarFallback className="bg-primary/10 text-primary">
                                                    <Bot className="h-4 w-4" />
                                                </AvatarFallback>
                                            </Avatar>
                                        )}
                                        <div className={cn(
                                            "max-w-[85%] rounded-2xl px-4 py-3",
                                            message.role === "user"
                                                ? "bg-primary text-primary-foreground rounded-tr-none"
                                                : "bg-muted rounded-tl-none"
                                        )}>
                                            <div className="whitespace-pre-wrap text-sm">
                                                {lines.map((line, index) => (
                                                    <div
                                                        key={index}
                                                        className={cn(
                                                            "transition-all duration-300 ease-out",
                                                            index > currentLine ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
                                                        )}
                                                    >
                                                        {line
                                                            .replace(/\*\*(.*?)\*\*/g, '$1')
                                                            .replace(/\*(.*?)\*/g, '$1')
                                                            .replace(/__(.*?)__/g, '$1')
                                                            .replace(/_(.*?)_/g, '$1')
                                                            .replace(/^#+\s*(.*?)$/gm, '$1')
                                                        }
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        {message.role === "user" && (
                                            <Avatar className="h-8 w-8 flex-shrink-0">
                                                <AvatarFallback className="bg-muted text-foreground">
                                                    <User className="h-4 w-4" />
                                                </AvatarFallback>
                                            </Avatar>
                                        )}
                                    </div>
                                );
                            })}
                            {isTyping && (
                                <div className="flex gap-3 justify-start">
                                    <Avatar className="h-8 w-8 flex-shrink-0">
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                            <Bot className="h-4 w-4" />
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="bg-muted rounded-2xl rounded-tl-none px-4 py-3">
                                        <div className="flex space-x-1">
                                            <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                            <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                            <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '600ms' }}></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}

                    {/* Input Area - Floating */}
                    <div className="absolute bottom-6 left-0 right-0 px-4 z-10 pointer-events-none">
                        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto pointer-events-auto shadow-2xl rounded-2xl bg-background/80 backdrop-blur-md border border-border/50 p-2">
                            <div className="flex gap-2 items-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 flex-shrink-0 rounded-xl"
                                    disabled={isLoading}
                                >
                                    <Paperclip className="h-5 w-5 text-muted-foreground" />
                                </Button>
                                <Textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Message Legal Assistant..."
                                    className="min-h-[50px] max-h-[200px] resize-none flex-1 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                    disabled={isLoading}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSubmit(e);
                                        }
                                    }}
                                />
                                <Button
                                    type="submit"
                                    size="icon"
                                    className="h-10 w-10 flex-shrink-0 rounded-xl mb-1"
                                    disabled={isLoading || !input.trim()}
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <Send className="h-5 w-5" />
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>
                </ScrollArea>
            </div>

            {/* Fixed Right Sidebar */}
            {isSidebarOpen && (
                <div className="fixed right-0 top-16 bottom-0 w-96 border-l border-border bg-card flex flex-col">
                    <div className="p-4 border-b border-border flex items-center justify-between">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Settings className="h-5 w-5" />
                            Options
                        </h2>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 p-0 -mr-2"
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        >
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </div>

                    <ScrollArea className="flex-1 p-4">
                        <div className="space-y-6">
                            {/* Response Mode */}
                            <div className="space-y-3">
                                <h3 className="font-medium text-sm flex items-center gap-2">
                                    <Wand2 className="h-4 w-4" />
                                    Answer Style
                                </h3>
                                <Select value={responseMode} onValueChange={(value: any) => setResponseMode(value)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="General Chat">General chat</SelectItem>
                                        <SelectItem value="Layman Explanation">Simple Explanation</SelectItem>
                                        <SelectItem value="Hybrid (Smart)">Hybrid Mode</SelectItem>
                                        <SelectItem value="Document Only">Document Only</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Conversations */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-medium text-sm flex items-center gap-2">
                                        <MessageCircle className="h-4 w-4" />
                                        Conversations
                                    </h3>
                                    <div className="flex gap-1">
                                        <Button
                                            onClick={createNewConversation}
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            onClick={handleRefreshData}
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0"
                                        >
                                            <RefreshCw className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {conversations.map((conversation) => (
                                        <div
                                            key={conversation.id}
                                            className={cn(
                                                "p-3 rounded-lg cursor-pointer transition-colors text-sm",
                                                currentConversation?.id === conversation.id
                                                    ? "bg-primary/10 border border-primary/20"
                                                    : "hover:bg-muted"
                                            )}
                                            onClick={() => selectConversation(conversation)}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium truncate">{conversation.title}</h4>
                                                    <p className="text-xs text-muted-foreground truncate mt-1">
                                                        {conversation.lastMessage || "New conversation"}
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 ml-1 flex-shrink-0"
                                                    onClick={(e) => handleDeleteConversation(conversation.id, e)}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Session Statistics */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-medium text-sm flex items-center gap-2">
                                        <BarChart3 className="h-4 w-4" />
                                        Session Stats
                                    </h3>
                                    {loadingStats && (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    )}
                                </div>
                                
                                {sessionStats && (
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="bg-muted/50 p-2 rounded">
                                            <div className="font-medium">Queries</div>
                                            <div className="text-muted-foreground">{sessionStats.total_queries}</div>
                                        </div>
                                        <div className="bg-muted/50 p-2 rounded">
                                            <div className="font-medium">Tokens</div>
                                            <div className="text-muted-foreground">{sessionStats.total_tokens_used?.toLocaleString() || 0}</div>
                                        </div>
                                        <div className="bg-muted/50 p-2 rounded">
                                            <div className="font-medium">Flagged</div>
                                            <div className="text-muted-foreground">{sessionStats.flagged_queries || 0}</div>
                                        </div>
                                        <div className="bg-muted/50 p-2 rounded">
                                            <div className="font-medium">Duration</div>
                                            <div className="text-muted-foreground">{Math.round(sessionStats.session_duration_seconds || 0)}s</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* System Status */}
                            <div className="space-y-3">
                                <h3 className="font-medium text-sm flex items-center gap-2">
                                    <Activity className="h-4 w-4" />
                                    System Status
                                </h3>
                                
                                {embeddingsStatus && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Embeddings</span>
                                            <span className={embeddingsStatus.embeddings_loaded ? "text-green-600" : "text-red-600"}>
                                                {embeddingsStatus.embeddings_loaded ? "Loaded" : "Not Loaded"}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Vector DB</span>
                                            <span className={embeddingsStatus.vector_store_status === "connected" ? "text-green-600" : "text-red-600"}>
                                                {embeddingsStatus.vector_store_status === "connected" ? "Connected" : "Disconnected"}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Collections</span>
                                            <span className="text-muted-foreground">{embeddingsStatus.collections_count || 0}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Session Management */}
                            <div className="space-y-3">
                                <h3 className="font-medium text-sm flex items-center gap-2">
                                    <Database className="h-4 w-4" />
                                    Session Management
                                </h3>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="w-full text-xs"
                                    onClick={handleResetSession}
                                >
                                    Reset Session
                                </Button>
                            </div>

                            {/* Tools */}
                            <div className="space-y-3">
                                <h3 className="font-medium text-sm flex items-center gap-2">
                                    <Sparkles className="h-4 w-4" />
                                    Legal Tools
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-16 flex flex-col gap-1"
                                        onClick={() => navigate(user ? "/dashboard/interact" : "/public/interact")}
                                    >
                                        <FileTextIcon className="h-5 w-5" />
                                        <span className="text-xs">Interact</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-16 flex flex-col gap-1"
                                        onClick={() => navigate(user ? "/dashboard/draft" : "/public/draft")}
                                    >
                                        <FileSearch className="h-5 w-5" />
                                        <span className="text-xs">Draft</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
    );
};

export default LegalAssistant;
