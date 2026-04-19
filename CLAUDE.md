# Terraform Plan Visualizer — Claude CLI Build Plan

## What you are building

A reusable Terraform plan visualization pipeline with three layers:

- **Layer 1**: Shell script that runs `terraform plan` and exports JSON
- **Layer 2**: Node.js report generator that produces THREE distinct output formats from the same plan data
- **Layer 3a**: GitHub Actions reusable workflow
- **Layer 3b**: Azure DevOps YAML template

The three output formats are described in detail in Task 2. Each has hard rendering constraints that differ from the others. Do not conflate them.

---

## Repo structure to create

```
infra-tools/
  scripts/
    tf-plan.sh
    tf-report.js
  .github/
    workflows/
      tf-plan-reusable.yml
  ado-templates/
    tf-plan-template.yml
  test/
    fixtures/
      sample-plan.json
    tf-report.test.js
  README.md
```

Create this exact structure. Do not add files not listed here.

---

## Task 1 — scripts/tf-plan.sh

Create a shell script that:

- Accepts one argument: the Terraform working directory (default: `.`)
- Changes into that directory
- Runs `terraform init -input=false`
- Runs `terraform plan -input=false -out=tfplan`
- Runs `terraform show -json tfplan > plan.json`
- Prints a summary line: `Plan saved to plan.json`
- Exits non-zero if any terraform command fails
- Uses `set -euo pipefail` at the top

No platform-specific logic. No GitHub or Azure references.

---

## Task 2 — scripts/tf-report.js

Create a Node.js script (no npm dependencies — stdlib only: `node:fs`, `node:path`, `node:process`).

### CLI interface

```
node tf-report.js <plan.json> <output-dir> [--format=all|pr|summary|artifact]
```

