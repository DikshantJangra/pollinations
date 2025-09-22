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
    const systemMessage = `Analyze image generation requests for Google Vertex AI safety compliance.

BLOCK if it requests:
- Sexual/adult/NSFW content
- Violence, weapons, gore, blood
- Hate speech, discrimination
- Illegal activities, drugs
- Real people's names/faces/likenesses
- Self-harm, suicide content
- Copyright characters/brands (Disney, Marvel, etc.)
- Disturbing/shocking imagery

Respond ONLY with JSON: {"safe": true/false, "reason": "brief explanation if unsafe"}`;

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
                    { role: 'system', content: systemMessage },
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
