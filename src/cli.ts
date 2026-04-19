#!/usr/bin/env node
// cli.ts — CLI entry point for tf-report. Parses arguments, reads the plan file,
// and orchestrates report generation via ReportGenerator.
// Usage: node tf-report.js <plan.json> <output-dir> [--format=all|pr|summary|artifact]
// Requires Node.js >= 18. No runtime npm dependencies — stdlib only.

import fs from 'node:fs';
import process from 'node:process';

import { PlanParser } from './PlanParser';
import { ArtifactBuilder, PrCommentBuilder, SummaryBuilder } from './ReportBuilder';
import { ReportWriter } from './ReportWriter';
import type { CliArgs, OutputFormat } from './types';

const VALID_FORMATS: readonly OutputFormat[] = ['all', 'pr', 'summary', 'artifact'];

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node tf-report.js <plan.json> <output-dir> [--format=all|pr|summary|artifact]');
    process.exit(1);
  }

  const planFile = args[0];
  const outputDir = args[1];
  const formatArg = args.find((a) => a.startsWith('--format='));
  const format: OutputFormat = formatArg
    ? (formatArg.split('=')[1] as OutputFormat)
    : 'all';

  if (!VALID_FORMATS.includes(format)) {
    console.error(`Unknown format: ${format}. Use all, pr, summary, or artifact.`);
    process.exit(1);
  }

  return { planFile, outputDir, format };
}

function readPlanFile(planFile: string): string {
  try {
    return fs.readFileSync(planFile, 'utf8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    console.error(`Cannot read plan file: ${planFile}: ${err.message}`);
    process.exit(1);
  }
}

function main(): void {
  const { planFile, outputDir, format } = parseArgs(process.argv);

  const planJson = readPlanFile(planFile);
  const parser = new PlanParser();
  const plan = parser.parse(planJson);

  const writer = new ReportWriter(outputDir);
  writer.ensureOutputDir();

  if (format === 'all' || format === 'pr') {
    const content = new PrCommentBuilder().build(plan);
    writer.write('pr-comment.html', content);
  }

  if (format === 'all' || format === 'summary') {
    const content = new SummaryBuilder().build(plan);
    writer.write('summary.html', content);
  }

  if (format === 'all' || format === 'artifact') {
    const content = new ArtifactBuilder().build(plan);
    writer.write('plan-report.html', content);
  }
}

main();
