import type { Rule, RuleDefinition } from "../types.js";

export interface Strategy {
  id: string;
  defaults(): RuleDefinition;
  create(def: RuleDefinition): Rule;
}
