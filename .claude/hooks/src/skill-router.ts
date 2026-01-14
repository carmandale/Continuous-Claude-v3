/**
 * Skill Router helpers (Phase 2-6)
 *
 * Minimal implementation to support prerequisite resolution, co-activation,
 * loading mode, and enhanced lookup results.
 */

import { join } from 'path';
import type { SkillRulesConfig, SkillLookupResult } from './shared/skill-router-types.js';
import { CircularDependencyError } from './shared/skill-router-types.js';

type SkillRuleMatch = {
  skillName: string;
  source: SkillLookupResult['source'];
  priorityValue: number;
};

export function topologicalSort(skillName: string, rules: SkillRulesConfig): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const inProgress = new Set<string>();

  function visit(name: string, path: string[] = []): void {
    if (inProgress.has(name)) {
      throw new CircularDependencyError([...path, name]);
    }
    if (visited.has(name)) return;

    inProgress.add(name);

    const rule = rules.skills?.[name];
    const deps = [
      ...(rule?.prerequisites?.require || []),
      ...(rule?.prerequisites?.suggest || []),
    ];

    for (const dep of deps) {
      visit(dep, [...path, name]);
    }

    inProgress.delete(name);
    visited.add(name);
    result.push(name);
  }

  visit(skillName);
  return result;
}

export function detectCircularDependency(
  skillName: string,
  rules: SkillRulesConfig,
  visited: Set<string> = new Set(),
  stack: Set<string> = new Set(),
  path: string[] = []
): string[] | null {
  if (stack.has(skillName)) {
    return [...path, skillName];
  }

  if (visited.has(skillName)) {
    return null;
  }

  visited.add(skillName);
  stack.add(skillName);
  path.push(skillName);

  const rule = rules.skills?.[skillName];
  const deps = [
    ...(rule?.prerequisites?.require || []),
    ...(rule?.prerequisites?.suggest || []),
  ];

  for (const dep of deps) {
    const cycle = detectCircularDependency(dep, rules, visited, stack, [...path]);
    if (cycle) return cycle;
  }

  stack.delete(skillName);
  return null;
}

export function resolvePrerequisites(
  skillName: string,
  rules: SkillRulesConfig
): { suggest: string[]; require: string[]; loadOrder: string[] } {
  const rule = rules.skills?.[skillName];
  if (!rule?.prerequisites) {
    return { suggest: [], require: [], loadOrder: [skillName] };
  }

  const cycle = detectCircularDependency(skillName, rules);
  if (cycle) {
    throw new CircularDependencyError(cycle);
  }

  const loadOrder = topologicalSort(skillName, rules);
  return {
    suggest: rule.prerequisites.suggest || [],
    require: rule.prerequisites.require || [],
    loadOrder,
  };
}

export function resolveCoActivation(
  skillName: string,
  rules: SkillRulesConfig
): { peers: string[]; mode: 'all' | 'any' } {
  const rule = rules.skills?.[skillName];
  if (!rule?.coActivate) {
    return { peers: [], mode: 'any' };
  }

  const peers = rule.coActivate.filter((peer) => peer !== skillName);

  for (const peer of peers) {
    if (!rules.skills?.[peer]) {
      console.warn(`Co-activation peer "${peer}" not found in skill rules`);
    }
  }

  return {
    peers,
    mode: rule.coActivateMode || 'any',
  };
}

export function getLoadingMode(
  skillName: string,
  rules: SkillRulesConfig
): 'lazy' | 'eager' | 'eager-prerequisites' {
  const rule = rules.skills?.[skillName];
  const loading = rule?.loading;

  if (!loading) return 'lazy';

  if (loading === 'lazy' || loading === 'eager' || loading === 'eager-prerequisites') {
    return loading;
  }

  console.warn(`Invalid loading mode "${loading}" for skill "${skillName}", defaulting to lazy`);
  return 'lazy';
}

export function buildEnhancedLookupResult(
  match: SkillRuleMatch,
  rules: SkillRulesConfig
): SkillLookupResult {
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const result: SkillLookupResult = {
    found: true,
    skillName: match.skillName,
    skillPath: join(projectDir, '.claude', 'skills', match.skillName, 'SKILL.md'),
    confidence: match.priorityValue / 4,
    source: match.source,
  };

  try {
    result.prerequisites = resolvePrerequisites(match.skillName, rules);
  } catch (error) {
    if (error instanceof CircularDependencyError) {
      console.error(`Circular dependency in ${match.skillName}: ${error.message}`);
      result.prerequisites = { suggest: [], require: [], loadOrder: [match.skillName] };
    } else {
      throw error;
    }
  }

  result.coActivation = resolveCoActivation(match.skillName, rules);
  result.loading = getLoadingMode(match.skillName, rules);

  return result;
}
