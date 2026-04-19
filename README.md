# ßTerraform Plan Visualizer

## Overview

This toolset provides a reusable Terraform plan visualization pipeline that runs on both **GitHub Actions** and **Azure DevOps**. It produces three distinct output formats from a single JSON plan:

| Output | Where it appears |
|--------|-----------------|
| `pr-comment.html` | Posted inline as a PR comment on GitHub or Azure DevOps |
| `summary.html` | Written to the GitHub Actions Summary tab (GitHub-only) |
| `plan-report.html` | Uploaded as a downloadable pipeline artifact on both platforms |

The pipeline has three layers:

- **Layer 1** (`scripts/tf-plan.sh`) — platform-agnostic shell script that runs `terraform init/plan/show` and saves `plan.json`
- **Layer 2** (`scripts/tf-report.js`) — Node.js report generator (zero npm dependencies) that reads `plan.json` and produces all three HTML outputs
- **Layer 3a** (`.github/workflows/tf-plan-reusable.yml`) — reusable GitHub Actions workflow
- **Layer 3b** (`ado-templates/tf-plan-template.yml`) — Azure DevOps YAML template

---

## Repo structure

```
infra-tools/
  scripts/
    tf-plan.sh           # Layer 1: run terraform, export plan.json
    tf-report.js         # Layer 2: generate all three HTML outputs
  .github/
    workflows/
      tf-plan-reusable.yml   # Layer 3a: GitHub Actions reusable workflow
  ado-templates/
    tf-plan-template.yml     # Layer 3b: Azure DevOps YAML template
  test/
    fixtures/
      sample-plan.json   # Realistic terraform show -json fixture
    tf-report.test.js    # Tests (Node built-in test module)
  README.md
```

---

## Usage: local

**Step 1 — Run the plan and export JSON:**

```bash
./scripts/tf-plan.sh path/to/terraform/dir
# outputs: plan.json in the Terraform directory
```

**Step 2 — Generate reports:**

```bash
# All three formats
node scripts/tf-report.js plan.json ./report-out

# Only the PR comment fragment
node scripts/tf-report.js plan.json ./report-out --format=pr

# Only the Actions summary
node scripts/tf-report.js plan.json ./report-out --format=summary

# Only the standalone artifact
node scripts/tf-report.js plan.json ./report-out --format=artifact
```

Outputs are written to `report-out/`:

```
pr-comment.html    10.8 KB  [OK — under 65KB limit]
summary.html       10.9 KB
plan-report.html   11.4 KB
```

---

## Usage: GitHub Actions

Add a caller workflow in your repository:

```yaml
# .github/workflows/tf-plan.yml
name: Terraform Plan

on:
  pull_request:
    branches: [main]

jobs:
  tf-plan:
    uses: your-org/infra-tools/.github/workflows/tf-plan-reusable.yml@main
    with:
      terraform_dir: infra/environments/prod
    secrets:
      TF_API_TOKEN: ${{ secrets.TF_API_TOKEN }}
```

**After the workflow runs:**

- **PR comment**: Posted automatically on the pull request with a collapsible diff per resource
- **Summary tab**: Visit the Actions run → click **Summary** at the top to see the interactive plan with filter pills and expand/collapse cards
- **Artifact**: Click **Artifacts** on the workflow run page and download `terraform-plan-report` to view `plan-report.html` locally

---

## Usage: Azure DevOps

**Step 1** — Register infra-tools as a repository resource in your pipeline:

```yaml
# azure-pipelines.yml
resources:
  repositories:
    - repository: infra-tools
      type: github
      name: your-org/infra-tools
      endpoint: your-github-service-connection

extends:
  template: ado-templates/tf-plan-template.yml@infra-tools
  parameters:
    terraformDir: infra/environments/prod
```

**Note:** `summary.html` is generated during the run but is not used in Azure DevOps — the Actions summary tab is GitHub-specific. On Azure DevOps, plans are surfaced via the PR comment and the downloadable pipeline artifact (`TerraformPlanReport`).

**Requirements:**

- Grant the pipeline **Contribute** permission on the target repository so `System.AccessToken` can post PR comments
- The `TerraformInstaller@1` task requires the [ms-devlabs Terraform extension](https://marketplace.visualstudio.com/items?itemName=ms-devlabs.custom-terraform-tasks) to be installed in your organization

---

## Output format reference

| File | Destination | Size limit | JavaScript | Full HTML doc |
|------|-------------|------------|------------|---------------|
| `pr-comment.html` | GitHub / ADO PR comment body | **< 65 KB** | No | No |
| `summary.html` | `$GITHUB_STEP_SUMMARY` (GitHub Actions) | 1 MB | Yes | No |
| `plan-report.html` | Pipeline artifact (both platforms) | None | Yes | Yes |

---

## PR comment size

GitHub and Azure DevOps PR comment bodies have a practical limit of **65 KB**. The `pr-comment.html` fragment is designed to stay well under this by:

- Showing **only changed attributes** (add, remove, update, known_after_apply) — unchanged attributes are excluded
- Using compact inline styles instead of external CSS
- Truncating attribute values longer than 120 characters

If the generated fragment exceeds 65 KB (e.g., a very large plan with hundreds of resources), the pipeline automatically falls back to a plain-text comment containing a link to the downloadable artifact instead.

```
[WARNING — exceeds 65KB GitHub comment limit. Will not post inline.]
```

To further reduce size for very large plans, consider splitting Terraform into smaller root modules.

---

## Adding a new CI platform

Only **Layer 3** needs to be added. Layers 1 and 2 are platform-agnostic and unchanged.

A new Layer 3 wrapper must:

1. Checkout the calling repo and the infra-tools repo (if separate)
2. Install Terraform
3. Run `scripts/tf-plan.sh "$TERRAFORM_DIR"`
4. Run `node scripts/tf-report.js plan.json ./report-out --format=all`
5. Write or upload `summary.html` to whatever summary surface the platform provides (if any)
6. Upload `plan-report.html` as a pipeline artifact
7. Read `pr-comment.html`, check its byte size, and post it (or a fallback) as a PR comment using the platform's API

No changes to `tf-plan.sh` or `tf-report.js` are required.