- `plan.json`: path to the Terraform JSON plan file
- `output-dir`: directory to write output files into (create if it doesn't exist)
- `--format`: which outputs to generate (default: `all`)

When `--format=all` or format is omitted, generate all three outputs.
When a specific format is given, generate only that output.

### Parsing logic (shared across all formats)

From `resource_changes`, for each entry where `change.actions` is not `["no-op"]`:

- `["create"]` → action `create`
- `["delete"]` → action `destroy`
- `["update"]` → action `update`
- `["delete","create"]` or `["create","delete"]` → action `replace`

For attributes, compare `change.before` vs `change.after`:

- Key in `after` but not `before` (or before is null) → `add`
- Key in `before` but not `after` (or after is null) → `remove`
- Both present, values differ → `update`
- Both present, values identical → `unchanged`
- Key appears in `change.after_unknown` with value `true` → `known_after_apply`

Flatten nested objects to dot-notation keys (e.g. `tags.Name`).
Truncate attribute values longer than 120 chars with `…`.

Action color mapping (used consistently across all formats):

- `create`  → green:  bg `#eaf3de`, text `#3b6d11`, border `#97c459`
- `update`  → amber:  bg `#faeeda`, text `#854f0b`, border `#ef9f27`
- `destroy` → red:    bg `#fcebeb`, text `#a32d2d`, border `#f09595`
- `replace` → pink:   bg `#fbeaf0`, text `#993556`, border `#ed93b1`

---

### Output A — PR comment fragment (`pr-comment.html`)

**Purpose**: Posted inline as a GitHub or Azure DevOps PR comment body.

**Hard constraints**:

- No `<html>`, `<head>`, or `<body>` tags. GitHub strips them and they break rendering.
- No `<script>` tags. GitHub's comment sanitizer strips all JavaScript. Output must be purely static HTML.
- No `<style>` blocks at the top level. Use only inline `style="..."` attributes on every element.
- No external resource references (`src=`, `href=` pointing anywhere).
- Total file size must be under 65000 bytes. Print a warning if it exceeds this.
- Use only GitHub-allowed tags: `<details>`, `<summary>`, `<table>`, `<tr>`, `<td>`, `<th>`, `<code>`, `<strong>`, `<em>`, `<br>`, `<span>`, `<div>`, `<p>`, `<h3>`, `<h4>`.

**Structure**:

Outer wrapper:

```html
<details open>
<summary><strong>Terraform Plan</strong> — N changes (X create, Y update, Z destroy, W replace)</summary>

<table>
  <tr>
    <th style="...">Action</th>
    <th style="...">Count</th>
  </tr>
  <!-- one row per action type present in the plan -->
</table>

<!-- one <details> block per resource -->
<!-- border-left color matches the action: #97c459 create · #ef9f27 update · #f09595 destroy · #ed93b1 replace -->
<details style="border:0.5px solid #d0d0d0;border-radius:8px;margin-bottom:10px;overflow:hidden;border-left:3px solid #97c459">
<summary style="padding:8px 12px;cursor:pointer">
  <span style="background:#eaf3de;color:#3b6d11;border:0.5px solid #97c459;padding:1px 6px;border-radius:3px;font-size:12px">+ create</span>
  &nbsp;<code>aws_vpc</code> · <strong>module.networking.main</strong>
</summary>
<table style="width:100%;font-size:12px;border-collapse:collapse;border-top:0.5px solid #e0e0e0">
  <tr>
    <th style="text-align:left;padding:3px 6px;color:#666;font-weight:normal;width:200px">Attribute</th>
    <th style="text-align:left;padding:3px 6px">Change</th>
  </tr>
  <!-- one row per CHANGED attribute only (add, remove, update, known_after_apply) -->
  <!-- do NOT include unchanged attributes -->
</table>
</details>

</details>
```

Do NOT show unchanged attributes in the PR comment output. Only changed, added, removed, and known_after_apply. This is the primary mechanism for staying under 65KB.

If zero changes:

```html
<p>No changes. Infrastructure is up-to-date.</p>
```

---

### Output B — GitHub Actions step summary (`summary.html`)

**Purpose**: Written to `$GITHUB_STEP_SUMMARY`. Appears in the GitHub Actions run UI under the "Summary" tab. GitHub hosts and renders this page.

**Hard constraints**:

- No `<html>`, `<head>`, or `<body>` tags (GitHub wraps this in its own page).
- `<style>` blocks ARE allowed — use class-based CSS, not inline styles everywhere.
- `<script>` tags ARE allowed — use JavaScript for filter pills and expand/collapse.
- GitHub Actions summary supports up to 1MB. No size constraint.
- Target render width: ~900px.

**Structure**:

```html
<style>
/* class-based CSS for all elements */
/* pill buttons, card headers, attr rows, badges */
/* no external references */
</style>

<h2>Terraform Plan Summary</h2>
<p style="color:#666">N resources to change · generated at TIMESTAMP</p>

<div class="filter-bar">
  <button class="pill pill-create active" onclick="toggleFilter('create')">+ create (N)</button>
  <!-- one button per action type present -->
</div>

<div class="resource-card action-create" data-action="create">
  <div class="card-header" onclick="toggleCard(this)">
    <span class="badge badge-create">+ create</span>
    <code class="resource-type">aws_vpc</code>
    <span class="resource-name">module.networking.main</span>
    <span class="chevron">▶</span>
  </div>
  <div class="attr-list" style="display:none">
    <!-- changed attributes first -->
    <div class="attr-row attr-add"><span class="attr-key">cidr_block</span><span class="attr-val attr-val-add">10.0.0.0/16</span></div>
    <hr class="attr-divider">
    <!-- unchanged attributes below the divider, dimmed -->
    <div class="attr-row attr-unchanged"><span class="attr-key">enable_dns_support</span><span class="attr-val">true</span></div>
  </div>
</div>

<script>
// toggleFilter(action): toggle data-action cards, track active state on pill buttons
// toggleCard(headerEl): toggle .attr-list display and rotate chevron
// On load: all filters active, all cards collapsed
</script>
```

Show ALL attributes — changed first, then unchanged below a `<hr>`. The summary is for full review.

---

### Output C — Standalone artifact (`plan-report.html`)

**Purpose**: Uploaded as a pipeline artifact. Downloaded and opened locally in a browser.

**Hard constraints**:

- Must be a complete, valid HTML document with `<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`.
- No external resources of any kind. Must work via `file://` protocol.
- No size constraint.

**Structure**: Same interactive layout as Output B but promoted to a full document:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Terraform Plan Report</title>
  <style>
  /* same CSS as summary.html, plus page-level styles */
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem; }
  </style>
