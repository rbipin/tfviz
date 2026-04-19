// ReportBuilder.ts — Abstract base class and three concrete report builders:
//   PrCommentBuilder  → pr-comment.html  (no script/style/html/body, inline styles only, <65KB)
//   SummaryBuilder    → summary.html     (fragment with style+script, GitHub Actions summary)
//   ArtifactBuilder   → plan-report.html (full HTML document, self-contained, works offline)

import type { ActionType, ParsedPlan, ParsedResource, ResourceAttribute } from './types';
import { HtmlUtils } from './HtmlUtils';

// ---------------------------------------------------------------------------
// Abstract base — shared rendering helpers
// ---------------------------------------------------------------------------

export abstract class ReportBuilder {
  /** Build the full output string from a ParsedPlan. */
  abstract build(plan: ParsedPlan): string;

  protected countByAction(resources: readonly ParsedResource[]): Record<ActionType, number> {
    const counts: Record<ActionType, number> = { create: 0, update: 0, destroy: 0, replace: 0 };
    for (const r of resources) counts[r.action]++;
    return counts;
  }

  protected buildFilterBar(resources: readonly ParsedResource[]): string {
    const counts = this.countByAction(resources);
    let html = '<div class="filter-bar">\n';
    for (const [action, n] of Object.entries(counts) as [ActionType, number][]) {
      if (!n) continue;
      const label = HtmlUtils.ACTION_LABELS[action];
      html += `  <button class="pill pill-${HtmlUtils.esc(action)} active" `
        + `data-action="${HtmlUtils.esc(action)}" `
        + `onclick="toggleFilter('${HtmlUtils.esc(action)}')">${HtmlUtils.esc(label)} (${n})</button>\n`;
    }
    html += '</div>\n';
    return html;
  }

  protected buildResourceCards(resources: readonly ParsedResource[]): string {
    let html = '';
    for (const res of resources) {
      html += this.buildSingleCard(res);
    }
    return html;
  }

  private buildSingleCard(res: ParsedResource): string {
    const { action } = res;
    const label = HtmlUtils.ACTION_LABELS[action];

    const changed = res.attrs.filter((a) => a.attrAction !== 'unchanged');
    const unchanged = res.attrs.filter((a) => a.attrAction === 'unchanged');

    let attrRows = '';
    for (const attr of changed) {
      attrRows += this.buildAttrRow(attr);
    }
    if (unchanged.length > 0 && changed.length > 0) {
      attrRows += '<hr class="attr-divider">\n';
    }
    for (const attr of unchanged) {
      attrRows += `<div class="attr-row">`
        + `<span class="attr-key">${HtmlUtils.esc(attr.key)}</span>`
        + `<span class="attr-val val-unchanged">${HtmlUtils.esc(attr.next)}</span>`
        + `</div>\n`;
    }

    return `<div class="resource-card" data-action="${HtmlUtils.esc(action)}">\n`
      + `  <div class="card-header" onclick="toggleCard(this)">\n`
      + `    <span class="badge badge-${HtmlUtils.esc(action)}">${HtmlUtils.esc(label)}</span>\n`
      + `    <code class="resource-type">${HtmlUtils.esc(res.type)}</code>\n`
      + `    <span class="resource-name">${HtmlUtils.esc(res.address)}</span>\n`
      + `    <span class="chevron">&#9654;</span>\n`
      + `  </div>\n`
      + `  <div class="attr-list" style="display:none">\n`
      + attrRows
      + `  </div>\n`
      + `</div>\n`;
  }

  protected buildAttrRow(attr: ResourceAttribute): string {
    const valHtml = this.renderAttrValue(attr);
    return `<div class="attr-row">`
      + `<span class="attr-key">${HtmlUtils.esc(attr.key)}</span>`
      + `<span class="attr-val">${valHtml}</span>`
      + `</div>\n`;
  }

