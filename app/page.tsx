"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  FlaskConical,
  ShieldQuestion,
  Smile,
  Sparkles,
  ArrowRight,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type AgentId = "researcher" | "skeptic" | "comedian" | "optimizer";

type Agent = {
  id: AgentId;
  name: string;
  role: string;
  icon: typeof FlaskConical;
  accent: string;
  tint: string;
  response: (topic: string) => string;
};

const agents: Agent[] = [
  {
    id: "researcher",
    name: "Researcher",
    role: "Evidence & context",
    icon: FlaskConical,
    accent: "#18a978",
    tint: "#eafbf5",
    response: (topic) =>
      `Start with one testable claim about “${topic}”. Collect three concrete examples, note what changed in each, and use that evidence to choose the smallest useful experiment.`,
  },
  {
    id: "skeptic",
    name: "Skeptic",
    role: "Risks & assumptions",
    icon: ShieldQuestion,
    accent: "#7657df",
    tint: "#f3efff",
    response: (topic) =>
      `Before committing to “${topic}”, write down the assumption most likely to be wrong. Design a one-hour test that could disprove it before you spend the weekend building.`,
  },
  {
    id: "comedian",
    name: "Comedian",
    role: "Fresh perspective",
    icon: Smile,
    accent: "#d48a06",
    tint: "#fff7e6",
    response: (topic) =>
      /\b(joke|funny|laugh|humou?r|pun|comedy)\b/i.test(topic)
        ? "Why did the AI agent bring a ladder to work? It heard the prompts were on another level."
        : `Treat “${topic}” like a tiny game show: one clear challenge, one surprising reveal, and no feature that needs a twelve-slide explanation. If it needs a manual, it has left the arena.`,
  },
  {
    id: "optimizer",
    name: "Optimizer",
    role: "Clarity & action",
    icon: Sparkles,
    accent: "#347de8",
    tint: "#edf5ff",
    response: (topic) =>
      `Turn “${topic}” into a three-step loop: input, decision, result. Ship that loop first, measure where people stop, and improve only the step that blocks them.`,
  },
];

type Decision = {
  scores: number[];
  reason: string;
  source: "jev" | "fallback";
};

type Stage = "idle" | "agents" | "jev" | "reveal" | "result";

const wait = (duration: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, duration));

function decideByIntent(topic: string): Decision {
  const normalized = topic.toLowerCase();

  if (/\b(joke|funny|laugh|humou?r|pun|comedy|amuse)\b/.test(normalized)) {
    return {
      scores: [8, 10, 70, 12],
      reason: "Matched a humor request.",
      source: "fallback",
    };
  }

  if (/\b(research|evidence|source|fact|data|study|compare|latest)\b/.test(normalized)) {
    return {
      scores: [62, 14, 7, 17],
      reason: "Matched a research and evidence request.",
      source: "fallback",
    };
  }

  if (/\b(risk|critic|challenge|flaw|wrong|downside|assumption|fail)\b/.test(normalized)) {
    return {
      scores: [15, 61, 7, 17],
      reason: "Matched a risk and critique request.",
      source: "fallback",
    };
  }

  if (/\b(plan|steps|improve|optimi[sz]e|efficient|fast|action|launch|build)\b/.test(normalized)) {
    return {
      scores: [18, 13, 7, 62],
      reason: "Matched a planning and action request.",
      source: "fallback",
    };
  }

  return {
    scores: [27, 23, 18, 32],
    reason: "No specialized intent was detected, so Optimizer is the default.",
    source: "fallback",
  };
}

