import type { Finding, SeoReport } from '../types';

function severityTag(s: Finding['severity']): string {
  return `[${s.toUpperCase()}]`;
}

function findingLine(f: Finding): string {
  return `- ${severityTag(f.severity)} (score ${f.score}) ${f.title}${f.url ? ` — ${f.url}` : ''}\n  ${f.detail}\n  → ${f.recommendation}`;
}

export function renderMarkdown(report: SeoReport): string {
  const lines: string[] = [];
  const { delta, score } = report;

  const scoreChangeStr = delta.previousWeek
    ? `${delta.scoreChange >= 0 ? '+' : ''}${delta.scoreChange} vs ${delta.previousWeek}`
    : 'no prior report';

  lines.push(`# SEO Report — ${report.week}`);
  lines.push('');
  lines.push(`Score **${score.overall}** (${scoreChangeStr}) · ${delta.newFindings.length} new · ${delta.resolvedFindings.length} resolved · ${report.findings.length} open`);
  lines.push('');
  lines.push('_Score is a relative index for tracking week-over-week trend, not an absolute grade._');
  lines.push('');

  lines.push('## By category');
  lines.push('');
  lines.push('| Category | Score |');
  lines.push('|---|---|');
  for (const [cat, val] of Object.entries(score.byCategory)) {
    // null = this run never looked at that category. Rendering it as 100 would
    // claim a clean bill of health for something nobody checked.
    lines.push(`| ${cat} | ${val === null ? '— _not checked yet_' : val} |`);
  }
  lines.push('');

  if (delta.newFindings.length > 0) {
    lines.push(`## New this week (${delta.newFindings.length})`);
    lines.push('');
    const newSet = new Set(delta.newFindings);
    for (const f of report.findings.filter(f => newSet.has(f.id))) {
      lines.push(findingLine(f));
    }
    lines.push('');
  }

  lines.push(`## All open findings (${report.findings.length})`);
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('_None. Clean audit._');
  } else {
    for (const f of report.findings) {
      lines.push(findingLine(f) + ` _(open ${f.weeksOpen}w, since ${f.firstSeenWeek})_`);
    }
  }
  lines.push('');

  if (delta.resolvedFindings.length > 0) {
    lines.push(`## Resolved since last week (${delta.resolvedFindings.length})`);
    lines.push('');
    for (const id of delta.resolvedFindings) {
      lines.push(`- ~~${id}~~`);
    }
    lines.push('');
  }

  lines.push('## Coverage');
  lines.push('');
  lines.push(`- URLs in the sitemap inventory: ${report.inputs.urlsAudited}`);
  lines.push(`- URLs with title/description checks: ${report.inputs.urlsMetaChecked} _(digest pages only — static and locale pages need the live-HTTP stage)_`);
  lines.push(`- Live HTTP checks: ${report.inputs.liveChecked ? 'yes' : 'no (Stage 2)'}`);
  lines.push(`- Search Console data: ${report.inputs.gscAvailable ? 'yes' : 'no (Stage 3)'}`);
  lines.push(`- LLM-assisted fixes: ${report.inputs.llmUsed ? 'yes' : 'no (Stage 4)'}`);
  lines.push('');
  lines.push('**This report reflects static checks only.** A clean score here does not mean the live site is healthy — nothing in this run fetched a single page.');
  lines.push('');

  return lines.join('\n');
}
