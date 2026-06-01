
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/ai/chat — AI Financial Analyst Chat
// GET  /api/ai/chat — Fetch conversation history
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { analyzeFinancialQuestion } from '@/lib/ai/analyst';
import { rateLimit } from '@/lib/rate-limit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ─── Request / Response Types ──────────────────────────────────────────────────

interface ChatRequestBody {
  message: string;
  conversationId?: string;
  entityId: string;
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  data_citations?: Array<{ metric: string; value: string; period: string }>;
  suggested_follow_ups?: string[];
  confidence?: string;
}

// ─── POST: Send message to AI Analyst ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 requests per minute per IP
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'ai-chat' });
    if (limited) return limited;

    const supabase = await createServerClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ChatRequestBody = await request.json();
    const { message, conversationId, entityId } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'message is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId is required' },
        { status: 400 }
      );
    }

    // Enforce message length limit
    if (message.length > 2000) {
      return NextResponse.json(
        { error: 'Message is too long. Maximum 2000 characters.' },
        { status: 400 }
      );
    }

    // Validate entity access
    const { data: membership } = await db
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: entity } = await db
      .from('entities')
      .select('id, org_id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Determine conversation ID (create new or use existing)
    let activeConversationId = conversationId;

    if (!activeConversationId) {
      // Create a new conversation
      const { data: newConversation, error: convError } = await db
        .from('ai_conversations')
        .insert({
          entity_id: entityId,
          user_id: user.id,
          title: message.substring(0, 100),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (convError || !newConversation) {
        console.error('[AI Chat] Failed to create conversation:', convError);
        return NextResponse.json(
          { error: 'Failed to create conversation' },
          { status: 500 }
        );
      }

      activeConversationId = newConversation.id;
    }

    // Store the user message
    await db.from('ai_conversation_messages').insert({
      conversation_id: activeConversationId,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    });

    // Call the AI analyst
    const response = await analyzeFinancialQuestion(message, entityId, db);

    // Store the assistant response
    await db.from('ai_conversation_messages').insert({
      conversation_id: activeConversationId,
      role: 'assistant',
      content: response.answer,
      data_citations: response.dataCitations,
      suggested_follow_ups: response.suggestedFollowUps,
      confidence: response.confidence,
      created_at: new Date().toISOString(),
    });

    // Update conversation timestamp
    await db
      .from('ai_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', activeConversationId);

    return NextResponse.json({
      conversationId: activeConversationId,
      answer: response.answer,
      dataCitations: response.dataCitations,
      suggestedFollowUps: response.suggestedFollowUps,
      confidence: response.confidence,
    });
  } catch (error) {
    console.error('[AI Chat] Error:', error);
    return NextResponse.json(
      { error: 'Chat request failed' },
      { status: 500 }
    );
  }
}

// ─── GET: Fetch conversation history ───────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 30 requests per minute per IP
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'ai-chat-get' });
    if (limited) return limited;

    const supabase = await createServerClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const conversationId = searchParams.get('conversationId');

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId is required' },
        { status: 400 }
      );
    }

    // Validate entity access
    const { data: membership } = await db
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: entity } = await db
      .from('entities')
      .select('id, org_id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // If a specific conversation ID is requested, return its messages
    if (conversationId) {
      // Verify the conversation belongs to this entity and user (IDOR prevention)
      const { data: conversation } = await db
        .from('ai_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('entity_id', entityId)
        .eq('user_id', user.id)
        .single();

      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }

      const { data: messages } = await db
        .from('ai_conversation_messages')
        .select('id, role, content, data_citations, suggested_follow_ups, confidence, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      return NextResponse.json({
        conversationId,
        messages: (messages || []) as ConversationMessage[],
      });
    }

    // Otherwise return all conversations for the entity
    const { data: conversations } = await db
      .from('ai_conversations')
      .select('id, title, created_at, updated_at')
      .eq('entity_id', entityId)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50);

    return NextResponse.json({
      conversations: conversations || [],
    });
  } catch (error) {
    console.error('[AI Chat] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
