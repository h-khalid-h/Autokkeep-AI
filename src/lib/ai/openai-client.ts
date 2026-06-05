import OpenAI from 'openai';
import { DEFAULT_OPENAI_MODEL, FALLBACK_OPENAI_MODEL } from '@/lib/constants/ai';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export function getModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
}

export function getFallbackModel(): string {
  return process.env.OPENAI_FALLBACK_MODEL || FALLBACK_OPENAI_MODEL;
}

export async function callWithFallback(
  createParams: (model: string) => OpenAI.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.ChatCompletion> {
  const openai = getOpenAIClient();
  const primaryModel = getModel();
  
  try {
    return await openai.chat.completions.create(createParams(primaryModel));
  } catch (error: unknown) {
    const isRetryable = error instanceof OpenAI.APIError && 
      (error.status >= 500 || error.status === 429 || error.status === 408);
    
    if (!isRetryable) throw error;
    
    const fallbackModel = getFallbackModel();
    if (fallbackModel === primaryModel) throw error;
    
    const status = (error as { status: number }).status;
    console.warn(`[OpenAI] Primary model ${primaryModel} failed (${status}), retrying with ${fallbackModel}`);
    return await openai.chat.completions.create(createParams(fallbackModel));
  }
}