  private renderAttrValue(attr: ResourceAttribute): string {
    switch (attr.attrAction) {
      case 'add':
        return `<span class="val-add">${HtmlUtils.esc(attr.next)}</span>`;
      case 'remove':
        return `<span class="val-remove">${HtmlUtils.esc(attr.prev)}</span>`;
      case 'update':
        return `<span class="val-update-from">${HtmlUtils.esc(attr.prev)}</span>`
          + `<span class="arrow">→</span>`
          + `<span class="val-update-to">${HtmlUtils.esc(attr.next)}</span>`;
      case 'known_after_apply':
        return `<span class="val-known">(known after apply)</span>`;
      default:
        return HtmlUtils.esc(attr.next);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared CSS + JS (used by SummaryBuilder and ArtifactBuilder)
// ---------------------------------------------------------------------------

const SHARED_CSS = `<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.filter-bar { display: flex; gap: 8px; margin-bottom: 1.25rem; flex-wrap: wrap; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; border: 0.5px solid; cursor: pointer; transition: opacity .15s; user-select: none; background: none; }
.pill.active { opacity: 1; }
.pill.inactive { opacity: 0.35; }
.pill-create  { background: #eaf3de; color: #3b6d11; border-color: #97c459; }
.pill-update  { background: #faeeda; color: #854f0b; border-color: #ef9f27; }
.pill-destroy { background: #fcebeb; color: #a32d2d; border-color: #f09595; }
.pill-replace { background: #fbeaf0; color: #993556; border-color: #ed93b1; }
.resource-card { border: 0.5px solid #d0d0d0; border-radius: 8px; margin-bottom: 10px; overflow: hidden; }
.card-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; user-select: none; }
.card-header:hover { background: #f5f5f5; }
.badge { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 4px; border: 0.5px solid; flex-shrink: 0; }
.badge-create  { background: #eaf3de; color: #3b6d11; border-color: #97c459; }
.badge-update  { background: #faeeda; color: #854f0b; border-color: #ef9f27; }
.badge-destroy { background: #fcebeb; color: #a32d2d; border-color: #f09595; }
.badge-replace { background: #fbeaf0; color: #993556; border-color: #ed93b1; }
.resource-type { font-size: 12px; color: #666; flex-shrink: 0; font-family: monospace; }
.resource-name { font-size: 13px; font-weight: 500; color: #111; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chevron { font-size: 10px; color: #999; transition: transform .2s; flex-shrink: 0; display: inline-block; }
.chevron.open { transform: rotate(90deg); }
.attr-list { border-top: 0.5px solid #e0e0e0; padding: 8px 0; }
.attr-row { display: grid; grid-template-columns: 220px 1fr; font-size: 12px; padding: 3px 14px; gap: 8px; }
.attr-key { color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: monospace; }
.attr-val { font-family: monospace; white-space: pre-wrap; word-break: break-all; }
.val-add          { color: #3b6d11; }
.val-remove       { color: #a32d2d; text-decoration: line-through; }
.val-update-from  { color: #a32d2d; text-decoration: line-through; }
.val-update-to    { color: #3b6d11; }
.val-known        { color: #888; font-style: italic; }
.val-unchanged    { color: #888; }
.attr-divider     { border: none; border-top: 0.5px solid #e8e8e8; margin: 4px 14px; }
.arrow            { color: #999; margin: 0 4px; }
.no-results       { font-size: 13px; color: #999; padding: 1rem 0; }
</style>`;

const SHARED_JS = `<script>
(function() {
  var activeFilters = new Set();
  document.querySelectorAll('.pill').forEach(function(p) {
    activeFilters.add(p.dataset.action);
  });

  function applyFilters() {
    document.querySelectorAll('.resource-card').forEach(function(card) {
      card.style.display = activeFilters.has(card.dataset.action) ? '' : 'none';
    });
    document.querySelectorAll('.pill').forEach(function(p) {
      p.className = p.className.replace(/ ?(active|inactive)/g, '');
      p.classList.add(activeFilters.has(p.dataset.action) ? 'active' : 'inactive');
    });
  }

  window.toggleFilter = function(action) {
    if (activeFilters.has(action)) {
      activeFilters.delete(action);
    } else {
      activeFilters.add(action);
    }
    applyFilters();
  };

  window.toggleCard = function(headerEl) {
    var attrList = headerEl.nextElementSibling;
    var chevron = headerEl.querySelector('.chevron');
    var isOpen = attrList.style.display !== 'none';
    attrList.style.display = isOpen ? 'none' : 'block';
    if (chevron) {
      if (isOpen) { chevron.classList.remove('open'); }
      else { chevron.classList.add('open'); }
    }
  };
})();
</script>`;

// ---------------------------------------------------------------------------
// PrCommentBuilder — Output A
// No <html>/<body>/<head>, no <script>, no <style>. Inline styles only. <65KB.
// ---------------------------------------------------------------------------

export class PrCommentBuilder extends ReportBuilder {
  private static readonly TH_STYLE =
    'style="text-align:left;padding:4px 8px;border-bottom:1px solid #e0e0e0;font-size:12px;color:#555;font-weight:600"';

  build(plan: ParsedPlan): string {
    if (plan.error) {
      return `<p>${HtmlUtils.esc(plan.error)}</p>`;
    }
    if (plan.resources.length === 0) {
      return '<p>No changes. Infrastructure is up-to-date.</p>';
    }
    return this.buildContent(plan.resources);
  }

  private buildContent(resources: readonly ParsedResource[]): string {
    const counts = this.countByAction(resources);
    const total = resources.length;
    const parts = (Object.entries(counts) as [ActionType, number][])
      .filter(([, n]) => n > 0)
      .map(([a, n]) => `${n} ${a}`);

    const summaryLine = `${total} change${total !== 1 ? 's' : ''} (${parts.join(', ')})`;

    let html = `<!-- tf-plan-report -->\n`
      + `<details open>\n`
      + `<summary><strong>Terraform Plan</strong> — ${HtmlUtils.esc(summaryLine)}</summary>\n\n`
      + this.buildCountTable(counts)
      + `\n`;

    for (const res of resources) {
      html += this.buildResourceBlock(res);
    }

    html += `</details>\n`;
    return html;
  }

  private buildCountTable(counts: Record<ActionType, number>): string {
    let rows = '';
    for (const [action, n] of Object.entries(counts) as [ActionType, number][]) {
      if (!n) continue;
      const c = HtmlUtils.ACTION_COLORS[action];
      const label = HtmlUtils.ACTION_LABELS[action];
      rows += `<tr>\n`
        + `  <td style="padding:3px 8px;font-size:12px">`
        + `<span style="background:${c.bg};color:${c.text};border:0.5px solid ${c.border};`
        + `padding:1px 6px;border-radius:3px;font-size:11px">${HtmlUtils.esc(label)}</span></td>\n`
        + `  <td style="padding:3px 8px;font-size:12px">${n}</td>\n`
        + `</tr>\n`;
    }

    return `<table>\n`
      + `<tr>\n`
      + `  <th ${PrCommentBuilder.TH_STYLE}>Action</th>\n`
      + `  <th ${PrCommentBuilder.TH_STYLE}>Count</th>\n`
      + `</tr>\n`
      + rows
      + `</table>\n`;
  }

  private buildResourceBlock(res: ParsedResource): string {
    const c = HtmlUtils.ACTION_COLORS[res.action];
    const label = HtmlUtils.ACTION_LABELS[res.action];
    const changedAttrs = res.attrs.filter((a) => a.attrAction !== 'unchanged');

    let attrRows = '';
    for (const attr of changedAttrs) {
      attrRows += this.buildInlineAttrRow(attr);
    }

    return `<details style="border:0.5px solid #d0d0d0;border-radius:8px;margin-bottom:10px;`
      + `overflow:hidden;border-left:3px solid ${c.border}">\n`
      + `<summary style="padding:8px 12px;cursor:pointer">\n`
      + `  <span style="background:${c.bg};color:${c.text};border:0.5px solid ${c.border};`
      + `padding:1px 6px;border-radius:3px;font-size:12px">${HtmlUtils.esc(label)}</span>\n`
      + `  &nbsp;<code>${HtmlUtils.esc(res.type)}</code> · <strong>${HtmlUtils.esc(res.address)}</strong>\n`
      + `</summary>\n`
      + `<table style="width:100%;font-size:12px;border-collapse:collapse;border-top:0.5px solid #e0e0e0">\n`
      + `<tr>\n`
      + `  <th style="text-align:left;padding:3px 6px;color:#666;font-weight:normal;width:200px">Attribute</th>\n`
      + `  <th style="text-align:left;padding:3px 6px">Change</th>\n`
      + `</tr>\n`
      + attrRows
      + `</table>\n`
      + `</details>\n\n`;
  }

  private buildInlineAttrRow(attr: ResourceAttribute): string {
    const changeCell = this.renderInlineAttrValue(attr);
    return `<tr>\n`
      + `  <td style="padding:3px 6px;color:#666;font-weight:normal;width:200px;`
      + `font-size:12px;vertical-align:top"><code>${HtmlUtils.esc(attr.key)}</code></td>\n`
      + `  <td style="padding:3px 6px;font-size:12px;font-family:monospace;`
      + `word-break:break-all">${changeCell}</td>\n`
      + `</tr>\n`;
  }

  private renderInlineAttrValue(attr: ResourceAttribute): string {
    switch (attr.attrAction) {
      case 'add':
        return `<span style="color:#3b6d11">${HtmlUtils.esc(attr.next)}</span>`;
      case 'remove':
        return `<span style="color:#a32d2d;text-decoration:line-through">${HtmlUtils.esc(attr.prev)}</span>`;
      case 'update':
        return `<span style="color:#a32d2d;text-decoration:line-through">${HtmlUtils.esc(attr.prev)}</span> `
          + `<span style="color:#555">→</span> `
          + `<span style="color:#3b6d11">${HtmlUtils.esc(attr.next)}</span>`;
      case 'known_after_apply':
        return `<em style="color:#888">(known after apply)</em>`;
      default:
        return HtmlUtils.esc(attr.next);
    }
  }
}

// ---------------------------------------------------------------------------
// SummaryBuilder — Output B
// No <html>/<body>, but <style> and <script> are allowed.
// Shows ALL attributes (changed first, then unchanged below a divider).
// ---------------------------------------------------------------------------

export class SummaryBuilder extends ReportBuilder {
  private readonly sharedCss: string = SHARED_CSS;
  private readonly sharedJs: string = SHARED_JS;

  build(plan: ParsedPlan): string {
    const timestamp = new Date().toISOString();

    if (plan.error) {
      return `<p>${HtmlUtils.esc(plan.error)}</p>\n`;
    }

    if (plan.resources.length === 0) {
      return `${this.sharedCss}\n`
        + `<h2>Terraform Plan Summary</h2>\n`
        + `<p style="color:#666">No changes · generated at ${HtmlUtils.esc(timestamp)}</p>\n`
        + `<p class="no-results">No changes. Infrastructure is up-to-date.</p>\n`;
    }

    const total = plan.resources.length;
    return `${this.sharedCss}\n`
      + `<h2>Terraform Plan Summary</h2>\n`
      + `<p style="color:#666;margin-bottom:1rem">`
      + `${total} resource${total !== 1 ? 's' : ''} to change · generated at ${HtmlUtils.esc(timestamp)}`
      + `</p>\n\n`
      + this.buildFilterBar(plan.resources)
      + `\n`
      + this.buildResourceCards(plan.resources)
      + `\n`
      + this.sharedJs;
  }
}

// ---------------------------------------------------------------------------
// ArtifactBuilder — Output C
// Full valid HTML document. Fully self-contained. Works via file://.
// ---------------------------------------------------------------------------

export class ArtifactBuilder extends ReportBuilder {
  private readonly sharedCss: string = SHARED_CSS;
  private readonly sharedJs: string = SHARED_JS;

  build(plan: ParsedPlan): string {
    const timestamp = new Date().toISOString();
    const body = this.buildBody(plan, timestamp);
    return this.buildDocumentShell(body, timestamp, plan.terraformVersion);
  }

  private buildBody(plan: ParsedPlan, timestamp: string): string {
    if (plan.error) {
      return `<p>${HtmlUtils.esc(plan.error)}</p>`;
    }

    if (plan.resources.length === 0) {
      return '<p>No changes. Infrastructure is up-to-date.</p>';
    }

    const total = plan.resources.length;
    return `<p style="color:#666;margin-bottom:1rem">`
      + `${total} resource${total !== 1 ? 's' : ''} to change · generated at ${HtmlUtils.esc(timestamp)}`
      + `</p>\n`
      + this.buildFilterBar(plan.resources)
      + `\n`
      + this.buildResourceCards(plan.resources);
  }

  private buildDocumentShell(body: string, timestamp: string, terraformVersion: string): string {
    return `<!DOCTYPE html>\n`
      + `<html lang="en">\n`
      + `<head>\n`
      + `  <meta charset="UTF-8">\n`
      + `  <meta name="viewport" content="width=device-width, initial-scale=1">\n`
      + `  <title>Terraform Plan Report</title>\n`
      + `  ${this.sharedCss}\n`
      + `  <style>\n`
      + `  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; `
      + `max-width: 960px; margin: 0 auto; padding: 2rem; color: #111; }\n`
      + `  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }\n`
      + `  .meta { font-size: 13px; color: #666; margin-bottom: 1.5rem; }\n`
      + `  </style>\n`
      + `</head>\n`
      + `<body>\n`
      + `  <h1>Terraform Plan Report</h1>\n`
      + `  <p class="meta">Generated: ${HtmlUtils.esc(timestamp)} · Terraform ${HtmlUtils.esc(terraformVersion)}</p>\n`
      + body + `\n`
      + this.sharedJs + `\n`
      + `</body>\n`
      + `</html>\n`;
  }
}
