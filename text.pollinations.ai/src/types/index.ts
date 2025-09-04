// Core types for text.pollinations.ai
import type { IncomingMessage, ServerResponse } from "node:http";

declare module "http" {
    interface IncomingMessage {
        body?: any;
        authResult?: AuthResult;
        params?: string[];
        query?: Record<string, any>;
    }
}

export interface RequestData {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stream?: boolean;
    referrer?: string;
    isPrivate?: boolean;
    private?: boolean;
    jsonMode?: boolean;
    voice?: string;
    audio?: AudioConfig;
    modalities?: string[];
    userInfo?: UserInfo;
}

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string | MessageContent[];
    audio?: AudioData;
}

export interface MessageContent {
    type: "text" | "image_url";
    text?: string;
    image_url?: {
        url: string;
        detail?: "low" | "high" | "auto";
    };
}

export interface AudioConfig {
    voice: string;
    format: "mp3" | "pcm16";
}

export interface AudioData {
    data: string; // base64 encoded
    format: string;
}

export interface UserInfo {
    authenticated: boolean;
    tokenAuth: boolean;
    referrerAuth: boolean;
    tier: string;
    username?: string;
    userId?: string;
    referrer: string;
    cf_ray: string;
}

export interface AuthResult {
    authenticated: boolean;
    tokenAuth: boolean;
    referrerAuth: boolean;
    tier: string;
    username?: string;
    userId?: string;
    reason?: string;
    debugInfo?: any;
}

export interface ModelConfig {
    name: string;
    aliases?: string[];
    tier: string;
    hidden?: boolean;
    audio?: boolean;
    provider?: string;
    handler?: string;
    transform?: (messages: ChatMessage[], options: any) => ChatMessage[];
}

export interface CompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: CompletionChoice[];
    usage?: TokenUsage;
    stream?: boolean;
    responseStream?: NodeJS.ReadableStream;
    error?: any;
    user_tier?: string;
    requestData?: RequestData;
}

export interface CompletionChoice {
    index: number;
    message: ChatMessage;
    finish_reason: string | null;
    delta?: Partial<ChatMessage>;
}

export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface QueueConfig {
    interval?: number;
    cap?: number;
    forceQueue?: boolean;
    maxQueueSize?: number;
}

// HTTP types
export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
export type MiddlewareFunction = (req: IncomingMessage, res: ServerResponse, next: () => void) => void | Promise<void>;

// Error types
export interface APIError extends Error {
    status?: number;
    code?: number;
    details?: any;
    provider?: string;
    originalProvider?: string;
    response?: {
        data?: any;
    };
}
