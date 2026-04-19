// PlanParser.ts — Parses a raw Terraform JSON plan string into a typed ParsedPlan.
// Usage: new PlanParser().parse(planJsonString)

import type {
  ActionType,
  AttrAction,
  ParsedPlan,
  ParsedResource,
  ResourceAttribute,
  TerraformPlan,
  TerraformResourceChange,
} from './types';
import { HtmlUtils } from './HtmlUtils';

export class PlanParser {
  private static readonly PARSE_ERROR =
    'Unable to parse plan. Ensure you used terraform show -json.';

  /** Parse a Terraform JSON plan string and return a structured ParsedPlan. */
  parse(planJson: string): ParsedPlan {
    let plan: TerraformPlan;

    try {
      plan = JSON.parse(planJson) as TerraformPlan;
    } catch {
      return this.errorResult(PlanParser.PARSE_ERROR);
    }

    if (!plan.resource_changes) {
      return this.errorResult(PlanParser.PARSE_ERROR);
    }

    const resources = plan.resource_changes
      .map((rc) => this.parseResourceChange(rc))
      .filter((r): r is ParsedResource => r !== null);

    return {
      resources,
      error: null,
      terraformVersion: plan.terraform_version ?? 'unknown',
    };
  }

  private parseResourceChange(rc: TerraformResourceChange): ParsedResource | null {
    const actions = rc.change?.actions;
    if (!actions) return null;

    const action = this.resolveAction(actions);
    if (action === null) return null;

    const before = HtmlUtils.flatten(rc.change.before ?? {});
    const after = HtmlUtils.flatten(rc.change.after ?? {});
    const afterUnknown = HtmlUtils.flatten(rc.change.after_unknown ?? {});

    const attrs = this.buildAttributes(before, after, afterUnknown);

    return {
      address: rc.address,
      type: rc.type,
      name: rc.name,
      moduleAddress: rc.module_address ?? null,
      action,
      attrs,
    };
  }

  /**
   * Map a Terraform actions array to a typed ActionType.
   * Returns null for 'no-op' and any unknown combinations.
   */
  private resolveAction(actions: string[]): ActionType | null {
    const key = JSON.stringify(actions);
    if (key === '["no-op"]') return null;
    if (key === '["create"]') return 'create';
    if (key === '["delete"]') return 'destroy';
    if (key === '["update"]') return 'update';
    if (key === '["delete","create"]' || key === '["create","delete"]') return 'replace';
    return null;
  }

  /** Build the attribute diff list by comparing before/after/after_unknown maps. */
  private buildAttributes(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    afterUnknown: Record<string, unknown>,
  ): ResourceAttribute[] {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const attrs: ResourceAttribute[] = [];

    for (const key of allKeys) {
      const inBefore = Object.prototype.hasOwnProperty.call(before, key);
      const inAfter = Object.prototype.hasOwnProperty.call(after, key);
      const isKnownAfterApply = afterUnknown[key] === true;

      attrs.push(this.classifyAttribute(key, inBefore, inAfter, isKnownAfterApply, before, after));
    }

    // Pick up after_unknown keys not already covered by allKeys
    for (const [key, val] of Object.entries(afterUnknown)) {
      if (val === true && !allKeys.has(key)) {
        attrs.push({ key, attrAction: 'known_after_apply', prev: null, next: null });
      }
    }

    return attrs;
  }

  private classifyAttribute(
    key: string,
    inBefore: boolean,
    inAfter: boolean,
    isKnownAfterApply: boolean,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): ResourceAttribute {
    if (isKnownAfterApply) {
      return { key, attrAction: 'known_after_apply', prev: null, next: null };
    }

    const attrAction = this.resolveAttrAction(key, inBefore, inAfter, before, after);

    return {
      key,
      attrAction,
      prev: inBefore ? HtmlUtils.trunc(before[key]) : null,
      next: inAfter ? HtmlUtils.trunc(after[key]) : null,
    };
  }

  private resolveAttrAction(
    key: string,
    inBefore: boolean,
    inAfter: boolean,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): AttrAction {
    if (!inBefore && inAfter) return 'add';
    if (inBefore && !inAfter) return 'remove';

    // Both present — compare values
    const bv = JSON.stringify(before[key]);
    const av = JSON.stringify(after[key]);
    return bv !== av ? 'update' : 'unchanged';
  }

  private errorResult(error: string): ParsedPlan {
    return { resources: [], error, terraformVersion: 'unknown' };
  }
}
