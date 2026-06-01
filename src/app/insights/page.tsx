'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import GlobalDashboardHeader from '@/components/dashboard/GlobalDashboardHeader';
import './insights.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface DataCitation {
  metric: string;
  value: string;
  period: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  data_citations?: DataCitation[];
  suggested_follow_ups?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// ─── Suggested Questions ────────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  { icon: '📈', text: 'Why did expenses increase this month?' },
  { icon: '🔄', text: 'What subscriptions am I paying for?' },
  { icon: '⏳', text: 'How much runway do I have?' },
  { icon: '🏢', text: 'Which vendors cost the most?' },
  { icon: '💰', text: 'What is my profit margin this month?' },
  { icon: '📊', text: 'Compare this month to last month' },
];

// ─── Typing Indicator Component ─────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="insights-message insights-message-assistant">
      <div className="insights-message-avatar insights-avatar-ai">🤖</div>
      <div className="insights-message-bubble">
        <div className="insights-typing-indicator">
          <span className="insights-typing-dot" />
          <span className="insights-typing-dot" />
          <span className="insights-typing-dot" />
        </div>
      </div>
    </div>
  );
}

// ─── Message Component ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`insights-message ${isUser ? 'insights-message-user' : 'insights-message-assistant'}`}>
      {!isUser && (
        <div className="insights-message-avatar insights-avatar-ai">🤖</div>
      )}
      <div className="insights-message-bubble">
        <div className="insights-message-content">
          {message.content.split('\n').map((line, i) => {
            if (line.startsWith('• ') || line.startsWith('- ')) {
              return (
                <div key={i} className="insights-message-bullet">
                  <span className="insights-bullet-dot">•</span>
                  <span>{line.substring(2)}</span>
                </div>
              );
            }
            if (line.trim() === '') return <br key={i} />;
            return <p key={i}>{line}</p>;
          })}
        </div>

        {/* Data Citations */}
        {!isUser && message.data_citations && message.data_citations.length > 0 && (
          <div className="insights-citations">
            <div className="insights-citations-header">
              <span>📊</span> Data Points
            </div>
            <div className="insights-citations-grid">
              {message.data_citations.map((citation, i) => (
                <div key={i} className="insights-citation-card">
                  <div className="insights-citation-metric">{citation.metric}</div>
                  <div className="insights-citation-value">{citation.value}</div>
                  <div className="insights-citation-period">{citation.period}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confidence badge */}
        {!isUser && message.confidence && (
          <div className={`insights-confidence badge badge-${
            message.confidence === 'high' ? 'success' :
            message.confidence === 'medium' ? 'warning' : 'destructive'
          }`}>
            {message.confidence === 'high' ? '✅' : message.confidence === 'medium' ? '⚡' : '⚠️'}
            {' '}{message.confidence} confidence
          </div>
        )}
      </div>
      {isUser && (
        <div className="insights-message-avatar insights-avatar-user">👤</div>
      )}
    </div>
  );
}

// ─── Insights Page ──────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { selectedEntity } = useEntity();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [inputValue, setInputValue] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSidebarLoading, setIsSidebarLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // ── Scroll to bottom on new messages ────────────────────────────────────────
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ── Fetch conversation list ─────────────────────────────────────────────────
  React.useEffect(() => {
    if (!selectedEntity?.id) return;
    let cancelled = false;

    async function fetchConversations() {
      setIsSidebarLoading(true);
      try {
        const res = await fetch(`/api/ai/chat?entityId=${selectedEntity!.id}`);
        if (!res.ok) throw new Error('Failed to fetch conversations');
        const data = await res.json();
        if (!cancelled) {
          setConversations(data.conversations || []);
        }
      } catch (err) {
        console.error('[Insights] Failed to load conversations:', err);
      } finally {
        if (!cancelled) setIsSidebarLoading(false);
      }
    }

    fetchConversations();
    return () => { cancelled = true; };
  }, [selectedEntity]);

  // ── Load messages for a conversation ────────────────────────────────────────
  const loadConversation = React.useCallback(async (conversationId: string) => {
    if (!selectedEntity?.id) return;
    setActiveConversationId(conversationId);
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/ai/chat?entityId=${selectedEntity.id}&conversationId=${conversationId}`
      );
      if (!res.ok) throw new Error('Failed to load conversation');
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error('[Insights] Failed to load conversation:', err);
      setError('Failed to load conversation');
    } finally {
      setIsLoading(false);
    }
  }, [selectedEntity]);

  // ── Send a message ──────────────────────────────────────────────────────────
  const sendMessage = React.useCallback(async (messageText: string) => {
    if (!selectedEntity?.id || !messageText.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageText.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText.trim(),
          conversationId: activeConversationId || undefined,
          entityId: selectedEntity.id,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed (${res.status})`);
      }

      const data = await res.json();

      // Update conversation ID if this was a new conversation
      if (!activeConversationId && data.conversationId) {
        setActiveConversationId(data.conversationId);
        // Refresh conversation list
        const listRes = await fetch(`/api/ai/chat?entityId=${selectedEntity.id}`);
        if (listRes.ok) {
          const listData = await listRes.json();
          setConversations(listData.conversations || []);
        }
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer,
        created_at: new Date().toISOString(),
        data_citations: data.dataCitations,
        suggested_follow_ups: data.suggestedFollowUps,
        confidence: data.confidence,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error('[Insights] Send message error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  }, [selectedEntity, activeConversationId, isLoading]);

  // ── Start new conversation ──────────────────────────────────────────────────
  const startNewConversation = React.useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }, []);

  // ── Handle keyboard submit ──────────────────────────────────────────────────
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  }, [inputValue, sendMessage]);

  // ── Get latest follow-up suggestions ────────────────────────────────────────
  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
  const followUpSuggestions = lastAssistantMessage?.suggested_follow_ups || [];

  // ── Empty state (no messages) ───────────────────────────────────────────────
  const showEmptyState = messages.length === 0 && !isLoading;

  return (
    <ErrorBoundary componentName="AI Financial Analyst">
      <div className="dashboard-layout">
        <GlobalDashboardHeader />

        <div className="dashboard-main">
          {/* ── Conversation Sidebar ── */}
          <aside className={`insights-sidebar ${sidebarOpen ? '' : 'insights-sidebar-collapsed'}`}>
            <div className="insights-sidebar-header">
              <h3 className="insights-sidebar-title">
                <span>💬</span> Conversations
              </h3>
              <button
                className="btn btn-sm btn-primary"
                onClick={startNewConversation}
              >
                + New
              </button>
            </div>

            <div className="insights-sidebar-list">
              {isSidebarLoading ? (
                <div className="insights-sidebar-loading">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="skeleton" style={{ height: '48px', marginBottom: '8px' }} />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="insights-sidebar-empty">
                  <p className="text-caption">No conversations yet</p>
                  <p className="text-caption">Ask your first question below!</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    className={`insights-sidebar-item ${activeConversationId === conv.id ? 'active' : ''}`}
                    onClick={() => loadConversation(conv.id)}
                  >
                    <div className="insights-sidebar-item-title">{conv.title}</div>
                    <div className="insights-sidebar-item-date">
                      {new Date(conv.updated_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Sidebar collapse toggle (mobile) */}
            <button
              className="insights-sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? '◀' : '▶'}
            </button>
          </aside>

          {/* ── Chat Area ── */}
          <div className="insights-chat-area">
            {/* Messages */}
            <div className="insights-messages">
              {showEmptyState && (
                <div className="insights-empty-state">
                  <div className="insights-empty-icon">🧠</div>
                  <h2 className="insights-empty-title">AI Financial Analyst</h2>
                  <p className="insights-empty-subtitle">
                    Ask me anything about your business finances. I&apos;ll analyze your
                    transaction data and provide actionable insights.
                  </p>

                  <div className="insights-suggestions-grid">
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                      <button
                        key={i}
                        className="insights-suggestion-card"
                        onClick={() => sendMessage(q.text)}
                      >
                        <span className="insights-suggestion-icon">{q.icon}</span>
                        <span className="insights-suggestion-text">{q.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {isLoading && messages.length > 0 && <TypingIndicator />}

              {/* Follow-up suggestions */}
              {!isLoading && followUpSuggestions.length > 0 && (
                <div className="insights-follow-ups">
                  <div className="insights-follow-ups-label">Suggested follow-ups:</div>
                  <div className="insights-follow-ups-list">
                    {followUpSuggestions.map((q, i) => (
                      <button
                        key={i}
                        className="insights-follow-up-chip"
                        onClick={() => sendMessage(q)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Error banner */}
            {error && (
              <div className="insights-error" role="alert">
                ⚠️ {error}
                <button
                  className="insights-error-dismiss"
                  onClick={() => setError(null)}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Input area */}
            <div className="insights-input-area">
              <div className="insights-input-container">
                <textarea
                  ref={inputRef}
                  className="insights-input"
                  placeholder="Ask about your finances..."
                  aria-label="Ask about your finances"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={isLoading}
                  maxLength={2000}
                />
                <button
                  className="insights-send-btn btn-primary"
                  onClick={() => sendMessage(inputValue)}
                  disabled={isLoading || !inputValue.trim()}
                  aria-label="Send message"
                >
                  {isLoading ? (
                    <span className="insights-send-spinner" />
                  ) : (
                    <span>➤</span>
                  )}
                </button>
              </div>
              <div className="insights-input-hint">
                Press Enter to send • Shift+Enter for new line
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
