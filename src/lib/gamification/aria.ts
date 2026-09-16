// Quo Live: fixed persona, conversation modes, daily missions and the structured-feedback tool schema.

/** The mascot. Change the name here and it changes everywhere (UI, prompts, error messages). Drop the owl at public/quo.png. */
export const COACH = { name: "Quo", product: "Quo Live", image: "/quo.png", tagline: "your owl English coach" } as const;

export const ARIA_SYSTEM = `You are ${COACH.name}, a friendly owl.
You are a live English communication mentor.
Speak naturally.
Never lecture.
Keep replies under 15 seconds.
Ask one question at a time.
Remember previous answers.
Challenge opinions politely.
Prioritize conversation first.
Teach English second.
Only give coaching after every 2 or 3 exchanges.
Never mention that you're analyzing speech.`;

export type ModeId = "casual" | "interview" | "office" | "debate";

export const MODES: Record<ModeId, { name: string; blurb: string; persona: string; scenarios: { id: string; title: string; opener: string }[] }> = {
  casual: {
    name: "Casual Conversation",
    blurb: "Everyday small talk. Relaxed, friendly, curious.",
    persona: "Personality: warm, playful, curious friend. Vocabulary: everyday, idiomatic, contractions. Keep it light and personal.",
    scenarios: [
      { id: "coffee", title: "Coffee chat", opener: "Hey! Grab a seat. So, how has your week been treating you?" },
      { id: "weekend", title: "Weekend plans", opener: "It's almost the weekend! Any plans, or are you keeping it low-key?" },
      { id: "travel", title: "Travel", opener: "If you could fly anywhere tomorrow morning, where would you go and why?" },
      { id: "movies", title: "Movies", opener: "I just watched something great last night. What's the last film that really stuck with you?" },
    ],
  },
  interview: {
    name: "Mock Interview",
    blurb: "HR, technical and behavioural rounds. Professional, probing.",
    persona: "Personality: professional, encouraging interviewer who probes for specifics. Vocabulary: workplace, STAR-method prompts, competency language. Follow up on vague answers.",
    scenarios: [
      { id: "hr", title: "HR round", opener: "Thanks for joining. Let's start simple: tell me a little about yourself and what brought you here today." },
      { id: "technical", title: "Technical round", opener: "Great to meet you. Walk me through a project you're proud of. What problem were you solving?" },
      { id: "behavioural", title: "Behavioural round", opener: "Let's talk about how you work. Tell me about a time you disagreed with a teammate. What happened?" },
    ],
  },
  office: {
    name: "Office Communication",
    blurb: "Meetings, stand-ups, client calls and presentations.",
    persona: "Personality: pragmatic colleague or client, focused on clarity and outcomes. Vocabulary: business, project, deadlines, stakeholder language. Push for concise, structured answers.",
    scenarios: [
      { id: "meeting", title: "Team meeting", opener: "Okay everyone, let's get started. Can you give us a quick update on where things stand with your part?" },
      { id: "standup", title: "Daily stand-up", opener: "Morning! Your turn: what did you get done yesterday, what's on for today, any blockers?" },
      { id: "client", title: "Client call", opener: "Hi, thanks for making time. Before we dive in, could you summarise where we are on the delivery?" },
      { id: "presentation", title: "Presentation", opener: "The floor is yours. Give me the one-minute version of what you're presenting and why it matters." },
    ],
  },
  debate: {
    name: "Debate",
    blurb: `Take a side and defend it. ${COACH.name} will push back.`,
    persona: "Personality: sharp, respectful debate partner who takes the opposite side and asks for evidence. Vocabulary: argumentation, concession, rebuttal, nuance. Always challenge politely.",
    scenarios: [
      { id: "ai", title: "AI vs humans", opener: "Here's my claim: within ten years, AI will do most creative work better than people. Agree or disagree?" },
      { id: "remote", title: "Remote work", opener: "I think remote work quietly hurts careers, especially for juniors. Convince me I'm wrong." },
      { id: "climate", title: "Climate", opener: "Individual actions on climate are basically pointless compared to policy. Where do you stand?" },
      { id: "technology", title: "Technology", opener: "Smartphones have made us worse at thinking deeply. Do you buy that?" },
    ],
  },
};

