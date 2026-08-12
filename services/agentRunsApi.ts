export type AgentCapability = {
  provider: 'deepseek';
  configured: boolean;
  model: string;
  tools: string[];
  message: string;
};

export type AgentStep = {
  sequence: number;
  name: string;
  status: string;
  summary: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type AgentToolCall = {
  sequence: number;
  callId: string;
  toolName: string;
  status: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
  durationMs: number;
  errorMessage: string | null;
  createdAt: string;
};

export type AgentModelCall = {
  sequence: number;
  provider: string;
  model: string;
  status: string;
  inputMessages: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  finishReason: string | null;
  outputSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type AgentRunSummary = {
  runId: string;
  status: string;
  provider: string;
  model: string;
  userPrompt: string;
  symbol: string | null;
  currentStep: string;
  finalOutput: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  stepCount: number;
  toolCallCount: number;
  modelCallCount: number;
};

export type AgentRunDetail = AgentRunSummary & {
  steps: AgentStep[];
  toolCalls: AgentToolCall[];
  modelCalls: AgentModelCall[];
};

type Envelope<Data> = {
  success: boolean;
  data: Data | null;
  error: { message: string } | null;
};

const request = async <Data>(path: string, options?: RequestInit): Promise<Data> => {
  let response: Response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error('Agent API 暂时无法连接，请检查后端服务。');
  }

  const raw = await response.text();
  let payload: Envelope<Data> | null = null;
  try {
    payload = raw ? JSON.parse(raw) as Envelope<Data> : null;
  } catch {
    payload = null;
  }

  if (!payload) {
    throw new Error(response.ok
      ? 'Agent API 返回了无法解析的响应。'
      : `Agent API 暂时不可用（HTTP ${response.status}）。`);
  }
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || `Request failed with status ${response.status}`);
  }
  return payload.data;
};

const mapSummary = (run: any): AgentRunSummary => ({
  runId: run.run_id,
  status: run.status,
  provider: run.provider,
  model: run.model,
  userPrompt: run.user_prompt,
  symbol: run.symbol,
  currentStep: run.current_step,
  finalOutput: run.final_output,
  errorMessage: run.error_message,
  createdAt: run.created_at,
  completedAt: run.completed_at,
  stepCount: run.step_count,
  toolCallCount: run.tool_call_count,
  modelCallCount: run.model_call_count,
});

const mapDetail = (run: any): AgentRunDetail => ({
  ...mapSummary(run),
  steps: run.steps.map((item: any) => ({
    sequence: item.sequence,
    name: item.name,
    status: item.status,
    summary: item.summary,
    startedAt: item.started_at,
    completedAt: item.completed_at,
  })),
  toolCalls: run.tool_calls.map((item: any) => ({
    sequence: item.sequence,
    callId: item.call_id,
    toolName: item.tool_name,
    status: item.status,
    arguments: item.arguments,
    result: item.result,
    durationMs: item.duration_ms,
    errorMessage: item.error_message,
    createdAt: item.created_at,
  })),
  modelCalls: run.model_calls.map((item: any) => ({
    sequence: item.sequence,
    provider: item.provider,
    model: item.model,
    status: item.status,
    inputMessages: item.input_messages,
    inputTokens: item.input_tokens,
    outputTokens: item.output_tokens,
    durationMs: item.duration_ms,
    finishReason: item.finish_reason,
    outputSummary: item.output_summary,
    errorMessage: item.error_message,
    createdAt: item.created_at,
  })),
});

export const getAgentCapability = () =>
  request<AgentCapability>('/api/v1/agent-runs/capabilities');

export const getAgentRuns = async (limit = 20) => {
  const result = await request<{ runs: any[] }>(`/api/v1/agent-runs?limit=${limit}`);
  return result.runs.map(mapSummary);
};

export const getAgentRun = async (runId: string) =>
  mapDetail(await request<any>(`/api/v1/agent-runs/${runId}`));

export const createAgentRun = async (prompt: string) =>
  mapDetail(await request<any>('/api/v1/agent-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      data: {
        mode: 'real',
        provider: 'twelvedata',
        adjustment: 'all',
        benchmark_symbol: 'SPY',
        start_date: new Date(new Date().setFullYear(new Date().getFullYear() - 5)).toISOString().slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
        refresh: false,
      },
    }),
  }));