async function askJev(topic: string): Promise<Decision> {
  const response = await fetch("/api/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });

  if (!response.ok) {
    throw new Error("Jev decision failed");
  }

  const data = (await response.json()) as {
    scores?: unknown;
    confidence?: unknown;
    source?: unknown;
  };
  if (
    !Array.isArray(data.scores) ||
    data.scores.length !== agents.length ||
    !data.scores.every((score) => typeof score === "number")
  ) {
    throw new Error("Jev returned invalid scores");
  }

  const confidence =
    typeof data.confidence === "number"
      ? `${Math.round(data.confidence * 100)}%`
      : "an unreported";

  return {
    scores: data.scores,
    reason: `Jev compared the request with each agent role and decided with ${confidence} confidence.`,
    source: "jev",
  };
}

type WebMcpContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

export default function Home() {
  const [topic, setTopic] = useState(
    "How can a small team launch a useful AI tool in a weekend?",
  );
  const [submittedTopic, setSubmittedTopic] = useState("");
  const [round, setRound] = useState(1);
  const [scores, setScores] = useState<number[] | null>(null);
  const [displayScores, setDisplayScores] = useState<number[] | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionSource, setDecisionSource] = useState<Decision["source"] | null>(
    null,
  );
  const [stage, setStage] = useState<Stage>("idle");
  const resultRef = useRef<HTMLDivElement>(null);
  const thinking = stage === "agents" || stage === "jev" || stage === "reveal";

  const winnerIndex = useMemo(() => {
    if (!scores) return -1;
    return scores.indexOf(Math.max(...scores));
  }, [scores]);

  const winner = winnerIndex >= 0 ? agents[winnerIndex] : null;
  const WinnerIcon = winner?.icon;

  const statusCopy: Record<Stage, string> = {
    idle: "Ready for a prompt.",
    agents: "Four agents are preparing their approach…",
    jev: "Jev is comparing the four specialist roles…",
    reveal: "Decision ready — revealing probabilities…",
    result: "Winner selected.",
  };

  async function runRoundSequence(cleanTopic: string) {
    setSubmittedTopic(cleanTopic);
    setScores(null);
    setDisplayScores(null);
    setDecisionReason("");
    setDecisionSource(null);
    setStage("agents");

    const decisionPromise = askJev(cleanTopic).catch(() =>
      decideByIntent(cleanTopic),
    );

    await wait(620);
    setStage("jev");
    const [decision] = await Promise.all([decisionPromise, wait(560)]);

    setScores(decision.scores);
    setDisplayScores([0, 0, 0, 0]);
    setDecisionReason(decision.reason);
    setDecisionSource(decision.source);
    setStage("reveal");

    await new Promise<void>((resolve) => {
      const started = performance.now();
      const duration = 560;
      const frame = (now: number) => {
        const progress = Math.min((now - started) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayScores(
          decision.scores.map((score) => Math.round(score * eased)),
        );
        if (progress < 1) {
          window.requestAnimationFrame(frame);
        } else {
          resolve();
        }
      };
      window.requestAnimationFrame(frame);
    });

    setStage("result");
    window.setTimeout(() => {
      resultRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);
    return decision;
  }

  useEffect(() => {
    const context = (
      document as Document & { modelContext?: WebMcpContext }
    ).modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    const activeRound = round;

    void Promise.resolve(
      context.registerTool(
        {
          name: "run_agent_round",
          title: "Run agent round",
          description:
            "Set the visible debate topic, run all four agent personas, and reveal the referee's winning agent.",
          inputSchema: {
            type: "object",
            properties: {
              topic: {
                type: "string",
                minLength: 1,
                description: "The question or topic for the agents to debate.",
              },
            },
            required: ["topic"],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: true,
          },
          async execute(input) {
            const value = input as { topic?: unknown };
            if (typeof value?.topic !== "string" || !value.topic.trim()) {
              throw new Error("Topic must be a non-empty string.");
            }

            const cleanTopic = value.topic.trim();
            const decision = await runRoundSequence(cleanTopic);
            const nextScores = decision.scores;
            setTopic(cleanTopic);
            const winningIndex = nextScores.indexOf(Math.max(...nextScores));
            return {
              round: activeRound,
              topic: cleanTopic,
              winner: agents[winningIndex].name,
              reason: decision.reason,
              scores: Object.fromEntries(
                agents.map((agent, index) => [agent.id, nextScores[index]]),
              ),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [round]);

  async function runBattle() {
    if (!topic.trim() || thinking) return;
    await runRoundSequence(topic.trim());
  }

  function nextRound() {
    setRound((current) => current + 1);
    setScores(null);
    setDisplayScores(null);
    setDecisionReason("");
    setDecisionSource(null);
    setStage("idle");
    setSubmittedTopic("");
  }

  function resetBattle() {
    setRound(1);
    setScores(null);
    setDisplayScores(null);
    setDecisionReason("");
    setDecisionSource(null);
    setStage("idle");
    setSubmittedTopic("");
  }

  function editPrompt() {
    setScores(null);
    setDisplayScores(null);
    setDecisionReason("");
    setDecisionSource(null);
    setStage("idle");
    setSubmittedTopic("");
    window.setTimeout(() => document.getElementById("battle-topic")?.focus(), 50);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-7 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/agent-mark.png"
              alt=""
              className="size-10 rounded-full shadow-sm"
            />
            <div>
              <h1 className="text-lg font-extrabold tracking-[-0.03em] sm:text-xl">
                Agent <span className="title-gradient">Battle Royale</span>
              </h1>
              <p className="text-sm text-slate-500">Round {round}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={resetBattle}
            className="h-10 rounded-full px-4 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <RotateCcw aria-hidden="true" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
        </header>

        <section
          className={`battle-section mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center ${stage !== "idle" ? "battle-section-active" : ""}`}
        >
          <div className={`battle-intro text-center ${stage !== "idle" ? "battle-intro-compact" : ""}`}>
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Jev referee
            </span>
            <h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-black tracking-[-0.045em] text-slate-900 sm:text-5xl">
              Four minds. One next move.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-slate-500 sm:text-lg">
              Give the agents a topic. They’ll each take a position, then the referee picks who speaks next.
            </p>
          </div>

          {stage === "idle" ? (
            <div className="prompt-shell mx-auto w-full max-w-3xl">
              <label htmlFor="battle-topic" className="sr-only">
                Battle topic
              </label>
              <Textarea
                id="battle-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    runBattle();
                  }
                }}
                placeholder="What should the agents debate?"
                className="min-h-24 resize-none border-0 bg-transparent px-1 py-1 text-base leading-7 shadow-none focus-visible:ring-0 sm:text-lg"
              />
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="hidden text-sm text-slate-400 sm:block">⌘ Enter to run the round</p>
                <Button
                  size="lg"
                  onClick={runBattle}
                  disabled={!topic.trim()}
                  className="battle-button ml-auto h-11 rounded-full px-6"
                >
                  Run the round
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="submitted-prompt mx-auto w-full max-w-3xl">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">
                  Submitted prompt
                </p>
                <p className="mt-1 truncate text-base font-semibold text-slate-700" title={submittedTopic}>
                  {submittedTopic}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={editPrompt}
                disabled={thinking}
                className="h-9 shrink-0 rounded-full px-3 text-slate-500"
              >
                <Pencil aria-hidden="true" />
                Edit
              </Button>
            </div>
          )}

          <div className={`status-rail mx-auto w-full max-w-3xl ${stage !== "idle" ? "status-rail-active" : ""}`} aria-live="polite">
            <div className="status-pulse" data-active={thinking || undefined} />
            <p className="min-w-0 flex-1 text-sm font-semibold text-slate-600">
              {statusCopy[stage]}
            </p>
            <div className="hidden items-center gap-2 sm:flex" aria-hidden="true">
              {["Prompt", "Agents", "Decision"].map((label, index) => {
                const currentStep =
                  stage === "idle" ? 0 : stage === "agents" ? 1 : 2;
                return (
                  <span
                    key={label}
                    className={`stage-chip ${index <= currentStep ? "stage-chip-active" : ""}`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </div>

          <div className={`agents-grid grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 ${stage !== "idle" ? "agents-grid-compact" : ""}`}>
            {agents.map((agent, index) => {
              const Icon = agent.icon;
              const selected = stage === "result" && winnerIndex === index;
              const muted =
                stage === "result" && winnerIndex >= 0 && winnerIndex !== index;
              return (
                <article
                  key={agent.id}
                  className={`agent-card ${stage !== "idle" ? "agent-card-compact" : ""} ${thinking ? "agent-card-thinking" : ""} ${stage === "jev" ? "agent-card-scanning" : ""} ${selected ? "agent-card-selected" : ""} ${muted ? "agent-card-muted" : ""}`}
                  style={
                    {
                      "--agent-accent": agent.accent,
                      "--agent-tint": agent.tint,
                      "--agent-delay": `${index * 110}ms`,
                    } as CSSProperties
                  }
                >
                  <div className="agent-icon">
                    <Icon aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-extrabold tracking-tight text-slate-900 sm:text-lg">
                    {agent.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 sm:text-sm">{agent.role}</p>
                  {stage === "agents" && (
                    <div className="agent-thinking-dots" aria-label="Preparing">
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                  <div className="score-row mt-5 flex min-h-9 items-end justify-between">
                    <span className="text-2xl font-black tracking-[-0.04em]" style={{ color: agent.accent }}>
                      {displayScores ? `${displayScores[index]}%` : "—"}
                    </span>
                    {selected && <span className="winner-pill">Next</span>}
                  </div>
                  <div className="probability-track" aria-hidden="true">
                    <span
                      className="probability-fill"
                      style={{ width: `${displayScores?.[index] ?? 0}%` }}
                    />
                  </div>
                </article>
              );
            })}
          </div>

          <div ref={resultRef} aria-live="polite" className="mt-6 min-h-44">
            {thinking && (
              <div className="decision-placeholder flex min-h-28 items-center justify-center">
                <p className="text-center text-sm font-semibold text-slate-500">
                  {statusCopy[stage]}
                </p>
              </div>
            )}

            {!thinking && winner && WinnerIcon && scores && (
              <div className="result-card result-enter">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div
                    className="agent-icon shrink-0"
                    style={
                      {
                        "--agent-accent": winner.accent,
                        "--agent-tint": winner.tint,
                      } as CSSProperties
                    }
                  >
                    <WinnerIcon aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold" style={{ color: winner.accent }}>
                      {decisionSource === "jev" ? "Jev" : "Backup referee"} picked {winner.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{decisionReason}</p>
                    <p className="mt-2 text-lg font-semibold leading-8 text-slate-800">
                      {winner.response(submittedTopic)}
                    </p>
                  </div>
                  <Button
                    onClick={nextRound}
                    variant="outline"
                    className="h-10 shrink-0 rounded-full border-slate-200 px-5"
                  >
                    Next round
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}

            {!thinking && !winner && (
              <div className="flex min-h-44 items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white/50 px-6 text-center">
                <p className="max-w-md text-sm leading-6 text-slate-400">
                  The arena is ready. Run the round to reveal each agent’s odds and the winning response.
                </p>
              </div>
            )}
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 py-5 text-sm text-slate-400 sm:flex-row">
          <p>Prompt <span aria-hidden="true">→</span> Proposals <span aria-hidden="true">→</span> Decision</p>
          <p>{decisionSource === "fallback" ? "Backup rules active" : "Decisions by Jev"}</p>
        </footer>
      </div>
    </main>
  );
}
