import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { originalReport, evidenceSummary, apiKey: customApiKey } = body;

        const apiKey = customApiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "API key missing" }, { status: 400 });
        }

        const systemPrompt = `You are the re-evaluation engine inside FounderAI. A founder has completed a 7-day validation sprint and collected real evidence. Your job is to update their startup verdict based on what they actually found.

RULES:
- Read the original report carefully — verdict, biggest risk, confidence level.
- Read the evidence summary — what did the founder actually find in 7 days?
- Update the verdict: Proceed, Pivot, or Abandon — based purely on evidence quality and what it proves or disproves.
- If evidence is weak or vague, lower confidence or change verdict to Pivot/Abandon.
- If evidence is strong and specific, raise confidence or confirm Proceed.
- Give a clear, specific 2-3 sentence explanation of why the verdict changed or stayed the same.
- Give one concrete next step — what should the founder do NOW based on this verdict.

Respond ONLY with valid JSON, no markdown:
{
  "updatedVerdict": "Proceed" | "Pivot" | "Abandon",
  "updatedConfidence": "High" | "Medium" | "Low",
  "verdictChanged": boolean,
  "explanation": "string (2-3 sentences)",
  "nextStep": "string (1 concrete action)"
}`;

        const userPrompt = `Original validation report:
${JSON.stringify(originalReport, null, 2)}

Evidence collected during 7-day sprint:
${evidenceSummary}

Re-evaluate this startup idea based on the evidence. Output JSON now.`;

        const MODELS = [
            "meta-llama/llama-3.3-70b-instruct:free",
            "nvidia/nemotron-3-super-120b-a12b:free",
            "openai/gpt-oss-20b:free",
        ];

        let lastError = "";
        for (const model of MODELS) {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt },
                    ],
                }),
            });

            if (response.ok) {
                const data = await response.json();
                const text = data.choices[0].message.content;
                const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
                const parsed = JSON.parse(cleaned);
                return NextResponse.json(parsed);
            }

            lastError = await response.text();
            console.error(`Re-eval model ${model} failed:`, lastError);
        }

        throw new Error(lastError);
    } catch (err: any) {
        console.error("Re-evaluation error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}