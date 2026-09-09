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
    lines.push(`| ${cat} | ${val} |`);
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

  lines.push('## Inputs');
  lines.push('');
  lines.push(`- Live HTTP checks: ${report.inputs.liveChecked ? 'yes' : 'no (Phase 2)'}`);
  lines.push(`- Search Console data: ${report.inputs.gscAvailable ? 'yes' : 'no (Phase 3)'}`);
  lines.push(`- LLM-assisted fixes: ${report.inputs.llmUsed ? 'yes' : 'no (Phase 4)'}`);
  lines.push(`- URLs audited: ${report.inputs.urlsAudited}`);
  lines.push('');

  return lines.join('\n');
}
