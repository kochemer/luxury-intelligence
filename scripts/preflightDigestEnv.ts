/**
 * Preflight check for the weekly digest build.
 * Exits with code 1 if required vars are missing or the OpenAI account can't
 * be billed (bad key, no credits), 0 if all OK.
 *
 * The billing probe exists because the 2026-W47 run (23 Nov 2026) passed the
 * old env-only preflight, then spent 27 minutes on ingestion and discovery
 * before every LLM call returned "429 You have no credits remaining". The probe
 * is one tiny request; transient errors only warn so they can't block a run.
 * Set PREFLIGHT_SKIP_LLM_PROBE=1 to skip it (e.g. offline).
 */

import { getModelFor } from '../lib/llm/models';

const REQUIRED_VARS = [
  'OPENAI_API_KEY', // Required for LLM calls (summaries, translations, reranking, etc.)
];

const OPTIONAL_BUT_RECOMMENDED_VARS = [
  'TAVILY_API_KEY', // Required for discovery step (workflow runs discovery by default)
];

function checkEnvVars(): { ok: boolean; missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required vars
  for (const varName of REQUIRED_VARS) {
    const value = process.env[varName];
    if (!value || value.trim().length === 0) {
      missing.push(varName);
    }
  }

  // Check optional but recommended vars
  for (const varName of OPTIONAL_BUT_RECOMMENDED_VARS) {
    const value = process.env[varName];
    if (!value || value.trim().length === 0) {
      warnings.push(varName);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Make one minimal chat completion. Returns an error string for failures that
 * will certainly sink the run (401 bad key, 429 no quota/credits), null otherwise.
 */
async function probeOpenAIBilling(): Promise<string | null> {
  if (process.env.PREFLIGHT_SKIP_LLM_PROBE === '1') {
    console.log('ℹ️  OpenAI billing probe skipped (PREFLIGHT_SKIP_LLM_PROBE=1)');
    return null;
  }
  const model = getModelFor('classify');
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        max_completion_tokens: 64,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      console.log(`✅ OpenAI billing probe passed (${model})`);
      return null;
    }
    const body = await res.text();
    let code = '';
    let message = body.slice(0, 300);
    try {
      const err = JSON.parse(body)?.error;
      code = err?.code ?? '';
      message = err?.message ?? message;
    } catch { /* non-JSON body */ }
    const quota = res.status === 429 && (code === 'insufficient_quota' || /credit|quota|billing/i.test(message));
    if (res.status === 401 || quota) {
      return `OpenAI ${res.status}${code ? ` (${code})` : ''}: ${message}`;
    }
    // Rate limits, 5xx, a 400 from the probe itself: not proof the run will fail.
    console.warn(`⚠️  OpenAI billing probe inconclusive (${res.status}): ${message}`);
    return null;
  } catch (e) {
    console.warn(`⚠️  OpenAI billing probe could not reach the API: ${(e as Error).message}`);
    return null;
  }
}

async function main() {
  const { ok, missing, warnings } = checkEnvVars();

  if (!ok) {
    console.error('❌ Preflight check failed: Missing required environment variables');
    console.error('');
    console.error('Missing required variables:');
    missing.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    console.error('');
    console.error('Please set these environment variables before running the digest build.');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Preflight check passed with warnings:');
    warnings.forEach(varName => {
      console.warn(`  - ${varName} is not set (may be required if discovery step runs)`);
    });
    console.warn('');
  }

  const billingError = await probeOpenAIBilling();
  if (billingError) {
    console.error('❌ Preflight check failed: the OpenAI account cannot serve requests');
    console.error(`  ${billingError}`);
    console.error('  Every summary, theme and insight call would fail. Fix the OPENAI_API_KEY');
    console.error('  secret (401) or add credits at https://platform.openai.com/settings/organization/billing/');
    console.error('  (429), then re-run.');
    process.exit(1);
  }

  console.log('✅ Preflight check passed: All required environment variables are present');
  process.exit(0);
}

main();
