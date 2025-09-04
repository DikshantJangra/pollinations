// Authentication middleware for text.pollinations.ai
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAuthentication } from "../../../shared/auth-utils.js";
import { getIp } from "../../../shared/extractFromRequest.js";
import debug from "debug";
import type { AuthResult } from "../types/index.js";

const authLog = debug("pollinations:auth");

// Extend IncomingMessage to include authResult
declare module "node:http" {
    interface IncomingMessage {
        authResult?: AuthResult;
        body?: any;
    }
}

/**
 * Authentication middleware that handles token and referrer authentication
 */
export const authMiddleware = async (
    req: IncomingMessage, 
    res: ServerResponse, 
    next: () => void
): Promise<void> => {
    try {
        const authResult = await handleAuthentication(req, null, authLog);
        req.authResult = authResult;
        next();
    } catch (error) {
        authLog("Authentication error:", error);
        // Continue with unauthenticated request
        req.authResult = {
            authenticated: false,
            tokenAuth: false,
            referrerAuth: false,
            tier: "anonymous"
        };
        next();
    }
};

/**
 * IP blocking middleware
 */
const blockedIPs = new Set<string>();

export const loadBlockedIPs = async (): Promise<void> => {
    try {
        const { promises: fs } = await import("fs");
        const path = await import("path");
        const BLOCKED_IPS_LOG = path.join(process.cwd(), "blocked_ips.txt");
        
        const data = await fs.readFile(BLOCKED_IPS_LOG, "utf8");
        const ips = data.split("\n").filter((ip) => ip.trim());
        for (const ip of ips) {
            blockedIPs.add(ip.trim());
        }
        authLog(`Loaded ${blockedIPs.size} blocked IPs from file`);
    } catch (error: any) {
        if (error.code !== "ENOENT") {
            authLog("Error loading blocked IPs:", error);
        }
    }
};

export const blockIPMiddleware = (
    req: IncomingMessage, 
    res: ServerResponse, 
    next: () => void
): void => {
    const ip = getIp(req);
    if (blockedIPs.has(ip)) {
        res.writeHead(403);
        res.end();
        return;
    }
    next();
};
