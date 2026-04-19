// tf-report.test.js — Tests for tf-report.js using Node built-in test module
// Run with: node --test test/tf-report.test.js

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'tf-report.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'sample-plan.json');

function runReport(planFile, extraArgs = '') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-report-test-'));
  try {
    execSync(`node "${SCRIPT}" "${planFile}" "${tmpDir}" ${extraArgs}`, { encoding: 'utf8' });
    return tmpDir;
  } catch (e) {
    // execSync throws on non-zero exit; return tmpDir anyway so tests can inspect
    return tmpDir;
  }
}

// ---------------------------------------------------------------------------
// Test 1 — PR comment output
// ---------------------------------------------------------------------------

test('PR comment output is valid and under 65KB', () => {
  const tmpDir = runReport(FIXTURE, '--format=pr');
  const filePath = path.join(tmpDir, 'pr-comment.html');
  const content = fs.readFileSync(filePath, 'utf8');

  // Must contain action labels
  assert.ok(content.includes('+ create'), 'should contain + create');
  assert.ok(content.includes('~ update'), 'should contain ~ update');
  assert.ok(content.includes('- destroy'), 'should contain - destroy');
  assert.ok(content.includes('± replace'), 'should contain ± replace');

  // Must contain resource addresses from fixture
  assert.ok(content.includes('aws_vpc.main'), 'should contain aws_vpc.main');
  assert.ok(content.includes('aws_security_group.app_sg'), 'should contain security group');
  assert.ok(content.includes('aws_instance.legacy_worker'), 'should contain aws_instance');
  assert.ok(content.includes('aws_db_instance.primary'), 'should contain aws_db_instance');

  // Must NOT contain <script
  assert.ok(!content.includes('<script'), 'should not contain <script>');

  // Must NOT contain <html or <body
  assert.ok(!content.includes('<html'), 'should not contain <html>');
  assert.ok(!content.includes('<body'), 'should not contain <body>');

  // Must be under 65KB
  const bytes = Buffer.byteLength(content, 'utf8');
  assert.ok(bytes < 65000, `pr-comment.html must be under 65000 bytes, got ${bytes}`);

  // Must NOT include an unchanged attribute (e.g. "description" on security group is unchanged)
  // "name" is unchanged on aws_security_group.app_sg — should NOT appear as a change row
  // We test that unchanged attrs don't appear as attributed change rows
  // The key "name" with value "app-sg" appears in both before/after unchanged — should be absent from PR output
  // We check that the word "app-sg" does NOT appear (it's the unchanged name value)
  assert.ok(!content.includes('app-sg'), 'should not include unchanged attribute value "app-sg" in pr comment');

  fs.rmSync(tmpDir, { recursive: true });
});

// ---------------------------------------------------------------------------
// Test 2 — Summary output
// ---------------------------------------------------------------------------

test('Summary output contains script, all action types, and unchanged attrs', () => {
  const tmpDir = runReport(FIXTURE, '--format=summary');
  const filePath = path.join(tmpDir, 'summary.html');
  const content = fs.readFileSync(filePath, 'utf8');

  // Must contain <script
  assert.ok(content.includes('<script'), 'should contain <script>');

  // Must contain all four action type labels
  assert.ok(content.includes('+ create'), 'should contain + create');
  assert.ok(content.includes('~ update'), 'should contain ~ update');
  assert.ok(content.includes('- destroy'), 'should contain - destroy');
  assert.ok(content.includes('± replace'), 'should contain ± replace');

  // Must contain ALL attributes including unchanged ones
  // "app-sg" is an unchanged value on aws_security_group.app_sg — should be present in summary
  assert.ok(content.includes('app-sg'), 'should include unchanged attribute value "app-sg" in summary');

  // Must NOT contain <html or <body
  assert.ok(!content.includes('<html'), 'should not contain <html>');
  assert.ok(!content.includes('<body'), 'should not contain <body>');

  fs.rmSync(tmpDir, { recursive: true });
});

// ---------------------------------------------------------------------------
// Test 3 — Artifact output
// ---------------------------------------------------------------------------

test('Artifact output is a complete self-contained HTML document', () => {
  const tmpDir = runReport(FIXTURE, '--format=artifact');
  const filePath = path.join(tmpDir, 'plan-report.html');
  const content = fs.readFileSync(filePath, 'utf8');

  // Must be a full HTML document
  assert.ok(content.includes('<!DOCTYPE html'), 'should contain <!DOCTYPE html>');
  assert.ok(content.includes('<title'), 'should contain <title>');

  // Must contain <script
  assert.ok(content.includes('<script'), 'should contain <script>');

  // Must NOT reference external URLs
  assert.ok(!content.includes('src="http'), 'should not contain external src=');
  assert.ok(!content.includes('href="http'), 'should not contain external href=');

  fs.rmSync(tmpDir, { recursive: true });
});

// ---------------------------------------------------------------------------
// Test 4 — Zero changes plan
// ---------------------------------------------------------------------------

test('Zero changes plan shows no-changes message in all formats', () => {
  // Build a plan with only no-op entries
  const zeroChangePlan = JSON.stringify({
    format_version: '1.2',
    terraform_version: '1.7.4',
    resource_changes: [
      {
        address: 'aws_vpc.main',
        mode: 'managed',
        type: 'aws_vpc',
        name: 'main',
        provider_name: 'registry.terraform.io/hashicorp/aws',
        change: {
          actions: ['no-op'],
          before: { cidr_block: '10.0.0.0/16' },
          after: { cidr_block: '10.0.0.0/16' },
          after_unknown: {},
        },
      },
    ],
  });

  const tmpPlan = path.join(os.tmpdir(), 'zero-change-plan.json');
  fs.writeFileSync(tmpPlan, zeroChangePlan);

  const tmpDir = runReport(tmpPlan, '--format=all');

  const prContent = fs.readFileSync(path.join(tmpDir, 'pr-comment.html'), 'utf8');
  const summaryContent = fs.readFileSync(path.join(tmpDir, 'summary.html'), 'utf8');
  const artifactContent = fs.readFileSync(path.join(tmpDir, 'plan-report.html'), 'utf8');

  assert.ok(/no changes/i.test(prContent), 'pr-comment should say no changes');
  assert.ok(/no changes/i.test(summaryContent), 'summary should say no changes');
  assert.ok(/no changes/i.test(artifactContent), 'artifact should say no changes');

  fs.rmSync(tmpDir, { recursive: true });
  fs.unlinkSync(tmpPlan);
});

// ---------------------------------------------------------------------------
// Test 5 — Malformed input
// ---------------------------------------------------------------------------

test('Malformed input shows terraform show -json message in all formats', () => {
  const tmpPlan = path.join(os.tmpdir(), 'malformed-plan.json');
  fs.writeFileSync(tmpPlan, '{}');

  const tmpDir = runReport(tmpPlan, '--format=all');

  const prContent = fs.readFileSync(path.join(tmpDir, 'pr-comment.html'), 'utf8');
  const summaryContent = fs.readFileSync(path.join(tmpDir, 'summary.html'), 'utf8');
  const artifactContent = fs.readFileSync(path.join(tmpDir, 'plan-report.html'), 'utf8');

  assert.ok(/terraform show -json/i.test(prContent), 'pr-comment should mention terraform show -json');
  assert.ok(/terraform show -json/i.test(summaryContent), 'summary should mention terraform show -json');
  assert.ok(/terraform show -json/i.test(artifactContent), 'artifact should mention terraform show -json');

  fs.rmSync(tmpDir, { recursive: true });
  fs.unlinkSync(tmpPlan);
});
