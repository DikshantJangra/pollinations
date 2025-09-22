/**
 * Safety Checker for Nano Banana (Vertex AI Gemini)
 * Uses OpenAI Vision API to pre-screen prompts and images before sending to Google
 */

import fetch from "node-fetch";
import debug from "debug";

const log = debug("pollinations:safety-checker");
const errorLog = debug("pollinations:safety-checker:error");

export interface SafetyCheckResult {
    safe: boolean;
    reason?: string;
}

/**
 * Check prompt and images for Google Vertex AI safety compliance
 * Uses OpenAI's vision capabilities to analyze both text and images
 * 
 * @param prompt - Text prompt to analyze
 * @param imageUrls - Optional array of image URLs to analyze
 * @returns Promise<SafetyCheckResult> - Whether content is safe and reason if not
 */
export async function checkPromptSafety(
    prompt: string, 
    imageUrls?: string[]
): Promise<SafetyCheckResult> {
    
    // System message with instructions
    const systemMessage = `Analyze image generation requests.

fails safety check ONLY if
- 1) Sexual/adult/NSFW content
- 2) Violence, weapons, gore, blood
- 3) Hate speech, discrimination
- 4) Illegal activities, drugs
- 5) Self-harm, suicide content
- 6) Disturbing/shocking imagery

Don't be strict. If in doubt, be permissive

Respond ONLY with JSON: {"safe": true/false, "reason": "category number and reason. explain what in the prompt/image is unsafe"}`;

    // User message with content to analyze
    const userContent = [
        { type: "text", text: `TEXT PROMPT: "${prompt}"` },
        ...(imageUrls || []).map(url => ({
            type: "image_url",
            image_url: { url, detail: "low" } // Low detail for speed
        }))
    ];

    try {
        log("Checking safety for prompt:", prompt.substring(0, 100));
        if (imageUrls?.length) {
            log("Including reference images:", imageUrls.length);
        }

        const response = await fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai-fast',
                messages: [
                    { role: 'use', content: systemMessage },
                    { role: 'user', content: userContent }
                ],
                max_tokens: 100,
                temperature: 0
            })
        });
        
        if (!response.ok) {
            errorLog("Safety check API error:", response.status, response.statusText);
            // Fail-safe: block if safety check fails
            return {
                safe: false,
                reason: `Safety check failed: ${response.status} ${response.statusText}`
            };
        }

        const result = await response.json();
        
        if (!result.choices?.[0]?.message?.content) {
            errorLog("Invalid response format from safety check");
            return {
                safe: false,
                reason: "Safety check failed: Invalid response format"
            };
        }

        // Parse the JSON response
        const analysis = JSON.parse(result.choices[0].message.content);
        
        const safetyResult = {
            safe: analysis.safe === true,
            reason: analysis.reason || 'Safety analysis completed'
        };

        log("Safety check result:", safetyResult.safe ? "SAFE" : "BLOCKED", safetyResult.reason);
        
        return safetyResult;
        
    } catch (error) {
        errorLog("Error in safety check:", error.message);
        
        // Fail-safe: block if safety check fails
        return {
            safe: false,
            reason: `Safety check failed: ${error.message}`
        };
    }
}
