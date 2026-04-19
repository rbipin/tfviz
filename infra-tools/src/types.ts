// types.ts — Shared TypeScript interfaces and type aliases for the tf-report pipeline.
// All domain types are defined here to avoid circular imports across modules.

export type ActionType = 'create' | 'update' | 'destroy' | 'replace';
export type AttrAction = 'add' | 'remove' | 'update' | 'unchanged' | 'known_after_apply';
export type OutputFormat = 'all' | 'pr' | 'summary' | 'artifact';

export interface ActionColor {
  readonly bg: string;
  readonly text: string;
  readonly border: string;
}

export interface ResourceAttribute {
  readonly key: string;
  readonly attrAction: AttrAction;
  readonly prev: string | null;
  readonly next: string | null;
}

export interface ParsedResource {
  readonly address: string;
  readonly type: string;
  readonly name: string;
  readonly moduleAddress: string | null;
  readonly action: ActionType;
  readonly attrs: readonly ResourceAttribute[];
}

export interface ParsedPlan {
  readonly resources: readonly ParsedResource[];
  readonly error: string | null;
  readonly terraformVersion: string;
}

export interface CliArgs {
  readonly planFile: string;
  readonly outputDir: string;
  readonly format: OutputFormat;
}

// Raw Terraform JSON plan shape — only the fields we read.
export interface TerraformResourceChange {
  address: string;
  type: string;
  name: string;
  module_address?: string;
  change: {
    actions: string[];
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    after_unknown?: Record<string, unknown>;
  };
}

export interface TerraformPlan {
  format_version?: string;
  terraform_version?: string;
  resource_changes?: TerraformResourceChange[];
}
