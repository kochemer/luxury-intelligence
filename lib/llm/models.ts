/**
 * LLM Model Routing
 *
 * Central registry that maps pipeline workflow steps to recommended models.
 * Every OpenAI text-generation call should go through `getModelFor()` so we
 * can swap models from a single place or via env-var overrides.
 *
 * Env overrides (optional):
 *   LLM_MODEL_TRIAGE, LLM_MODEL_CLASSIFY, LLM_MODEL_SUMMARIZE,
 *   LLM_MODEL_RANK, LLM_MODEL_SCRIPT, LLM_MODEL_POLISH
 */

// ── Workflow names ──────────────────────────────────────────────
export type WorkflowName =
  | 'triage'
  | 'classify'
  | 'summarize'
  | 'rank'
  | 'script'
  | 'polish';

// ── Default model per workflow ──────────────────────────────────
export const DEFAULT_MODEL_BY_WORKFLOW: Record<WorkflowName, string> = {
  triage:    'gpt-4.1-mini',
  classify:  'gpt-4.1-mini',
  // 'summarize' produces the most visible text on the site: the 28 article
  // summaries, the weekly-insight candidates, the Editor's Take and the email
  // intro. Upgraded from gpt-4.1-mini on 2026-09-18 (roadmap F1.4) — it runs
  // ~60 short calls a week, so the full model's cost is cents.
  summarize: 'gpt-4.1',
  // Note: the reranker no longer reads this — see digest/rerankArticles.ts
  // (RERANK_MODEL_PRIMARY defaults to gpt-4.1 since 2026-09-16).
  rank:      'o4-mini',
  script:    'gpt-4.1',
  polish:    'gpt-4.1',
};

// ── Env-var names (uppercase) ───────────────────────────────────
const ENV_KEY: Record<WorkflowName, string> = {
  triage:    'LLM_MODEL_TRIAGE',
  classify:  'LLM_MODEL_CLASSIFY',
  summarize: 'LLM_MODEL_SUMMARIZE',
  rank:      'LLM_MODEL_RANK',
  script:    'LLM_MODEL_SCRIPT',
  polish:    'LLM_MODEL_POLISH',
};

/**
 * Return the model string for a given workflow.
 *
 * Priority:
 *  1. Environment variable  (e.g. LLM_MODEL_RANK=o4-mini)
 *  2. DEFAULT_MODEL_BY_WORKFLOW
 *
 * The env value can be any valid OpenAI model identifier — no strict
 * allow-list beyond our defaults.
 */
export function getModelFor(workflow: WorkflowName): string {
  const envVal = process.env[ENV_KEY[workflow]]?.trim();
  return envVal || DEFAULT_MODEL_BY_WORKFLOW[workflow];
}

/**
 * Return the correct token-limit parameter for a given model.
 *
 * Reasoning models (o1-*, o3-*, o4-*) and gpt-5-* require
 * `max_completion_tokens` instead of `max_tokens`.
 *
 * Usage:  `...maxTokensParam(model, 2000)` spread into the request object.
 */
export function maxTokensParam(
  model: string,
  n: number
): { max_tokens: number } | { max_completion_tokens: number } {
  if (usesMaxCompletionTokens(model)) {
    return { max_completion_tokens: n };
  }
  return { max_tokens: n };
}

function usesMaxCompletionTokens(model: string): boolean {
  return isReasoningOrV5(model);
}

/**
 * Return a temperature param only when the model supports it.
 *
 * Reasoning models (o-series) and gpt-5-* only accept the default
 * temperature (1) — passing any other value causes a 400.
 * For those models the returned object is empty so the API uses its default.
 *
 * Usage:  `...temperatureParam(model, 0.3)` spread into the request object.
 */
export function temperatureParam(
  model: string,
  temp: number
): { temperature: number } | Record<string, never> {
  if (isReasoningOrV5(model)) {
    return {};            // omit → API default (1)
  }
  return { temperature: temp };
}

/** Models that use the new parameter conventions (max_completion_tokens, no custom temperature). */
function isReasoningOrV5(model: string): boolean {
  // o-series reasoning models (o1, o3, o4, …)
  return /^o\d/.test(model);
}

/**
 * Print a one-line diagnostic showing resolved models for every workflow.
 * Intended for CLI pipeline scripts (called once at startup).
 */
export function printModelRouting(): void {
  const parts = (Object.keys(DEFAULT_MODEL_BY_WORKFLOW) as WorkflowName[])
    .map(w => `${w}=${getModelFor(w)}`)
    .join(', ');
  console.log(`[LLM routing] ${parts}`);
}
