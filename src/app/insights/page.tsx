'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Button, Badge, Skeleton } from '@/components/ui';
import styles from './page.module.css';

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
    <div className={styles.messageAssistant}>
      <div className={styles.avatarAi}>🤖</div>
      <div className={styles.messageBubble}>
        <div className={styles.typingIndicator}>
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
        </div>
      </div>
    </div>
  );
}

// ─── Message Component ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  const confidenceVariant = message.confidence === 'high' ? 'success'
    : message.confidence === 'medium' ? 'warning' : 'destructive';

  return (
    <div className={isUser ? styles.messageUser : styles.messageAssistant}>
      {!isUser && <div className={styles.avatarAi}>🤖</div>}
      <div className={styles.messageBubble}>
        <div className={styles.messageContent}>
          {message.content.split('\n').map((line, i) => {
            if (line.startsWith('• ') || line.startsWith('- ')) {
              return (
                <div key={i} className={styles.messageBullet}>
                  <span className={styles.bulletDot}>•</span>
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
          <div className={styles.citations}>
            <div className={styles.citationsHeader}>
              <span>📊</span> Data Points
            </div>
            <div className={styles.citationsGrid}>
              {message.data_citations.map((citation, i) => (
                <div key={i} className={styles.citationCard}>
                  <div className={styles.citationMetric}>{citation.metric}</div>
                  <div className={styles.citationValue}>{citation.value}</div>
                  <div className={styles.citationPeriod}>{citation.period}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confidence badge */}
        {!isUser && message.confidence && (
          <div className={styles.confidence}>
            <Badge variant={confidenceVariant} size="sm">
              {message.confidence === 'high' ? '✅' : message.confidence === 'medium' ? '⚡' : '⚠️'}
              {' '}{message.confidence} confidence
            </Badge>
          </div>
        )}
      </div>
      {isUser && <div className={styles.avatarUser}>👤</div>}
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
      <AppShell fullWidth>
        <div className={styles.page}>
          {/* ── Conversation Sidebar ── */}
          <aside className={`${styles.sidebar} ${sidebarOpen ? '' : styles.sidebarCollapsed}`}>
            <div className={styles.sidebarHeader}>
              <h3 className={styles.sidebarTitle}>
                <span>💬</span> Conversations
              </h3>
              <Button variant="primary" size="sm" onClick={startNewConversation}>
                + New
              </Button>
            </div>

            <div className={styles.sidebarList}>
              {isSidebarLoading ? (
                <div>
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} height={48} variant="rect" />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className={styles.sidebarEmpty}>
                  <p className={styles.sidebarItemDate}>No conversations yet</p>
                  <p className={styles.sidebarItemDate}>Ask your first question below!</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    className={activeConversationId === conv.id ? styles.sidebarItemActive : styles.sidebarItem}
                    onClick={() => loadConversation(conv.id)}
                    aria-label={`Open conversation: ${conv.title}`}
                    aria-current={activeConversationId === conv.id ? 'true' : undefined}
                  >
                    <div className={styles.sidebarItemTitle}>{conv.title}</div>
                    <div className={styles.sidebarItemDate}>
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
              className={styles.sidebarToggle}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? '◀' : '▶'}
            </button>
          </aside>

          {/* ── Chat Area ── */}
          <div className={styles.chatArea}>
            {/* Messages */}
            <div className={styles.messages}>
              {showEmptyState && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>🧠</div>
                  <h2 className={styles.emptyTitle}>AI Financial Analyst</h2>
                  <p className={styles.emptySubtitle}>
                    Ask me anything about your business finances. I&apos;ll analyze your
                    transaction data and provide actionable insights.
                  </p>

                  <div className={styles.suggestionsGrid}>
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                      <button
                        key={i}
                        className={styles.suggestionCard}
                        onClick={() => sendMessage(q.text)}
                        aria-label={`Ask: ${q.text}`}
                      >
                        <span className={styles.suggestionIcon}>{q.icon}</span>
                        <span className={styles.suggestionText}>{q.text}</span>
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
                <div className={styles.followUps}>
                  <div className={styles.followUpsLabel}>Suggested follow-ups:</div>
                  <div className={styles.followUpsList}>
                    {followUpSuggestions.map((q, i) => (
                      <button
                        key={i}
                        className={styles.followUpChip}
                        onClick={() => sendMessage(q)}
                        aria-label={`Follow up: ${q}`}
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
              <div className={styles.errorBanner} role="alert">
                ⚠️ {error}
                <button
                  className={styles.errorDismiss}
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Input area */}
            <div className={styles.inputArea}>
              <div className={styles.inputContainer}>
                <textarea
                  ref={inputRef}
                  className={styles.textareaInput}
                  placeholder="Ask about your finances..."
                  aria-label="Ask about your finances"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={isLoading}
                  maxLength={2000}
                />
                <Button
                  variant="primary"
                  size="md"
                  className={styles.sendButton}
                  onClick={() => sendMessage(inputValue)}
                  disabled={isLoading || !inputValue.trim()}
                  aria-label="Send message"
                >
                  {isLoading ? (
                    <span className={styles.sendSpinner} />
                  ) : (
                    <span>➤</span>
                  )}
                </Button>
              </div>
              <div className={styles.inputHint}>
                Press Enter to send • Shift+Enter for new line
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </ErrorBoundary>
  );
}