</head>
<body>
  <h1>Terraform Plan Report</h1>
  <p>Generated: TIMESTAMP · Terraform TERRAFORM_VERSION</p>
  <!-- same filter pills, resource cards, JS as summary.html -->
  <script>
  /* same JS as summary.html */
  </script>
</body>
</html>
```

---

### Shared edge cases (all three outputs)

- Zero changes: each format shows appropriate "no changes" message
- Missing `resource_changes` key: show "Unable to parse plan. Ensure you used terraform show -json."
- Only `no-op` entries: treat as zero changes

### Script output after generation

```
pr-comment.html    12.4 KB  [OK — under 65KB limit]
summary.html       38.1 KB
plan-report.html   41.2 KB
```

If `pr-comment.html` exceeds 65000 bytes:

```
pr-comment.html    71.3 KB  [WARNING — exceeds 65KB GitHub comment limit. Will not post inline.]
```

---

## Task 3 — .github/workflows/tf-plan-reusable.yml

Create a reusable GitHub Actions workflow triggered via `workflow_call`.

### Inputs

```yaml
inputs:
  terraform_dir:
    description: 'Path to Terraform working directory'
    required: false
    default: '.'
  tools_repo:
    description: 'Repo containing infra-tools scripts (owner/repo@ref). Leave empty if scripts are in the calling repo.'
    required: false
    default: ''
```

### Secrets

```yaml
secrets:
  TF_API_TOKEN:
    required: false
```

### Steps in order

1. Checkout the calling repo (`actions/checkout@v4`)
2. Checkout `infra-tools` repo to `.infra-tools/` only if `tools_repo` input is non-empty
3. Setup Terraform (`hashicorp/setup-terraform@v3`)
4. Run `scripts/tf-plan.sh "${{ inputs.terraform_dir }}"`
5. Run `node scripts/tf-report.js plan.json ./report-out --format=all`
6. **Write Actions summary**:

   ```yaml
   - name: Write Actions summary
     if: always()
     run: cat report-out/summary.html >> $GITHUB_STEP_SUMMARY
   ```

7. **Upload artifact** (`actions/upload-artifact@v4`): upload `report-out/plan-report.html` as `terraform-plan-report`. Run with `if: always()`.
8. **Post PR comment** (`actions/github-script@v7`): run with `if: always() && github.event_name == 'pull_request'`
   - Read `report-out/pr-comment.html`
   - Check byte length
   - If under 65000: find and delete previous comment containing `<!-- tf-plan-report -->` on this PR, then post new comment with `<!-- tf-plan-report -->` prepended
   - If 65000 or over: post fallback plain-text comment with link to artifact instead

### Action version pins

- `actions/checkout@v4`
- `hashicorp/setup-terraform@v3`
- `actions/upload-artifact@v4`
- `actions/github-script@v7`

---

## Task 4 — ado-templates/tf-plan-template.yml

Create an Azure DevOps YAML template.

### Parameters

```yaml
parameters:
  - name: terraformDir
    type: string
    default: '.'
  - name: toolsRepoResource
    type: string
    default: 'infra-tools'
