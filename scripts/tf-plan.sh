#!/usr/bin/env bash
# tf-plan.sh — Run terraform init/plan/show and export plan.json
# Usage: ./scripts/tf-plan.sh [terraform-working-dir]
# The first argument is the Terraform working directory (default: .)

set -euo pipefail

TF_DIR="${1:-.}"

cd "$TF_DIR"

echo "==> terraform init"
terraform init -input=false

echo "==> terraform plan"
terraform plan -input=false -out=tfplan

echo "==> terraform show -json"
terraform show -json tfplan > plan.json

echo "Plan saved to plan.json"
