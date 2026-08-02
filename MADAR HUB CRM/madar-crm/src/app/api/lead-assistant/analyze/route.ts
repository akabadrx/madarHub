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
    followUpMessage: "Hi! Just following up on our conversation. Would you like to come visit Madar Hub and see the space? Let me know if you have any questions!",
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
    mock.suggestedPackage = "Coworking Day Pass — 7,000 RWF/day + VAT";
    mock.suggestedReply = "Our Coworking Day Pass is 7,000 RWF plus VAT per day, which gives you full access to our workspace with good internet and a professional environment. Would you like to come in today or tomorrow?";
  }

  if (lower.includes("monthly") || lower.includes("fixed desk") || lower.includes("routine") || lower.includes("workspace") || lower.includes("bring my monitor") || lower.includes("permanent desk")) {
    mock.leadType = "Monthly Fixed Desk Lead";
    mock.leadStatus = "Asked Price";
    mock.interest = "Monthly Fixed Desk";
    mock.suggestedPackage = "Fixed Desk Monthly Subscription — 100,000 RWF/month + VAT";
    mock.suggestedReply = "Our Fixed Desk Monthly Subscription is 100,000 RWF plus VAT per month. You get a dedicated desk in a quiet, professional workspace, and you can bring your own monitor. Would you like to schedule a visit to see the space?";
  }

  if (lower.includes("student") || lower.includes("study") || lower.includes("3,000") || lower.includes("3000") || lower.includes("revision") || lower.includes("exam")) {
    mock.leadType = "Student Study Lead";
    mock.leadStatus = "Asked Price";
    mock.interest = "Student Study Space";
    mock.suggestedPackage = "Student Study Pass — 3,000 RWF/day + VAT";
    mock.suggestedReply = "Our Student Study Pass is 3,000 RWF plus VAT per day — perfect for studying or revision in a quiet environment. Adults can use it too, just book in advance. What day would you like to come?";
  }

  if (lower.includes("training") || lower.includes("workshop") || lower.includes("presentation") || lower.includes("25 people") || lower.includes("30 people") || lower.includes("team meeting") || lower.includes("conference")) {
    const peopleMatch = chat.match(/(\d+)\s*(?:people|persons|participants|attendees|pax)/i);
    const numPeople = peopleMatch ? parseInt(peopleMatch[1]) : null;
    if (numPeople && numPeople > 25) {
      mock.leadType = "Training Room Lead";
      mock.suggestedPackage = null;
      mock.suggestedReply = "Our Meeting & Workshop Room accommodates up to 25 people. Would you be able to reduce the group to 25, or would you like help discussing another arrangement?";
    } else {
      mock.leadType = "Meeting Room Lead";
      mock.suggestedPackage = "Meeting Room — 20,000 RWF + VAT/4 hours; 30,000 RWF + VAT/6 hours; 40,000 RWF + VAT/12 hours";
      mock.suggestedReply = "Our VAT-exclusive Meeting Room rates are 20,000 RWF for up to 4 hours, 30,000 RWF for up to 6 hours, or 40,000 RWF for a full day of up to 12 hours. May I know the date, duration, and number of people?";
    }
    mock.leadStatus = "Asked Price";
    mock.interest = "Meeting / Training Room";
    mock.numberOfPeople = numPeople;
    mock.paymentIntent = numPeople !== null;
  }

  if (lower.includes("private office") || lower.includes("team room") || lower.includes("partitioned room") || lower.includes("organization") || lower.includes("6 members") || lower.includes("450,000") || lower.includes("450000") || lower.includes("600,000") || lower.includes("600000")) {
    mock.leadType = "Private Office Lead";
    mock.leadStatus = "Asked Price";
    mock.interest = "Private Team Room";
    const wantsCoffeeIncluded = lower.includes("600,000") || lower.includes("600000") || lower.includes("coffee included") || lower.includes("include coffee");
    mock.suggestedPackage = wantsCoffeeIncluded
      ? "Private Team Room — With Coffee — 600,000 RWF/month + VAT, up to 6 members"
      : "Private Team Room — Standard — 450,000 RWF/month + VAT, up to 6 members";
    mock.suggestedReply = wantsCoffeeIncluded
      ? "Our Private Team Room with coffee included is 600,000 RWF plus VAT per month for up to 6 registered members. Would you like to schedule a visit to see the space?"
      : "Our standard Private Team Room is 450,000 RWF plus VAT per month for up to 6 registered members. Coffee is not included, but team members can order it for 1,500 RWF plus VAT per cup instead of 3,000 RWF. We also offer a 600,000 RWF plus VAT option with coffee included. Would you like to schedule a visit?";
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

  if (mock.leadType === "Day Pass Lead") {
    mock.followUpMessage = "Hi! I was checking in — did you manage to visit Madar Hub? Our Day Pass is 7,000 RWF plus VAT and we'd love to host you. Let me know if you have any questions!";
  } else if (mock.leadType === "Monthly Fixed Desk Lead") {
    mock.followUpMessage = "Hi! Just following up on our chat about the monthly fixed desk. Would you like to schedule a visit to see the workspace? We can set up a tour at your convenience.";
  } else if (mock.leadType === "Student Study Lead") {
    mock.followUpMessage = "Hi! Checking in — are you still interested in the study space? It's 3,000 RWF plus VAT per day. Let me know which day works for you and I'll save you a spot!";
  } else if (mock.leadType === "Meeting Room Lead" || mock.leadType === "Training Room Lead") {
    mock.followUpMessage = "Hi! Following up on your meeting room inquiry. Have you finalized the date and number of attendees? Let me know and I'll confirm availability for you.";
  } else if (mock.leadType === "Private Office Lead") {
    mock.followUpMessage = "Hi! Just checking in about the private team room. Would you like to schedule a tour to see the space? Happy to walk you through everything in person.";
  } else if (mock.leadType === "Location Request") {
    mock.followUpMessage = "Hi! Did you manage to find us? We're at KG 42 Street, Kimironko, near Four Square Church. Let me know if you'd like to stop by for a visit!";
  }

  return mock;
}

async function callAI(chat: string, followUpDate?: string | null): Promise<AnalyzeOutput> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return buildMockResponse(chat);
  }

  let userMessage = chat;
  if (followUpDate) {
    userMessage = `The user has selected this follow-up date: ${followUpDate}. Generate a follow-up message appropriate for this date.\n\n---\n\n${chat}`;
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
        { role: "user", content: userMessage },
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

    const result = await callAI(input.chat, input.followUpDate);

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
