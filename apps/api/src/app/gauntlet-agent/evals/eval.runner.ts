import { buildEvalCaseResult } from './eval.assertions';
import {
  EvalCase,
  EvalSuiteResult,
  EvalTarget,
  ObservedRun
} from './eval.schema';

export interface RunEvalSuiteOptions {
  consistencyRepeats?: number;
}

export function validateDatasetRequirements(dataset: EvalCase[]): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const byCategory = {
    happy_path: dataset.filter((item) => item.category === 'happy_path').length,
    edge_case: dataset.filter((item) => item.category === 'edge_case').length,
    adversarial: dataset.filter((item) => item.category === 'adversarial').length,
    multi_step: dataset.filter((item) => item.category === 'multi_step').length
  };

  if (dataset.length < 50) {
    issues.push(`Dataset contains ${dataset.length} cases; at least 50 required.`);
  }
  if (byCategory.happy_path < 20) {
    issues.push(`happy_path count is ${byCategory.happy_path}; at least 20 required.`);
  }
  if (byCategory.edge_case < 10) {
    issues.push(`edge_case count is ${byCategory.edge_case}; at least 10 required.`);
  }
  if (byCategory.adversarial < 10) {
    issues.push(`adversarial count is ${byCategory.adversarial}; at least 10 required.`);
  }
  if (byCategory.multi_step < 10) {
    issues.push(`multi_step count is ${byCategory.multi_step}; at least 10 required.`);
  }

  for (const testCase of dataset) {
    const hasQueryField = typeof testCase.input?.query === 'string';
    const isIntentionallyBlankEdgeCase =
      testCase.category === 'edge_case' && (testCase.input?.query ?? '').trim().length === 0;
    if (!hasQueryField || (!isIntentionallyBlankEdgeCase && !testCase.input.query.trim())) {
      issues.push(`${testCase.id}: missing input query.`);
    }
    if (!Array.isArray(testCase.expectedToolCalls)) {
      issues.push(`${testCase.id}: expectedToolCalls must be an array.`);
    }
    if (!testCase.expectedOutput) {
      issues.push(`${testCase.id}: missing expectedOutput.`);
    }
    if (!Array.isArray(testCase.passFailCriteria) || testCase.passFailCriteria.length === 0) {
      issues.push(`${testCase.id}: passFailCriteria must have at least one item.`);
    }
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

async function executeWithRepeats({
  target,
  testCase,
  repeats
}: {
  target: EvalTarget;
  testCase: EvalCase;
  repeats: number;
}): Promise<ObservedRun[]> {
  const runs: ObservedRun[] = [];
  for (let index = 0; index < repeats; index++) {
    runs.push(await target.execute(testCase.input));
  }
  return runs;
}

export async function runEvalSuite({
  dataset,
  target,
  options
}: {
  dataset: EvalCase[];
  target: EvalTarget;
  options?: RunEvalSuiteOptions;
}): Promise<EvalSuiteResult> {
  const repeats = Math.max(1, options?.consistencyRepeats ?? 1);
  const results = [];

  for (const testCase of dataset) {
    const observedRuns = await executeWithRepeats({
      target,
      testCase,
      repeats: testCase.id === 'MS10' ? Math.max(3, repeats) : repeats
    });
    results.push(
      buildEvalCaseResult({
        testCase,
        observedRuns
      })
    );
  }

  const passed = results.filter((result) => result.passed).length;
  const byCategory: EvalSuiteResult['byCategory'] = {
    happy_path: { total: 0, passed: 0 },
    edge_case: { total: 0, passed: 0 },
    adversarial: { total: 0, passed: 0 },
    multi_step: { total: 0, passed: 0 }
  };

  for (const result of results) {
    byCategory[result.category].total += 1;
    if (result.passed) {
      byCategory[result.category].passed += 1;
    }
  }

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    byCategory,
    results
  };
}
