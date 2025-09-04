// HTTP utilities for text.pollinations.ai
import type { IncomingMessage, ServerResponse } from "node:http";
import { parse } from "node:url";
import crypto from "node:crypto";
import type { RequestData, CompletionResponse, APIError } from "../types/index.js";

/**
 * Set CORS headers for all responses
 */
export const setCORSHeaders = (res: ServerResponse): void => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Expose-Headers", [
        "X-Auth-Status",
        "X-Auth-Reason", 
        "X-Debug-Token",
        "X-Debug-Token-Source",
        "X-Debug-Referrer",
        "X-Debug-Legacy-Token-Match",
        "X-Debug-Allowlist-Match",
        "X-Debug-User-Id",
    ]);
};

/**
 * Parse request body as JSON
 */
export const parseRequestBody = async (req: IncomingMessage): Promise<any> => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                if (body.trim() === '') {
                    resolve({});
                } else {
                    resolve(JSON.parse(body));
                }
            } catch (error) {
                reject(new Error('Invalid JSON in request body'));
            }
        });
        req.on('error', reject);
    });
};

/**
 * Send JSON response
 */
export const sendJSONResponse = (res: ServerResponse, data: any, statusCode = 200): void => {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': statusCode === 200 ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    res.end(JSON.stringify(data));
};

/**
 * Send plain text response
 */
export const sendTextResponse = (res: ServerResponse, text: string, statusCode = 200): void => {
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': statusCode === 200 ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    res.end(text);
};

/**
 * Send streaming response
 */
export const sendStreamingResponse = (res: ServerResponse): void => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.flushHeaders();
};

/**
 * Send error response
 */
export const sendErrorResponse = (
    res: ServerResponse, 
    error: APIError, 
    statusCode?: number
): void => {
    const responseStatus = error.status || statusCode || 500;
    const errorResponse = {
        error: error.message || "An error occurred",
        status: responseStatus,
        ...(error.details && { details: error.details })
    };

    sendJSONResponse(res, errorResponse, responseStatus);
};

/**
 * Generate unique Pollinations ID
 */
export const generatePollinationsId = (): string => {
    const hash = crypto.randomBytes(16).toString("hex");
    return `pllns_${hash}`;
};

/**
 * Extract query parameters from URL
 */
export const getQueryParams = (req: IncomingMessage): Record<string, any> => {
    const { query } = parse(req.url || '', true);
    return query || {};
};

/**
 * Extract pathname from URL
 */
export const getPathname = (req: IncomingMessage): string => {
    const { pathname } = parse(req.url || '', true);
    return pathname || '/';
};

/**
 * Send content response (handles audio binary, text, JSON)
 * Compatible with Express server's sendContentResponse function
 */
export const sendContentResponse = (res: ServerResponse, completion: any): void => {
    // Handle the case where the completion is already a string or simple object
    if (typeof completion === "string") {
        sendTextResponse(res, completion);
        return;
    }

    // Only handle OpenAI-style responses (with choices array)
    if (completion.choices && completion.choices[0]) {
        const message = completion.choices[0].message;

        // If message is a string, send it directly
        if (typeof message === "string") {
            sendTextResponse(res, message);
            return;
        }

        // If message is not an object, convert to string
        if (!message || typeof message !== "object") {
            sendTextResponse(res, String(message));
            return;
        }

        // If the message contains audio, send the audio data as binary
        if (message.audio && message.audio.data) {
            res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=31536000, immutable'
            });

            // Convert base64 data to binary
            const audioBuffer = Buffer.from(message.audio.data, "base64");
            res.end(audioBuffer);
            return;
        }
        // For simple text responses, return just the content as plain text
        // This is the most common case and should be prioritized
        else if (message.content) {
            sendTextResponse(res, message.content);
            return;
        }
        // If there's other non-text content, return the message as JSON
        else if (Object.keys(message).length > 0) {
            sendJSONResponse(res, message);
            return;
        }
    }
    // Fallback for any other response structure
    else {
        console.error("Unrecognized completion format:", JSON.stringify(completion));
        sendTextResponse(res, "Response format not recognized");
    }
};
