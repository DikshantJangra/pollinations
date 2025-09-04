// CORS middleware for text.pollinations.ai
import type { IncomingMessage, ServerResponse } from "node:http";
import { setCORSHeaders } from "../utils/http.js";

/**
 * CORS middleware that sets appropriate headers for all requests
 */
export const corsMiddleware = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    setCORSHeaders(res);
    
    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    next();
};
