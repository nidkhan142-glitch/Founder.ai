import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      problem,
      customer,
      currentSolution,
      frequency,
      consequence,
      whyYou,
      evidence,
      goal,
      customApiKey
    } = body;

    // Check for API key
    const apiKey = customApiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenRouter API Key is missing. Please configure OPENROUTER_API_KEY in .env.local" },
        { status: 400 }
      );
    }

    const systemInstruction = `You are the validation engine inside FounderAI, an AI accountability system for first-time founders. You are not a cheerleader and you are not ChatGPT. Your job is to force intellectual honesty before someone wastes months building the wrong thing.

RULES:
- Never hedge to be polite. If the idea is weak, say Abandon.
- Never assign a numeric score without a one-sentence justification attached to it.
- Never use generic personas ("students aged 16-22"). Always name a specific, narrow real-world group (e.g. "Mechanical Engineering sophomores at public universities who failed their midterms").
- Always explicitly state what evidence does NOT exist, not just what does.
- Identify exactly ONE biggest assumption. Do not list multiple. Pick the one that, if false, kills the idea.
- The output must be concise and readable in under 90 seconds. Keep explanation sentences short and punchy.
- The validation sprint must design experiments and scripts that adhere to "The Mom Test" rules: never ask hypothetical questions like "Would you buy X?" or "How much would you pay for Y?". Instead, focus on gathering data about their past behaviors, what they do now, and how much they spent to resolve it.
- Goal context changes tone:
  - If Goal = "College application portfolio," weight the verdict toward "is this demonstrably learnable/improvable, can they execute this validation to show leadership and execution capability," not just "is this a VC-fundable business."
  - If Goal = "Real business," weight toward market reality, customer acquisition costs, and actual commercial viability.
  - If Goal = "Side project," weight toward feasibility, personal enjoyment, and ease of no-code verification.
  - If Goal = "Exploring a market," weight toward learning speed and density of feedback.

You MUST respond with ONLY a valid JSON object. No markdown, no backticks, no explanation. Just raw JSON matching this exact structure:
{
  "verdict": "Proceed" | "Pivot" | "Abandon",
  "confidence": "High" | "Medium" | "Low",
  "whatMustBeTrue": "string",
  "problemConfidence": number (0-10),
  "problemConfidenceJustification": "string",
  "first10Customers": "string",
  "currentAlternatives": ["string", "string", "string"],
  "evidenceStatus": {
    "exists": ["string"],
    "doesNotExist": ["string"]
  },
  "validationMatrix": [
    { "dimension": "Problem Severity", "score": number, "why": "string" },
    { "dimension": "Customer Urgency", "score": number, "why": "string" },
    { "dimension": "Market Accessibility", "score": number, "why": "string" },
    { "dimension": "Competition Risk", "score": number, "why": "string" },
    { "dimension": "Founder Advantage", "score": number, "why": "string" }
  ],
  "biggestRisk": {
    "assumption": "string",
    "failureScenario": "string"
  },
  "validationSprint": {
    "experiment": "string",
    "successCriteria": "string",
    "next3Actions": ["string", "string", "string"],
    "requiredEvidence": "string"
  }
}`;

    const userPrompt = `Analyze this startup idea based on the founder's onboarding answers:

Problem: "${problem}"
Customer: "${customer}"   console.log("MODEL:", ""
Current Solution: "${currentSolution}"
Frequency: "${frequency}"
Consequence: "${consequence}"
Why You: "${whyYou}"
Evidence Level: "${evidence}" (Note: None means no interviews, 1-5 people means minimal signal, 6-20 people means moderate validation, 20+ means solid customer research)
Goal: "${goal}"

Output the structured JSON analysis now.`;

    console.log("OPENROUTER KEY EXISTS:", !!apiKey);
    console.log("MODEL:", "deepseek/deepseek-r1-0528:free");
    console.log("ABOUT TO CALL OPENROUTER");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b:free",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPrompt }
        ]
      })
    });

    console.log("OPENROUTER RESPONSE STATUS:", response.status);

    if (!response.ok) {
      const errorText = await response.text();

      console.error("OPENROUTER RAW ERROR:");
      console.error(errorText);

      throw new Error(errorText);
    }

    const data = await response.json();

    console.log("OPENROUTER SUCCESS:");
    console.log(JSON.stringify(data, null, 2));

    const responseText = data.choices[0].message.content;

    // Clean response in case model wraps in markdown
    const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsedData = JSON.parse(cleaned);

    return NextResponse.json(parsedData);

  } catch (error: any) {
    console.error("Validation engine error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate validation report. Please try again." },
      { status: 500 }
    );
  }
}