```

### Steps in order

1. Checkout self
2. Checkout the tools repo resource referenced by `toolsRepoResource`
3. `TerraformInstaller@1` (ms-devlabs extension, version: `latest`)
4. Bash: `scripts/tf-plan.sh "${{ parameters.terraformDir }}"`
5. Bash: `node scripts/tf-report.js plan.json ./report-out --format=all`
6. Publish `report-out/plan-report.html` as artifact `TerraformPlanReport`
7. Post PR comment (only if `Build.Reason == PullRequest`):
   - Read `report-out/pr-comment.html`
   - If under 65000 bytes: POST to Azure DevOps PR Threads REST API using `System.AccessToken`
     - Endpoint: `$(System.CollectionUri)$(System.TeamProject)/_apis/git/repositories/$(Build.Repository.ID)/pullRequests/$(System.PullRequest.PullRequestId)/threads?api-version=7.0`
     - Header: `Authorization: Bearer $(System.AccessToken)`
     - Body: `{"comments":[{"parentCommentId":0,"content":"<HTML_CONTENT>","commentType":1}],"status":1}`
   - If 65000 or over: post the fallback plain-text message instead
   - Note: `summary.html` is generated but not used in Azure DevOps — the Actions summary tab is GitHub-only. Document this in README.

---

## Task 5 — test/fixtures/sample-plan.json

Create a realistic `terraform show -json` output that includes:

- One `aws_vpc` with action `["create"]`
- One `aws_security_group` with action `["update"]` (change one ingress CIDR block)
- One `aws_instance` with action `["delete"]`
- One `aws_db_instance` with action `["delete","create"]` (triggered by engine_version change)

Use realistic attribute names and values. Include `after_unknown: { "id": true, "arn": true }` on create resources. Match Terraform JSON plan schema with top-level keys: `format_version`, `terraform_version`, `variables`, `planned_values`, `resource_changes`, `configuration`.

---

## Task 6 — test/tf-report.test.js

Use Node's built-in `node:test` module only.

### Tests

**1. PR comment output** — generate from `sample-plan.json`, assert:

- Contains `+ create`, `~ update`, `- destroy`, `± replace`
- Contains resource names from the fixture
- Contains NO `<script` tag
- Contains NO `<html` or `<body` tag
- File size under 65000 bytes
- Does NOT contain a known unchanged attribute key from the fixture (verify space-saving is working)

**2. Summary output** — generate from `sample-plan.json`, assert:

- Contains a `<script` tag
- Contains all four action type labels
- Contains ALL attributes including at least one unchanged attribute key from the fixture
- Contains NO `<html` or `<body` tag

**3. Artifact output** — generate from `sample-plan.json`, assert:

- Contains `<!DOCTYPE html`
- Contains `<title`
- Contains a `<script` tag
- Does NOT contain `src="http` or `href="http` (fully self-contained)

**4. Zero changes** — pass a plan with only `no-op` entries, assert all three outputs contain "no changes" (case-insensitive match)

**5. Malformed input** — pass `{}`, assert all three outputs contain "terraform show -json" (case-insensitive match)

Run with: `node --test test/tf-report.test.js`

---

## Task 7 — README.md

Sections:

1. **Overview** — what this builds, the three output formats, and where each surface appears
2. **Repo structure** — directory tree
3. **Usage: local** — run `tf-plan.sh` and `tf-report.js` locally; show all format flags
4. **Usage: GitHub Actions** — minimal caller workflow using `uses:`; how to find the summary tab and artifact download
5. **Usage: Azure DevOps** — minimal pipeline YAML using `extends:`; note summary.html is GitHub Actions only
6. **Output format reference** — table with columns: File, Destination, Size limit, JavaScript, Full HTML doc
7. **PR comment size** — explain 65KB limit, what the fallback looks like, how to reduce size (unchanged attrs are excluded from PR comment by design)
8. **Adding a new CI platform** — Layer 3 wrapper only; layers 1 and 2 unchanged

---

## Constraints and rules

- `tf-report.js`: zero npm dependencies, stdlib only.
- Shell scripts: `set -euo pipefail`.
- `pr-comment.html`: no `<script>`, no `<style>`, no `<html>`/`<body>`, inline styles only, GitHub-allowed tags only.
- `summary.html`: no `<html>`/`<body>`, `<style>` and `<script>` allowed.
- `plan-report.html`: full HTML document, fully self-contained, works via `file://`.
- No `package.json`, no Dockerfile, no container action.
- GitHub Actions: pinned action versions.
- Azure DevOps: `System.AccessToken` only.
- Every file: comment at top explaining purpose and usage.

---

## Order of execution

1. `scripts/tf-plan.sh`
2. `test/fixtures/sample-plan.json`
3. `scripts/tf-report.js`
4. `test/tf-report.test.js` — run it, fix until all pass, print full output and file sizes
5. `.github/workflows/tf-plan-reusable.yml`
6. `ado-templates/tf-plan-template.yml`
7. `README.md`

Do not proceed past step 4 until all tests pass.

---

## Definition of done

- `node --test test/tf-report.test.js` passes with zero failures
- `pr-comment.html` is under 65KB, has no `<script>` tags, no `<html>`/`<body>` tags
- `summary.html` has `<script>` tags, shows all attributes, no `<html>`/`<body>` tags
- `plan-report.html` has `<!DOCTYPE html>`, `<title>`, works offline
- All 7 files exist at correct paths
- No external network calls in any generated file or script
- README documents all three output surfaces
