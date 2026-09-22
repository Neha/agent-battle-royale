import { env } from "cloudflare:workers";

type AgentId = "researcher" | "skeptic" | "comedian" | "optimizer";

type JevChoiceAnswer = {
  type: "choice";
  choice: AgentId;
  confidence: number;
  probabilities: Record<AgentId, number>;
};

type JevResponse = {
  model: string;
  answers: {
    next_agent: JevChoiceAnswer;
  };
};

const AGENT_IDS: AgentId[] = [
  "researcher",
  "skeptic",
  "comedian",
  "optimizer",
];

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const JEV_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 8_000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "anonymous";
}

function allowRequest(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    if (rateBuckets.size > 5_000) {
      for (const [id, entry] of rateBuckets) {
        if (now >= entry.resetAt) rateBuckets.delete(id);
      }
    }
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}

export async function POST(request: Request) {
  if (!allowRequest(clientKey(request))) {
    return Response.json(
      { error: "Too many decisions. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }

  const body = (await request.json().catch(() => null)) as {
    topic?: unknown;
  } | null;
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";

  if (!topic || topic.length > 2_000) {
    return Response.json(
      { error: "Topic must contain between 1 and 2,000 characters." },
      { status: 400 },
    );
  }

  const apiKey = env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Jev is not configured." }, { status: 503 });
  }

  let response: Response;
  try {
    response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
      body: JSON.stringify({
        state: topic,
        model: "jev-latest",
        questions: {
          next_agent: {
            type: "choice",
            instructions:
              "Which specialist agent should answer this user request? Choose the single agent whose core role best matches the user's intent.",
            criteria: {
              researcher:
                "Factual investigation, evidence, sources, context, comparison, or careful explanation.",
              skeptic:
                "Challenge assumptions, identify risks, critique, test weaknesses, or argue against an idea.",
              comedian:
                "Humor, jokes, puns, playful entertainment, or a witty reframing.",
              optimizer:
                "Plans, steps, execution, efficiency, prioritization, improvements, or actionable recommendations.",
            },
          },
        },
      }),
    });
  } catch {
    return Response.json(
      { error: "Jev could not make a decision." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return Response.json(
      { error: "Jev could not make a decision." },
      { status: 502 },
    );
  }

  const data = (await response.json()) as JevResponse;
  const answer = data.answers?.next_agent;
  if (
    !answer ||
    !AGENT_IDS.includes(answer.choice) ||
    !answer.probabilities
  ) {
    return Response.json({ error: "Jev returned an invalid decision." }, { status: 502 });
  }

  const scores = AGENT_IDS.map((id) =>
    Math.round((answer.probabilities[id] ?? 0) * 100),
  );

  return Response.json({
    winner: answer.choice,
    scores,
    confidence: answer.confidence,
    model: data.model,
    source: "jev",
  });
}
