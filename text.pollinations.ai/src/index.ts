// TypeScript/Hono-style server for text.pollinations.ai
// This runs alongside the existing Express server for incremental migration
import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import dotenv from "dotenv";
import debug from "debug";

// Import types and utilities
import type { RequestData, CompletionResponse, AuthResult } from "./types/index.js";
import { 
    sendErrorResponse, 
    sendJSONResponse, 
    sendTextResponse, 
    sendStreamingResponse, 
    setCORSHeaders, 
    parseRequestBody, 
    getQueryParams, 
    getPathname, 
    generatePollinationsId, 
    sendContentResponse 
} from './utils/http.js';
import { corsMiddleware } from "./middleware/cors.js";
import { authMiddleware, blockIPMiddleware, loadBlockedIPs } from "./middleware/auth.js";

// Import existing modules (gradual migration)
import { availableModels } from "../availableModels.js";
import { generateTextPortkey } from "../generateTextPortkey.js";
import { getRequestData, prepareModelsForOutput, getUserMappedModel } from "../requestUtils.js";
import { setupFeedEndpoint, sendToFeedListeners } from "../feed.js";
import { processRequestForAds } from "../ads/initRequestFilter.js";
import { createStreamingAdWrapper } from "../ads/streamingAdWrapper.js";
import { logUserRequest } from "../userLogger.js";
import { checkAndLogMonitoredStrings, extractTextFromMessages } from "../utils/stringMonitor.js";
import { enqueue } from "../../shared/ipQueue.js";
import { getIp } from "../../shared/extractFromRequest.js";
import { hasSufficientTier } from "../../shared/tier-gating.js";

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const log = debug("pollinations:server:ts");
const errorLog = debug("pollinations:error:ts");
const authLog = debug("pollinations:auth:ts");

// Middleware chain
const applyMiddleware = async (
    req: IncomingMessage, 
    res: ServerResponse, 
    middlewares: Array<(req: IncomingMessage, res: ServerResponse, next: () => void) => void | Promise<void>>
): Promise<boolean> => {
    for (const middleware of middlewares) {
        let nextCalled = false;
        
        await new Promise<void>((resolve, reject) => {
            const next = () => {
                nextCalled = true;
                resolve();
            };
            
            try {
                const result = middleware(req, res, next);
                if (result instanceof Promise) {
                    result.catch(reject);
                }
            } catch (error) {
                reject(error);
            }
        });
        
        if (!nextCalled) {
            errorLog("Middleware did not call next()");
            return false;
        }
    }
    
    return true;
};

// Route handlers
const handleModels = (req: IncomingMessage, res: ServerResponse): void => {
    const models = prepareModelsForOutput(availableModels);
    sendJSONResponse(res, models);
};

const handleOpenAIModels = (req: IncomingMessage, res: ServerResponse): void => {
    const models = availableModels
        .filter((model) => !model.hidden)
        .map((model) => ({
            id: model.name,
            object: "model",
            created: Date.now(),
            owned_by: model.provider,
        }));
    
    sendJSONResponse(res, {
        object: "list",
        data: models,
    });
};

