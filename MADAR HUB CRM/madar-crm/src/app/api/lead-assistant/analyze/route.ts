import { NextResponse } from "next/server";
import { analyzeInputSchema, analyzeOutputSchema, type AnalyzeOutput } from "@/lib/lead-assistant-validation";
import { aiConfig, AI_SYSTEM_PROMPT } from "@/lib/ai-config";

const MOCK_RESPONSES: Record<string, Partial<AnalyzeOutput>> = {
  default: {
    customerName: null,
    phone: null,
    latestMessage: null,
    languageDetected: "English",
    leadType: "General Coworking Lead",
    leadStatus: "New Lead",
    interest: null,
    suggestedPackage: null,
    budgetMentioned: null,
    numberOfPeople: null,
    requestedDate: null,
    requestedTime: null,
    visitIntent: false,
    paymentIntent: false,
    locationRequest: false,
    equipmentRequest: null,
    importantNotes: null,
    nextAction: "Send a welcome message and ask about their needs.",
    followUpDate: null,
    suggestedReply: "Hi! Welcome to Madar Hub. How can we help you today? Are you looking for a day pass, monthly workspace, or something else?",
    confidenceScore: 0.3,
  },
};

function buildMockResponse(chat: string): AnalyzeOutput {
  const lower = chat.toLowerCase();
  const mock: AnalyzeOutput = {
    ...(MOCK_RESPONSES.default as AnalyzeOutput),
  };

  const phoneMatch = chat.match(/(\+?250\s?\d{9}|0\s?7\d{2}\s?\d{6}|\d{3}[-\s]?\d{3}[-\s]?\d{3,4})/);
  if (phoneMatch) mock.phone = phoneMatch[1].replace(/\s/g, "");

  const namePatterns = [
    /(?:I'm|I am|My name is|This is)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
    /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/m,
  ];
  for (const pattern of namePatterns) {
    const nameMatch = chat.match(pattern);
    if (nameMatch) { mock.customerName = nameMatch[1]; break; }
  }

  if (lower.includes("kinyarwanda") || lower.includes("amahoro") || lower.includes("murakoze") || lower.includes("mbifuz")) {
    mock.languageDetected = "Kinyarwanda";
  } else if (lower.includes("français") || lower.includes("bonjour") || lower.includes("merci") || lower.includes("combien")) {
    mock.languageDetected = "French";
  }

  if (lower.includes("location") || lower.includes("where") || lower.includes("km") || lower.includes("kimironko") || lower.includes("address") || lower.includes("direction")) {
    mock.leadType = "Location Request";
    mock.leadStatus = "New Lead";
    mock.locationRequest = true;
    mock.suggestedReply = "We are located in Kimironko, KG 42 Street, Kigali — near the back side of Four Square Church. Would you like to visit and see the space?";
  }

  if (lower.includes("day pass") || lower.includes("one day") || lower.includes("for a day") || lower.includes("hour") || lower.includes("short stay") || lower.includes("just today") || lower.includes("couple of hours")) {
    mock.leadType = "Day Pass Lead";
    mock.leadStatus = "Asked Price";
    mock.interest = "Day Pass";
    mock.suggestedPackage = "Coworking Day Pass — 10,000 RWF/day";
    mock.suggestedReply = "Our Coworking Day Pass is 10,000 RWF per day, which gives you full access to our workspace with good internet and a professional environment. Would you like to come in today or tomorrow?";
  }

  if (lower.includes("monthly") || lower.includes("fixed desk") || lower.includes("routine") || lower.includes("workspace") || lower.includes("bring my monitor") || lower.includes("permanent desk")) {
    mock.leadType = "Monthly Fixed Desk Lead";
    mock.leadStatus = "Asked Price";
    mock.interest = "Monthly Fixed Desk";
    mock.suggestedPackage = "Fixed Desk Monthly Subscription — 100,000 RWF/month";
    mock.suggestedReply = "Our Fixed Desk Monthly Subscription is 100,000 RWF per month. You get a dedicated desk in a quiet, professional workspace, and you can bring your own monitor. Would you like to schedule a visit to see the space?";
  }

  if (lower.includes("student") || lower.includes("study") || lower.includes("3,000") || lower.includes("3000") || lower.includes("revision") || lower.includes("exam")) {
    mock.leadType = "Student Study Lead";
    mock.leadStatus = "Asked Price";
    mock.interest = "Student Study Space";
    mock.suggestedPackage = "Student Study Pass — 3,000 RWF/day";
    mock.suggestedReply = "Our Student Study Pass is only 3,000 RWF per day — perfect for studying or revision in a quiet environment. Adults can use it too, just book in advance. What day would you like to come?";
  }

  if (lower.includes("training") || lower.includes("workshop") || lower.includes("presentation") || lower.includes("25 people") || lower.includes("30 people") || lower.includes("team meeting") || lower.includes("conference")) {
    const peopleMatch = chat.match(/(\d+)\s*(?:people|persons|participants|attendees|pax)/i);
    const numPeople = peopleMatch ? parseInt(peopleMatch[1]) : null;
    if ((numPeople && numPeople > 25) || lower.includes("30 people")) {
      mock.leadType = "Training Room Lead";
      mock.suggestedPackage = "Meeting Room Rental — 30,000 RWF for 8 hours (full day)";
      mock.suggestedReply = "For a full day (8 hours), our Meeting Room Rental is 30,000 RWF, with a Smart TV, whiteboard, tables, and chairs included. We also offer a 4-hour option at 25,000 RWF. May I know the date and number of people?";
    } else {
      mock.leadType = "Meeting Room Lead";
      mock.suggestedPackage = "Meeting Room Rental — 25,000 RWF for 4 hours or 30,000 RWF for 8 hours";
      mock.suggestedReply = "Our Meeting Room Rental is 25,000 RWF for 4 hours or 30,000 RWF for 8 hours (full day), with a 50-inch Smart TV, whiteboard, tables, and chairs. May I know the date and number of people?";
    }
    mock.leadStatus = "Asked Price";
    mock.interest = "Meeting / Training Room";
    mock.numberOfPeople = numPeople;
    mock.paymentIntent = numPeople !== null;
  }

  if (lower.includes("private office") || lower.includes("team room") || lower.includes("partitioned room") || lower.includes("organization") || lower.includes("6 members") || lower.includes("600,000") || lower.includes("600000")) {
    mock.leadType = "Private Office Lead";
    mock.leadStatus = "Asked Price";
    mock.interest = "Private Team Room";
    mock.suggestedPackage = "Private Team Room — 600,000 RWF/month, up to 6 members";
    mock.suggestedReply = "Our Private Team Room is 600,000 RWF per month, suitable for up to 6 registered members. It includes parking, washrooms, and a quiet environment. Would you like to schedule a visit to see the space?";
  }

  if (lower.includes("visit") || lower.includes("come over") || lower.includes("drop by") || lower.includes("stop by") || lower.includes("see the space")) {
    mock.visitIntent = true;
    if (lower.includes("tomorrow")) {
      mock.leadStatus = "Visit Scheduled";
      mock.requestedDate = "Tomorrow";
    } else if (lower.includes("today")) {
      mock.leadStatus = "Hot Lead";
      mock.requestedDate = "Today";
    } else if (lower.includes("next week")) {
      mock.leadStatus = "Visit Scheduled";
      mock.requestedDate = "Next week";
    } else {
      mock.leadStatus = "Hot Lead";
    }
    if (mock.leadStatus === "Hot Lead") {
      mock.suggestedReply = "Great! We would love to welcome you at Madar Hub. What time would be convenient for you to visit?";
    }
  }

  const priceMatch = chat.match(/(\d[\d,]+)\s*RWF/i) || chat.match(/(\d[\d,]+)\s*frw/i);
  if (priceMatch) mock.budgetMentioned = priceMatch[1] + " RWF";

  const datePatterns = [
    { pattern: /(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i },
    { pattern: /(tomorrow)/i },
    { pattern: /(today)/i },
    { pattern: /(next\s+week)/i },
    { pattern: /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)/i },
  ];
  for (const { pattern } of datePatterns) {
    const m = chat.match(pattern);
    if (m) { mock.requestedDate = m[1]; break; }
  }

  const timeMatch = chat.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (timeMatch) mock.requestedTime = timeMatch[1];

  mock.confidenceScore = (mock.customerName ? 0.2 : 0) + (mock.interest ? 0.2 : 0) + (mock.visitIntent ? 0.15 : 0) + (mock.requestedDate ? 0.15 : 0) + (mock.phone ? 0.15 : 0) + (mock.budgetMentioned ? 0.1 : 0) + 0.1;
  mock.confidenceScore = Math.min(Math.round(mock.confidenceScore * 100) / 100, 1);

  const lines = chat.split("\n").filter((l: string) => l.trim());
  if (lines.length > 0) {
    mock.latestMessage = lines[lines.length - 1].trim().slice(0, 200);
  }

  return mock;
}

async function callAI(chat: string): Promise<AnalyzeOutput> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return buildMockResponse(chat);
  }

  const baseURL = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: aiConfig.model,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.maxTokens,
      response_format: { type: "json_object" },
      enable_thinking: false,
      messages: [
        { role: "system", content: AI_SYSTEM_PROMPT },
        { role: "user", content: chat },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AI API error ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI response is not valid JSON");
    parsed = JSON.parse(jsonMatch[0]);
  }

  return analyzeOutputSchema.parse(parsed);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = analyzeInputSchema.parse(body);

    const result = await callAI(input.chat);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const zodError = error as Error & { issues: unknown[] };
      return NextResponse.json({ success: false, error: "Validation failed", details: zodError.issues }, { status: 400 });
    }

    console.error("[lead-assistant] Analysis error:", error instanceof Error ? error.message : "Unknown error");

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to analyze lead" },
      { status: 500 }
    );
  }
}