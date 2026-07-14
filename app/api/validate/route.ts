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
  }
}`;

    const userPrompt = `Analyze this startup idea based on the founder's onboarding answers:

Problem: "${problem}"
Customer: "${customer}"
Current Solution: "${currentSolution}"
Frequency: "${frequency}"
Consequence: "${consequence}"
Why You: "${whyYou}"
Evidence Level: "${evidence}" (Note: None means no interviews, 1-5 people means minimal signal, 6-20 people means moderate validation, 20+ means solid customer research)
Goal: "${goal}"

Output the structured JSON analysis now.`;

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json(
        { error: "Groq API Key is missing. Please configure GROQ_API_KEY in .env.local" },
        { status: 400 }
      );
    }

    console.log("GROQ KEY EXISTS:", !!groqApiKey);
    console.log("ABOUT TO CALL GROQ - CALL 1 (Report)");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPrompt }
        ]
      })
    });

    console.log("GROQ RESPONSE STATUS (Call 1):", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("GROQ RAW ERROR (Call 1):");
      console.error(errorText);
      throw new Error(errorText);
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;

    const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsedReport = JSON.parse(cleaned);

    console.log("CALL 1 SUCCESS - Report parsed");

    // ==================================================
    // CALL 2 — Generate 7-Day Sprint from FULL report
    // ==================================================

    const sprintSystemInstruction = `You are the sprint-planning engine inside FounderAI. A founder has just received a full validation report — your job is to turn it into a 7-day plan of small, real-world actions that produce evidence for the Re-Evaluation Engine to judge later.

RULES:
- Use the ENTIRE report (verdict, validation matrix scores, biggest risk, evidence gaps) to decide what the founder should focus on each day. A low Customer Urgency score or high Competition Risk score should change what you assign.
- Every single day's task must take a first-time founder 20 minutes or less to complete in one sitting. Never assign bulk asks like "interview 15 people" — instead assign ONE concrete action (e.g. "Send this message to ONE potential customer").
- Tasks must follow The Mom Test: focus on past behavior and current spending. NEVER use hypothetical-preference phrasing — banned: "would you pay," "what's the most you'd pay," "would you use," "what would make you switch." Instead ask about a real past instance ("walk me through the last time this happened") or assign a real low-effort commitment (waitlist, pre-order, LOI) and treat their action as the evidence.
- Include at least one task asking why their current solution (from "Current Solution" in the idea context) isn't good enough, and what it would take for them to abandon it — status-quo inertia is usually the real competitor.
- If the report shows low Customer Urgency or the problem happens monthly or less often, include a task that digs into one specific recent instance and its real cost in time or money, to test whether the pain is sharp enough to matter.
- Across the 7 days, target distinct people where possible rather than repeating the same contact, unless a day is explicitly a structured follow-up to a prior day's contact. Rotate outreach channel/platform across the week instead of using the same one every day, so the evidence doesn't collapse if one channel underperforms.
- Each day should build on the evidence from the previous day conceptually, moving from problem-validation early in the week toward solution/pricing validation later in the week, UNLESS the report's evidence gaps suggest a different order is more urgent.
- If the report's confidence is "Low" or verdict is "Abandon", the first 1-2 days should focus on a single sharp test of the biggest risk assumption before anything else.
- Keep task descriptions short, specific, and actionable — one or two sentences max.

You MUST respond with ONLY a valid JSON array of exactly 7 objects. No markdown, no backticks, no explanation. Match this exact structure:
[
  {
    "day": number (1-7),
    "title": "string (short label, e.g. 'Customer Discovery')",
    "task": "string (the specific action, ≤20 min)",
    "estimated_minutes": number,
    "evidence_reward": number (5-15, reflects how much this moves confidence),
    "status": "pending"
  }
]
`;

    const sprintUserPrompt = `Original idea context:
    Problem: "${problem}"
    Customer: "${customer}"
Current Solution: "${currentSolution}"
    Goal: "${goal}"

Complete validation report:
${JSON.stringify(parsedReport, null, 2)}

Based on this complete validation report, create a practical 7 - day execution sprint.Output the JSON array now.`;

    console.log("ABOUT TO CALL OPENROUTER - CALL 2 (Sprint)");

    let sprintDays: any[] = [];

    try {
      const sprintResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey} `,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
          messages: [
            { role: "system", content: sprintSystemInstruction },
            { role: "user", content: sprintUserPrompt }
          ]
        })
      });

      if (!sprintResponse.ok) {
        throw new Error(`Sprint call failed with status ${sprintResponse.status} `);
      }

      const sprintData = await sprintResponse.json();
      const sprintText = sprintData.choices[0].message.content;
      const match = sprintText.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("No JSON array found in primary response");
      sprintDays = JSON.parse(match[0]);

      console.log("CALL 2 SUCCESS -", sprintDays.length, "days");

    } catch (sprintError: any) {
      console.error("CALL 2 FAILED (primary model), trying fallback:", sprintError.message);

      try {
        const fallbackResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey} `,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "google/gemini-flash-1.5",
            messages: [
              { role: "system", content: sprintSystemInstruction },
              { role: "user", content: sprintUserPrompt }
            ]
          })
        });

        const fallbackData = await fallbackResponse.json();
        const fallbackText = fallbackData.choices[0].message.content;
        const fallbackMatch = fallbackText.match(/\[[\s\S]*\]/);
        if (!fallbackMatch) throw new Error("No JSON array found in fallback response");
        sprintDays = JSON.parse(fallbackMatch[0]);

        console.log("FALLBACK SUCCESS -", sprintDays.length, "days");

      } catch (fallbackError: any) {
        console.error("FALLBACK ALSO FAILED:", fallbackError.message);
        sprintDays = [];
      }
    }

    return NextResponse.json({
      ...parsedReport,
      sprint: sprintDays
    });

  } catch (error: any) {
    console.error("Validation engine error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate validation report. Please try again." },
      { status: 500 }
    );
  }
}