const handleCrossDomain = (req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(200, { "Content-Type": "application/xml" });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
  <allow-access-from domain="*" secure="false"/>
</cross-domain-policy>`);
};

// Feed handler - implement proper SSE streaming 
// Note: This is a simplified implementation for now - full feed integration needs more work
const handleFeed = (req: IncomingMessage, res: ServerResponse): void => {
    const query = getQueryParams(req);
    const providedPassword = query.password;
    const FEED_PASSWORD = process.env.FEED_PASSWORD;
    const isAuthenticated = providedPassword === FEED_PASSWORD;
    
    // Set up SSE headers
    res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    
    log("Feed client connected (authenticated: %s)", isAuthenticated);
    
    // Send initial connection message
    const initialMessage = {
        type: "connection",
        authenticated: isAuthenticated,
        timestamp: new Date().toISOString(),
        server: "typescript"
    };
    
    const encodedData = JSON.stringify(initialMessage)
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
    res.write(`data: ${encodedData}\n\n`);
    
    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
        if (!res.destroyed) {
            const heartbeatData = JSON.stringify({
                type: "heartbeat",
                timestamp: new Date().toISOString()
            });
            res.write(`data: ${heartbeatData}\n\n`);
        } else {
            clearInterval(heartbeat);
        }
    }, 30000); // 30 second heartbeat
    
    // Handle client disconnect
    req.on("close", () => {
        clearInterval(heartbeat);
        log("Feed client disconnected");
    });
    
    req.on("error", () => {
        clearInterval(heartbeat);
        log("Feed client error");
    });
};

/**
 * Handle root path - process GET requests with prompt parameter or redirect
 */
const handleRoot = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const query = getQueryParams(req);
    
    // If there's a prompt parameter, handle as text generation
    if (query.prompt) {
        await handleTextGeneration(req, res);
    } else {
        // Otherwise redirect to main site
        res.writeHead(302, { 'Location': 'https://sur.pollinations.ai' });
        res.end();
    }
};

// Main request handler for text generation
const handleTextGeneration = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const startTime = Date.now();
    
    try {
        // Parse request body for POST requests
        if (req.method === 'POST') {
            req.body = await parseRequestBody(req);
        }
        
        // Set up req.query and req.params for compatibility with getRequestData
        if (req.method === 'GET') {
            const pathname = getPathname(req);
            const query = getQueryParams(req);
            
            // Set up req.query for Express compatibility
            (req as any).query = query;
            
            // Set up req.params for prompt extraction
            if (!req.params) {
                if (query.prompt) {
                    // Use query parameter if provided
                    req.params = [query.prompt];
                } else if (pathname && pathname !== '/') {
                    // Use URL path as prompt (like Express server), decode URL encoding
                    req.params = [decodeURIComponent(pathname.substring(1))]; // Remove leading slash
                } else {
                    req.params = [''];
                }
            }
        }
        
        // Get request data using existing utility
        const requestData: RequestData = getRequestData(req) as RequestData;
        
        log("Request: model=%s referrer=%s", requestData.model, requestData.referrer);
        
        // Generate unique request ID
        const requestId = generatePollinationsId();
        
        // Get auth result from middleware
        const authResult: AuthResult = req.authResult || {
            authenticated: false,
            tokenAuth: false,
            referrerAuth: false,
            tier: "anonymous"
        };
        
        // Debug: Log authentication result
        log("Auth result: tier=%s, authenticated=%s, reason=%s", authResult.tier, authResult.authenticated, authResult.reason);
        
        // Tier gating
        const model = availableModels.find(
            (m) => m.name === requestData.model || m.aliases?.includes(requestData.model)
        );
        
        if (model) {
            const hasAccess = hasSufficientTier(authResult.tier, model.tier);
            if (!hasAccess) {
                const error = new Error(
                    `Model not found or tier not high enough. Your tier: ${authResult.tier}, required tier: ${model.tier}. To get a token or add a referrer, visit https://auth.pollinations.ai`
                );
                (error as any).status = 402;
                sendErrorResponse(res, error as any, 402);
                return;
            }
        } else {
            const error = new Error(`Model not found: ${requestData.model}`);
            (error as any).status = 404;
            sendErrorResponse(res, error as any, 404);
            return;
        }
        
        
        // Helper function to check if a model is an audio model and add necessary parameters
        const prepareRequestParameters = (requestParams: any): any => {
            const modelConfig = availableModels.find(
                (m) => m.name === requestParams.model || m.aliases?.includes(requestParams.model),
            );
            const isAudioModel = modelConfig && modelConfig.audio === true;

            log("Is audio model:", isAudioModel);

            // Create the final parameters object
            const finalParams = {
                ...requestParams,
            };

            // Add audio parameters if it's an audio model
            if (isAudioModel) {
                // Get the voice parameter from the request or use "alloy" as default
                const voice = requestParams.voice || requestParams.audio?.voice || "amuch";
                log(
                    "Adding audio parameters for audio model:",
                    requestParams.model,
                    "with voice:",
                    voice,
                );

                // Only add modalities and audio if not already provided in the request
                if (!finalParams.modalities) {
                    finalParams.modalities = ["text", "audio"];
                }

                // If audio format is already specified in the request, use that
                // Otherwise, use pcm16 for streaming and mp3 for non-streaming
                if (!finalParams.audio) {
                    finalParams.audio = {
                        voice: voice,
                        format: requestParams.stream ? "pcm16" : "mp3",
                    };
                } else if (!finalParams.audio.format) {
                    // If audio object exists but format is not specified
                    finalParams.audio.format = requestParams.stream ? "pcm16" : "mp3";
                }

                // Ensure these parameters are preserved in the final request
                requestParams.modalities = finalParams.modalities;
                requestParams.audio = finalParams.audio;
            }

            return finalParams;
        };

        // Apply user-specific model mapping if user is authenticated
        let finalRequestData = requestData;
        if (authResult.username) {
            try {
                const mappedModel = getUserMappedModel(authResult.username);
                if (mappedModel) {
                    log(
                        `🔄 Model override: ${requestData.model} → ${mappedModel} for user ${authResult.username}`,
                    );
                    finalRequestData = {
                        ...requestData,
                        model: mappedModel,
                    };
                }
            } catch (error: any) {
                if (error.status === 403) {
                    sendErrorResponse(res, error, error.status);
                    return;
                }
            }
        }

        // Monitor for specific strings in user input if user is authenticated
        if (authResult.username && finalRequestData.messages) {
            const inputText = extractTextFromMessages(finalRequestData.messages);
            await checkAndLogMonitoredStrings(inputText, authResult.username, "messages");
        }

        // Add user info to final request data
        const requestWithUserInfo = {
            ...finalRequestData,
            userInfo: {
                ...authResult,
                referrer: finalRequestData.referrer || "unknown",
                cf_ray: req.headers["cf-ray"] || "",
            },
        };

        const preparedRequest = prepareRequestParameters(requestWithUserInfo);

        // Queue configuration based on authentication
        let queueConfig = { interval: 6000 }; // Default
        if (authResult.tokenAuth) {
            queueConfig = { interval: 1000 };
        } else if (authResult.referrerAuth) {
            queueConfig = { interval: 3000 };
        }
        
        // Process request through queue
        await enqueue(req, async () => {
            try {
                // Generate text using existing handler
                const completion: CompletionResponse = await generateTextPortkey(
                    finalRequestData.messages, 
                    preparedRequest
                );
                
                completion.id = requestId;
                completion.user_tier = authResult.tier;
                
                if (completion.error) {
                    sendErrorResponse(res, completion.error, completion.error.status || 500);
                    return;
                }
                
                // Add user logging if enabled
                if (authResult.username) {
                    const totalProcessingTime = Date.now() - startTime;
                    logUserRequest(
                        authResult.username,
                        finalRequestData,
                        completion,
                        null,
                        (req as any).queueInfo,
                        totalProcessingTime,
                    );
                }

                // Process referral links if there's content in the response
                if (completion.choices?.[0]?.message?.content) {
                    // Check if this is an audio response - if so, skip content processing
                    const isAudioResponse =
                        completion.choices?.[0]?.message?.audio !== undefined;

                    // Skip ad processing for JSON mode responses
                    if (!isAudioResponse && !finalRequestData.jsonMode) {
                        try {
                            const content = completion.choices[0].message.content;

                            // Then process regular referral links
                            const adString = await processRequestForAds(
                                req,
                                content,
                                finalRequestData.messages,
                            );

                            // If an ad was generated, append it to the content
                            if (adString) {
                                completion.choices[0].message.content = content + "\n\n" + adString;
                            }
                        } catch (error) {
                            errorLog("Error processing content:", error);
                        }
                    }
                }

                // Extract token usage data
                const tokenUsage = completion.usage || {};

                // Send all requests to feed listeners, including private ones
                // The feed.js implementation will handle filtering for non-authenticated clients
                sendToFeedListeners(
                    completion.choices?.[0]?.message?.content || "Streaming response",
                    {
                        ...finalRequestData,
                        ...tokenUsage,
                    },
                    getIp(req),
                );

                // Handle streaming vs non-streaming responses
                if (finalRequestData.stream && completion.responseStream) {
                    // Enhanced streaming with ad injection
                    const messages = finalRequestData.messages || [];
                    const jsonMode = finalRequestData.jsonMode || false;
                    
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream; charset=utf-8',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    });
                    res.flushHeaders();
                    
                    // Check if we have messages and should process the stream for ads
                    if (messages.length > 0 && !jsonMode) {
                        log("Processing stream for ads with", messages.length, "messages");
                        
                        // Create a wrapped stream that will add ads at the end
                        const wrappedStream = await createStreamingAdWrapper(
                            completion.responseStream,
                            req,
                            messages,
                        );
                        
                        // Pipe the wrapped stream to the response
                        wrappedStream.pipe(res);
                        
                        // Handle client disconnect
                        req.on("close", () => {
                            log("Client disconnected");
                            if ((wrappedStream as any).destroy) {
                                (wrappedStream as any).destroy();
                            }
                            if ((completion.responseStream as any).destroy) {
                                (completion.responseStream as any).destroy();
                            }
                        });
                    } else {
                        // If no messages, no request object, or JSON mode, just pipe the stream directly
                        log("Skipping ad processing for stream" + (jsonMode ? " (JSON mode)" : ""));
                        completion.responseStream.pipe(res);
                        
                        // Handle client disconnect
                        req.on("close", () => {
                            log("Client disconnected");
                            if ((completion.responseStream as any).destroy) {
                                (completion.responseStream as any).destroy();
                            }
                        });
                    }
                } else if (req.method === 'GET' || req.url === '/') {
                    // Send content response for GET requests (handles audio binary, text, etc.)
                    sendContentResponse(res, completion);
                } else {
                    // Send OpenAI-compatible JSON response
                    const response = {
                        ...completion,
                        id: completion.id || requestId,
                        object: completion.object || "chat.completion",
                        created: completion.created || Date.now(),
                    };
                    sendJSONResponse(res, response);
                }
                
            } catch (error) {
                errorLog("Error in text generation:", error);
                sendErrorResponse(res, error as any);
            }
        }, queueConfig);
        
    } catch (error) {
        errorLog("Error handling request:", error);
        sendErrorResponse(res, error as any);
    }
};

