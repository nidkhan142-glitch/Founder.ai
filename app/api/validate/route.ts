import { NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

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
      customApiKey // Allow developer/user to supply their own key in UI if env variable is missing
    } = body;

    // Check for API key
    const apiKey = customApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API Key is missing. Please configure GEMINI_API_KEY in .env.local or enter it in the settings." },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Using gemini-2.0-flash which supports structured outputs and is stable
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            verdict: { type: SchemaType.STRING, enum: ["Proceed", "Pivot", "Abandon"], format: "enum" },
            confidence: { type: SchemaType.STRING, enum: ["High", "Medium", "Low"], format: "enum" },
            whatMustBeTrue: { type: SchemaType.STRING, description: "ONE specific, falsifiable claim — a measurable threshold that, if true, means this idea has legs." },
            problemConfidence: { type: SchemaType.INTEGER, description: "Score out of 10" },
            problemConfidenceJustification: { type: SchemaType.STRING, description: "One-sentence justification for the problem confidence score." },
            first10Customers: { type: SchemaType.STRING, description: "One specific, narrow real-world group. Do not use generic demographics." },
            currentAlternatives: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
              description: "3 to 5 things people actually do instead (behaviors, e.g. doing nothing, using spreadsheets)"
            },
            evidenceStatus: {
              type: SchemaType.OBJECT,
              properties: {
                exists: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Evidence that exists" },
                doesNotExist: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Evidence that DOES NOT exist" }
              },
              required: ["exists", "doesNotExist"]
            },
            validationMatrix: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  dimension: { type: SchemaType.STRING, enum: ["Problem Severity", "Customer Urgency", "Market Accessibility", "Competition Risk", "Founder Advantage"], format: "enum" },
                  score: { type: SchemaType.INTEGER, description: "Score out of 10" },
                  why: { type: SchemaType.STRING, description: "Exactly one sentence justifying this score" }
                },
                required: ["dimension", "score", "why"]
              }
            },
            biggestRisk: {
              type: SchemaType.OBJECT,
              properties: {
                assumption: { type: SchemaType.STRING, description: "The single highest-risk assumption the idea depends on" },
                failureScenario: { type: SchemaType.STRING, description: "One sentence describing the specific, realistic way this fails" }
              },
              required: ["assumption", "failureScenario"]
            },
            validationSprint: {
              type: SchemaType.OBJECT,
              properties: {
                experiment: { type: SchemaType.STRING, description: "A real-world test (interviews, smoke-test landing page, concierge MVP) — NOT 'build an MVP'" },
                successCriteria: { type: SchemaType.STRING, description: "A measurable, falsifiable threshold" },
                next3Actions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "3 concrete, actionable steps numbered" },
                requiredEvidence: { type: SchemaType.STRING, description: "What the user must bring back (e.g., interview notes, metrics)" }
              },
              required: ["experiment", "successCriteria", "next3Actions", "requiredEvidence"]
            }
          },
          required: [
            "verdict",
            "confidence",
            "whatMustBeTrue",
            "problemConfidence",
            "problemConfidenceJustification",
            "first10Customers",
            "currentAlternatives",
            "evidenceStatus",
            "validationMatrix",
            "biggestRisk",
            "validationSprint"
          ]
        }
      }
    });

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
  - If Goal = "Exploring a market," weight toward learning speed and density of feedback.`;

    const userPrompt = `
Analyze this startup idea based on the founder's onboarding answers:

Problem: "${problem}"
Customer: "${customer}"
Current Solution: "${currentSolution}"
Frequency: "${frequency}"
Consequence: "${consequence}"
Why You: "${whyYou}"
Evidence Level: "${evidence}" (Note: None means no interviews, 1-5 people means minimal signal, 6-20 people means moderate validation, 20+ means solid customer research)
Goal: "${goal}"

Output the structured analysis according to the schema rules.`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: systemInstruction
    });

    const responseText = result.response.text();
    const parsedData = JSON.parse(responseText);

    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error("Validation engine error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate validation report. Please try again." },
      { status: 500 }
    );
  }
}
