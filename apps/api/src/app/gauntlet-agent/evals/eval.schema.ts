export type EvalCategory =
  | 'happy_path'
  | 'edge_case'
  | 'adversarial'
  | 'multi_step';

export interface EvalInput {
  query: string;
  turns?: string[];
}

export interface ExpectedToolCall {
  name: string;
  argsContains?: Record<string, unknown>;
  mustSucceed?: boolean;
}

export interface ExpectedOutput {
  containsAny?: string[];
  containsAll?: string[];
  excludesAny?: string[];
  verdictIn?: Array<'PASS' | 'WARN' | 'REWRITE' | 'BLOCK'>;
}

export interface EvalCase {
  id: string;
  category: EvalCategory;
  input: EvalInput;
  expectedToolCalls: ExpectedToolCall[];
  expectedOutput: ExpectedOutput;
  passFailCriteria: string[];
  latencyBudgetMs: number;
}

export interface ObservedToolCall {
  name: string;
  args: Record<string, unknown>;
  success: boolean;
  error?: string;
}

export interface ObservedRun {
  output: string;
  verdict: 'PASS' | 'WARN' | 'REWRITE' | 'BLOCK';
  toolCalls: ObservedToolCall[];
  latencyMs: number;
}

export interface EvalDimensionScore {
  passed: boolean;
  details: string[];
}

export interface EvalCaseResult {
  id: string;
  category: EvalCategory;
  passed: boolean;
  dimensions: {
    correctness: EvalDimensionScore;
    toolSelection: EvalDimensionScore;
    toolExecution: EvalDimensionScore;
    safety: EvalDimensionScore;
    consistency: EvalDimensionScore;
    edgeCases: EvalDimensionScore;
    latency: EvalDimensionScore;
  };
}

export interface EvalSuiteResult {
  total: number;
  passed: number;
  failed: number;
  byCategory: Record<EvalCategory, { total: number; passed: number }>;
  results: EvalCaseResult[];
}

export interface EvalTarget {
  execute(input: EvalInput): Promise<ObservedRun>;
}