// Router
const router = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const pathname = getPathname(req);
    
    log("Request: %s %s", req.method, pathname);
    
    // Apply middleware
    const middlewareSuccess = await applyMiddleware(req, res, [
        corsMiddleware,
        blockIPMiddleware,
        authMiddleware
    ]);
    
    if (!middlewareSuccess) return;
    
    // Route handling
    switch (pathname) {
        case '/':
            if (req.method === 'GET') {
                await handleRoot(req, res);
            } else if (req.method === 'POST') {
                await handleTextGeneration(req, res);
            }
            break;
            
        case '/models':
            handleModels(req, res);
            break;
            
        case '/openai/models':
            handleOpenAIModels(req, res);
            break;
            
        case '/crossdomain.xml':
            handleCrossDomain(req, res);
            break;
            
        case '/feed':
            handleFeed(req, res);
            break;
            
        default:
            // Handle OpenAI endpoints and catch-all routes
            if (pathname.startsWith('/openai/') || pathname.startsWith('/v1/chat/completions')) {
                await handleTextGeneration(req, res);
            } else if (req.method === 'GET') {
                // Catch-all GET handler for text generation (like Express server)
                await handleTextGeneration(req, res);
            } else {
                // 404 for unknown routes
                sendErrorResponse(res, new Error('Not Found') as any, 404);
            }
            break;
    }
};

// Create server
const createServer = (): http.Server => {
    const server = http.createServer(router);
    
    // Set timeout
    server.setTimeout(300000, (socket) => {
        socket.destroy();
    });
    
    server.on("connection", (socket) => {
        socket.on("timeout", () => {
            socket.destroy();
        });
        
        socket.on("error", () => {
            socket.destroy();
        });
    });
    
    return server;
};

// Start server (only if this file is run directly)
if (import.meta.url === `file://${process.argv[1]}`) {
    const port = process.env.PORT || process.env.PORT_TS || 16386; // Respect PORT env var, fallback to PORT_TS, then default
    
    loadBlockedIPs().then(() => {
        const server = createServer();
        server.listen(port, () => {
            console.log(`🌸 TypeScript text server listening on port ${port}`);
            console.log(`🔗 Test URL: http://localhost:${port}/models`);
            
            const debugEnv = process.env.DEBUG;
            if (debugEnv) {
                console.log(`🐛 Debug mode: ${debugEnv}`);
            } else {
                console.log(`💡 Pro tip: Want debug logs? Run with DEBUG=* for all the deets! ✨`);
            }
        });
    }).catch(error => {
        errorLog("Failed to start server:", error);
        process.exit(1);
    });
}

export { createServer, router };