export const MISSIONS = [
  { id: "intro", title: "Introduce yourself", prompt: "Introduce yourself to a new team: who you are, what you do and one thing people don't expect about you.", mode: "office" as ModeId },
  { id: "project", title: "Explain your latest project", prompt: "Explain your most recent project to someone smart but non-technical.", mode: "interview" as ModeId },
  { id: "customer", title: "Convince a customer", prompt: "A customer is about to cancel. Convince them to stay without discounting.", mode: "office" as ModeId },
  { id: "conflict", title: "Resolve a team conflict", prompt: "Two teammates keep clashing in meetings. Mediate and propose a way forward.", mode: "office" as ModeId },
  { id: "pitch", title: "Pitch a startup", prompt: "Pitch a startup idea in two minutes to a sceptical investor.", mode: "debate" as ModeId },
  { id: "feedback", title: "Give difficult feedback", prompt: "Tell a colleague their work missed the mark, kindly but clearly.", mode: "office" as ModeId },
  { id: "story", title: "Tell a story", prompt: "Tell the story of a mistake you made and what it taught you.", mode: "casual" as ModeId },
];

/** Same mission for the whole cohort on a given day; difficulty note scales with the speaker's level. */
export function missionFor(date: string, level: number) {
  const idx = [...date].reduce((n, c) => n + c.charCodeAt(0), 0) % MISSIONS.length;
  const m = MISSIONS[idx];
  const difficulty = level >= 7 ? "advanced" : level >= 4 ? "intermediate" : "beginner";
  const twist = { beginner: "Keep it simple and clear.", intermediate: "Use at least two specific examples.", advanced: "Anticipate two objections and address them before being asked." }[difficulty];
  return { ...m, difficulty, twist, minutes: 5 };
}

export type Feedback = {
  fluency: number;
  grammar: { wrong: string; correct: string }[];
  vocabulary: { used: string; better: string } | null;
  vocabularyScore: number;
  pronunciation: string[];
  drills: { word: string; ipa: string; stress: string; syllables: string; sentence: string }[];
  pace: number;
  fillerWords: number;
  confidence: number;
};

/** Strict tool the feedback call must use, so the JSON is schema-valid and never spoken. */
export const FEEDBACK_TOOL = {
  name: "record_feedback",
  description: "Record structured speaking feedback for the student's latest utterance.",
  strict: true as const,
  input_schema: {
    type: "object" as const,
    properties: {
      fluency: { type: "integer", description: "0-100 overall fluency of this utterance" },
      grammar: { type: "array", items: { type: "object", properties: { wrong: { type: "string" }, correct: { type: "string" } }, required: ["wrong", "correct"], additionalProperties: false } },
      vocabulary: { type: ["object", "null"], properties: { used: { type: "string" }, better: { type: "string" } }, required: ["used", "better"], additionalProperties: false },
      vocabularyScore: { type: "integer", description: "0-100 range and precision of vocabulary" },
      pronunciation: { type: "array", items: { type: "string" }, description: "words likely to be hard to pronounce for this speaker" },
      drills: { type: "array", items: { type: "object", properties: { word: { type: "string" }, ipa: { type: "string" }, stress: { type: "string" }, syllables: { type: "string" }, sentence: { type: "string" } }, required: ["word", "ipa", "stress", "syllables", "sentence"], additionalProperties: false } },
      pace: { type: "integer", description: "estimated words per minute" },
      fillerWords: { type: "integer" },
      confidence: { type: "integer", description: "0-100" },
    },
    required: ["fluency", "grammar", "vocabulary", "vocabularyScore", "pronunciation", "drills", "pace", "fillerWords", "confidence"],
    additionalProperties: false,
  },
};

export type Summary = { headline: string; strengths: string[]; focus: string[]; vocabulary: string[]; fluency: number };

export const SUMMARY_TOOL = {
  name: "record_summary",
  description: "Record the end-of-session summary.",
  strict: true as const,
  input_schema: {
    type: "object" as const,
    properties: {
      headline: { type: "string", description: "one encouraging sentence" },
      strengths: { type: "array", items: { type: "string" } },
      focus: { type: "array", items: { type: "string" }, description: "2-3 concrete things to work on" },
      vocabulary: { type: "array", items: { type: "string" }, description: "new words or phrases introduced" },
      fluency: { type: "integer", description: "0-100 for the whole session" },
    },
    required: ["headline", "strengths", "focus", "vocabulary", "fluency"],
    additionalProperties: false,
  },
};

export type Turn = { role: "user" | "assistant"; text: string; at: string };
