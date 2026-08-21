// Allowlisted models for the browser-agent UI.
// IMPORTANT: API validates against this list — never accepts arbitrary model strings.
// All listed models are vision-capable, support tools and structured outputs.

export type AgentTone = 'gold' | 'silver' | 'bronze' | 'cn' | 'west';

export type AgentModel = {
  id: string;            // OpenRouter model slug
  label: string;         // Display name
  provider: string;      // Provider family
  priceIn: number;       // USD per million input tokens
  priceOut: number;      // USD per million output tokens
  tone: AgentTone;
  note?: string;         // Optional short note
};

// Order = display order in the dropdown.
// 1-3: top agentic-capability (gold/silver/bronze), irrespective of price.
// 4+: ranked by price+effectiveness, Chinese (Qwen) models prioritised.
export const AGENT_MODELS: AgentModel[] = [
  // 🥇 Gold — top agentic LLM, price no object
  {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    priceIn: 3.0,
    priceOut: 15.0,
    tone: 'gold',
    note: 'Best-in-class agent',
  },
  // 🥈 Silver — Claude tier, cheaper
  {
    id: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    priceIn: 1.0,
    priceOut: 5.0,
    tone: 'silver',
    note: 'Fast, strong tool-use',
  },
  // 🥉 Bronze — best open-source agentic + Chinese, proven in our own tests
  {
    id: 'qwen/qwen3-vl-235b-a22b-instruct',
    label: 'Qwen3-VL 235B Instruct',
    provider: 'Qwen',
    priceIn: 0.2,
    priceOut: 0.88,
    tone: 'bronze',
    note: 'Verified on this server',
  },
  // Chinese — price ascending
  {
    id: 'qwen/qwen3.5-flash-02-23',
    label: 'Qwen3.5 Flash',
    provider: 'Qwen',
    priceIn: 0.065,
    priceOut: 0.26,
    tone: 'cn',
  },
  {
    id: 'qwen/qwen3-vl-32b-instruct',
    label: 'Qwen3-VL 32B Instruct',
    provider: 'Qwen',
    priceIn: 0.104,
    priceOut: 0.416,
    tone: 'cn',
  },
  {
    id: 'qwen/qwen3-vl-30b-a3b-instruct',
    label: 'Qwen3-VL 30B MoE',
    provider: 'Qwen',
    priceIn: 0.13,
    priceOut: 0.52,
    tone: 'cn',
  },
  // Western — price ascending
  {
    id: 'openai/gpt-5-nano',
    label: 'GPT-5 Nano',
    provider: 'OpenAI',
    priceIn: 0.05,
    priceOut: 0.4,
    tone: 'west',
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    provider: 'Google',
    priceIn: 0.1,
    priceOut: 0.4,
    tone: 'west',
  },
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'OpenAI',
    priceIn: 0.15,
    priceOut: 0.6,
    tone: 'west',
  },
];

export const DEFAULT_MODEL_ID = 'qwen/qwen3-vl-235b-a22b-instruct';

export function isAllowedModel(id: string): boolean {
  return AGENT_MODELS.some((m) => m.id === id);
}

export function formatPrice(m: Pick<AgentModel, 'priceIn' | 'priceOut'>): string {
  return `\$${m.priceIn.toFixed(2)}/\$${m.priceOut.toFixed(2)} per Mtok`;
}

// Compute USD cost for a run. Reasoning tokens are already included in
// completion_tokens per the OpenAI usage spec, so we do not double-count.
export function computeCost(
  tokens: { in: number; out: number },
  model: Pick<AgentModel, "priceIn" | "priceOut">,
): number {
  return (tokens.in * model.priceIn + tokens.out * model.priceOut) / 1_000_000;
}

// Format USD as "$1.23" if >= $1, else integer cents ("42¢"), or "<1¢" for tiny.
export function formatCost(usd: number): string {
  if (usd <= 0) return "0¢";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  const cents = usd * 100;
  if (cents < 1) return "<1¢";
  return `${Math.round(cents)}¢`;
}
