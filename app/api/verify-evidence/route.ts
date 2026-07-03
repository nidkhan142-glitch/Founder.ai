import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { taskDescription, evidenceNote, evidenceLink, customApiKey } = body;

        const apiKey = customApiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { approved: false, score: 0, reason: "OpenRouter API Key is missing. Please configure OPENROUTER_API_KEY in .env.local" },
                { status: 400 }
            );
        }

        const systemInstruction = `You are the evidence-verification engine inside FounderAI. Your job is to check whether a founder's submitted evidence actually proves they completed today's validation task — not just that they typed something into a box.

RULES:
- Check three things: (1) Is this real, specific evidence — not vague, generic, or gibberish text? (2) Does it actually relate to today's assigned task? (3) Is it specific enough (names, quotes, numbers, concrete details) rather than a vague summary?
- Reject anything that is clearly random characters, placeholder text, or unrelated to the task.
- Reject vague claims with no specifics (e.g. "I talked to someone and it went well" with no detail).
- A short but specific and genuine note (e.g. a real quote or concrete observation) should be approved even if brief — brevity is not automatically a reason to reject.
- A link alone (with no note) is acceptable if the task type matches a link-based action (e.g. landing page, demo, doc).
- Be a fair but strict gatekeeper — your purpose is to protect the integrity of the founder's evidence trail, not to make life difficult for honest founders.
- The "score" should reflect evidence quality on a 0-100 scale, used only for internal record-keeping, not as a pass/fail threshold by itself.
- The "reason" must be specific enough that the user knows exactly what to fix if rejected, or what was good if approved. Keep it to 1-2 sentences.

You MUST respond with ONLY a valid JSON object, no markdown, no backticks. Match this exact structure:
{
  "approved": boolean,
  "score": number (0-100),
  "reason": "string (1-2 sentences)"
}`;

        const userPrompt = `Today's assigned task: "${taskDescription}"

Founder's submitted evidence note: "${evidenceNote || "(none provided)"}"
Founder's submitted evidence link: "${evidenceLink || "(none provided)"}"

Evaluate whether this evidence genuinely proves the task was completed. Output the JSON now.`;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "nvidia/nemotron-3-super-120b-a12b:free",
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: userPrompt }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OPENROUTER RAW ERROR (Call 3):", errorText);
            throw new Error(errorText);
        }

        const data = await response.json();

        if (!data || !data.choices || !data.choices[0]?.message?.content) {
            const errorMsg = data?.error?.message || "Invalid response format from OpenRouter API.";
            throw new Error(errorMsg);
        }

        const responseText = data.choices[0].message.content;
        const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);

        return NextResponse.json(parsed);

    } catch (error: any) {
        console.error("Evidence verification error:", error);
        // Fail open with a clear message rather than blocking the user on a system error
        return NextResponse.json(
            { approved: false, score: 0, reason: "We couldn't verify your evidence right now due to a system error. Please try again." },
            { status: 200 }
        );
    }
}