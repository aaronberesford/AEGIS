import "server-only";

import * as demoStore from "@/lib/demo-store";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  type AgentResult,
  type Approval,
  type Activity,
  type AuditLog,
  type Automation,
  type Conversation,
  type IntegrationSetting,
  type Lead,
  type Message,
  type ScheduledJob,
  type Snapshot,
  type TaskItem,
  type ToolCall,
  type Workspace,
} from "@/lib/types";

function ensure<T>(value: T | null | undefined, message: string, code: string) {
  if (!value) {
    throw new AppError(message, { code, status: 404 });
  }
  return value;
}

function mapWorkspace(row: Record<string, unknown>): Workspace {
  const openAiSettings = (row.openai_settings as Record<string, unknown> | null) ?? {};
  const crmSettings = (row.crm_settings as Record<string, unknown> | null) ?? {};
  const emailSettings = (row.email_settings as Record<string, unknown> | null) ?? {};
  const websiteSettings = (row.website_settings as Record<string, unknown> | null) ?? {};
  const businessHours = (row.business_hours as Record<string, unknown> | null) ?? {};
  const approvalRules = (row.approval_rules as Record<string, unknown> | null) ?? {};
  const voiceSettings = (row.voice_settings as Record<string, unknown> | null) ?? {};

  return {
    id: String(row.id),
    name: String(row.name),
    industry: String(row.industry),
    toneOfVoice: String(row.tone_of_voice),
    services: Array.isArray(row.services) ? row.services.map(String) : [],
    targetCustomers: Array.isArray(row.target_customers)
      ? row.target_customers.map(String)
      : [],
    twilioNumber: String(row.twilio_number ?? ""),
    openAiModel: String(openAiSettings.model ?? "gpt-4.1-mini"),
    crmProvider: String(crmSettings.provider ?? "AEGIS CRM"),
    emailProvider: String(emailSettings.provider ?? "Connector placeholder"),
    websiteProvider: String(websiteSettings.provider ?? "Website placeholder"),
    businessHours: String(businessHours.label ?? "Business hours not set"),
    approvalPolicy: String(approvalRules.label ?? "Approval rules not set"),
    voice: {
      name: String(voiceSettings.voice ?? voiceSettings.name ?? "alloy"),
      speed: Number(voiceSettings.speed ?? 1),
      style: String(voiceSettings.style ?? "Clear and sales-focused"),
    },
  };
}

function mapApproval(row: Record<string, unknown>): Approval {
  const payload = (row.payload as Record<string, unknown> | null) ?? {};
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    type: String(row.action_type) as Approval["type"],
    title: String(payload.title ?? "Approval"),
    recipient: String(row.recipient ?? payload.recipient ?? ""),
    message: String(payload.message ?? ""),
    reason: String(row.reason ?? ""),
    risk: String(row.risk_level ?? "medium") as Approval["risk"],
    status: String(row.status ?? "pending") as Approval["status"],
    scheduledFor: String(payload.scheduledFor ?? "Awaiting approval"),
    metadata:
      payload.metadata && typeof payload.metadata === "object"
        ? (payload.metadata as Record<string, string>)
        : undefined,
    lastError: row.last_error ? String(row.last_error) : undefined,
  };
}

function mapConversation(
  row: Record<string, unknown>,
  messages: Message[],
): Conversation {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    title: String(row.title ?? "Conversation"),
    messages,
  };
}

function mapAuditLog(row: Record<string, unknown>): AuditLog {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id ?? "user_alex"),
    action: String(row.action),
    input: JSON.stringify(row.input ?? {}),
    output: JSON.stringify(row.output ?? {}),
    approvalStatus: String(row.approval_status ?? "not_required"),
    timestamp: String(row.created_at ?? new Date().toISOString()),
    error: row.error ? String(row.error) : undefined,
  };
}

function mapToolCall(row: Record<string, unknown>): ToolCall {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    tool: String(row.tool_name),
    status: String(row.status) as ToolCall["status"],
    input: JSON.stringify(row.input ?? {}),
    output: JSON.stringify(row.output ?? {}),
    timestamp: String(row.created_at ?? new Date().toISOString()),
    error: row.error ? String(row.error) : undefined,
  };
}

function mapIntegration(row: Record<string, unknown>): IntegrationSetting {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    provider: String(row.provider),
    kind: String(row.kind),
    status: String(row.status),
    config:
      row.config && typeof row.config === "object"
        ? (row.config as Record<string, string | number | boolean | null>)
        : {},
  };
}

function mapScheduledJob(row: Record<string, unknown>): ScheduledJob {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    schedule: String(row.schedule),
    taskType: String(row.task_type),
    enabled: Boolean(row.enabled),
  };
}

function deriveActivities(
  toolCalls: ToolCall[],
  approvals: Approval[],
  auditLogs: AuditLog[],
): Activity[] {
  const fromTools = toolCalls.slice(0, 6).map((toolCall) => ({
    id: `activity_tool_${toolCall.id}`,
    workspaceId: toolCall.workspaceId,
    icon:
      toolCall.tool === "place_call"
        ? "phone"
        : toolCall.tool === "send_sms"
          ? "message"
          : "spark",
    title:
      toolCall.tool === "place_call"
        ? "Outbound call queued"
        : toolCall.tool === "send_sms"
          ? "SMS queued"
          : toolCall.tool,
    subtitle: toolCall.status === "success" ? "Completed" : toolCall.error ?? "Failed",
    timeLabel: new Date(toolCall.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  const fromApprovals = approvals
    .filter((approval) => approval.status !== "pending")
    .slice(0, 4)
    .map((approval) => ({
      id: `activity_approval_${approval.id}`,
      workspaceId: approval.workspaceId,
      icon: approval.type === "make_call" ? "phone" : "spark",
      title:
        approval.status === "approved"
          ? `${approval.title} approved`
          : `${approval.title} cancelled`,
      subtitle: approval.recipient,
      timeLabel: "Recent",
    }));

  const fromAudit = auditLogs.slice(0, 4).map((entry) => ({
    id: `activity_audit_${entry.id}`,
    workspaceId: entry.workspaceId,
    icon: "spark" as const,
    title: entry.action.replaceAll("_", " "),
    subtitle: entry.output,
    timeLabel: new Date(entry.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  return [...fromTools, ...fromApprovals, ...fromAudit].slice(0, 8) as Activity[];
}

async function requireSupabaseSnapshot(currentWorkspaceId?: string): Promise<Snapshot> {
  const supabase = getSupabaseAdmin();

  const [
    userResponse,
    workspaceResponse,
    approvalResponse,
    conversationResponse,
    messageResponse,
    auditLogResponse,
    toolCallResponse,
    integrationResponse,
    cronResponse,
    leadResponse,
    contactResponse,
    taskResponse,
    automationResponse,
  ] = await Promise.all([
    supabase.from("users").select("*").order("created_at", { ascending: true }).limit(1),
    supabase.from("workspaces").select("*").order("created_at", { ascending: true }),
    supabase.from("approvals").select("*").order("created_at", { ascending: false }),
    supabase.from("conversations").select("*").order("created_at", { ascending: false }),
    supabase.from("messages").select("*").order("created_at", { ascending: true }),
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("tool_calls").select("*").order("created_at", { ascending: false }).limit(25),
    supabase.from("integrations").select("*").order("created_at", { ascending: true }),
    supabase.from("cron_jobs").select("*").order("created_at", { ascending: false }),
    supabase.from("leads").select("*").order("created_at", { ascending: false }),
    supabase.from("contacts").select("*").order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").order("created_at", { ascending: false }),
    supabase.from("automations").select("*").order("created_at", { ascending: false }),
  ]);

  const errors = [
    userResponse.error,
    workspaceResponse.error,
    approvalResponse.error,
    conversationResponse.error,
    messageResponse.error,
    auditLogResponse.error,
    toolCallResponse.error,
    integrationResponse.error,
    cronResponse.error,
    leadResponse.error,
    contactResponse.error,
    taskResponse.error,
    automationResponse.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new AppError(
      `Supabase query failed: ${errors[0]?.message ?? "Unknown database error."}`,
      {
        code: "SUPABASE_QUERY_FAILED",
        status: 500,
      },
    );
  }

  const workspaces = (workspaceResponse.data ?? []).map((row) =>
    mapWorkspace(row as Record<string, unknown>),
  );
  const selectedWorkspaceId =
    currentWorkspaceId && workspaces.some((workspace) => workspace.id === currentWorkspaceId)
      ? currentWorkspaceId
      : workspaces[0]?.id ?? "";

  const approvals = (approvalResponse.data ?? []).map((row) =>
    mapApproval(row as Record<string, unknown>),
  );

  const messagesByConversation = new Map<string, Message[]>();
  for (const row of messageResponse.data ?? []) {
    const conversationId = String((row as Record<string, unknown>).conversation_id);
    const existing = messagesByConversation.get(conversationId) ?? [];
    existing.push({
      id: String((row as Record<string, unknown>).id),
      role: String((row as Record<string, unknown>).role) as Message["role"],
      content: String((row as Record<string, unknown>).content ?? ""),
      timestamp: new Date(
        String((row as Record<string, unknown>).created_at ?? new Date().toISOString()),
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    messagesByConversation.set(conversationId, existing);
  }

  const conversations = (conversationResponse.data ?? []).map((row) =>
    mapConversation(
      row as Record<string, unknown>,
      messagesByConversation.get(String((row as Record<string, unknown>).id)) ?? [],
    ),
  );

  const auditLogs = (auditLogResponse.data ?? []).map((row) =>
    mapAuditLog(row as Record<string, unknown>),
  );
  const toolCalls = (toolCallResponse.data ?? []).map((row) =>
    mapToolCall(row as Record<string, unknown>),
  );
  const integrationSettings = (integrationResponse.data ?? []).map((row) =>
    mapIntegration(row as Record<string, unknown>),
  );
  const scheduledJobs = (cronResponse.data ?? []).map((row) =>
    mapScheduledJob(row as Record<string, unknown>),
  );

  const contactsById = new Map<string, Record<string, unknown>>();
  for (const row of contactResponse.data ?? []) {
    contactsById.set(String((row as Record<string, unknown>).id), row as Record<string, unknown>);
  }

  const leads: Lead[] = (leadResponse.data ?? []).map((row) => {
    const leadRow = row as Record<string, unknown>;
    const contact = contactsById.get(String(leadRow.contact_id ?? ""));
    return {
      id: String(leadRow.id),
      workspaceId: String(leadRow.workspace_id),
      name: String(contact?.full_name ?? "Lead"),
      company: "Unassigned",
      phone: String(contact?.phone ?? ""),
      email: String(contact?.email ?? ""),
      stage: String(leadRow.status ?? "New lead"),
      lastTouch: "Recent",
      optOut: Boolean(contact?.opt_out ?? false),
    };
  });

  const tasks: TaskItem[] = (taskResponse.data ?? []).map((row) => {
    const taskRow = row as Record<string, unknown>;
    return {
      id: String(taskRow.id),
      workspaceId: String(taskRow.workspace_id),
      title: String(taskRow.title),
      dueLabel: String(taskRow.display_due_label ?? taskRow.due_at ?? "Scheduled"),
      status:
        String(taskRow.status) === "done"
          ? "done"
          : String(taskRow.status) === "blocked"
            ? "blocked"
            : "scheduled",
    };
  });

  const automations: Automation[] = (automationResponse.data ?? []).map((row) => {
    const automationRow = row as Record<string, unknown>;
    return {
      id: String(automationRow.id),
      workspaceId: String(automationRow.workspace_id),
      name: String(automationRow.name),
      trigger: String(automationRow.trigger_type),
      actions: Array.isArray(automationRow.actions)
        ? automationRow.actions.map(String)
        : [],
      enabled: Boolean(automationRow.enabled),
      status: Boolean(automationRow.enabled) ? "active" : "draft",
    };
  });

  const activities = deriveActivities(toolCalls, approvals, auditLogs);
  const userRow = (userResponse.data ?? [])[0] as Record<string, unknown> | undefined;

  return {
    user: {
      id: String(userRow?.id ?? "user_alex"),
      name: String(userRow?.full_name ?? "Alex"),
      avatar: String(userRow?.full_name ?? "A").slice(0, 1).toUpperCase(),
    },
    currentWorkspaceId: selectedWorkspaceId,
    workspaces,
    approvals,
    activities,
    tasks,
    leads,
    automations,
    conversations,
    auditLogs,
    toolCalls,
    integrationSettings,
    scheduledJobs,
  };
}

async function getLatestConversationId(workspaceId: string) {
  const supabase = getSupabaseAdmin();
  const existing = await supabase
    .from("conversations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new AppError(`Unable to load conversation: ${existing.error.message}`, {
      code: "SUPABASE_CONVERSATION_READ_FAILED",
      status: 500,
    });
  }

  if (existing.data?.id) {
    return String(existing.data.id);
  }

  const created = await supabase
    .from("conversations")
    .insert({
      workspace_id: workspaceId,
      title: "Daily command feed",
    })
    .select("id")
    .single();

  if (created.error || !created.data?.id) {
    throw new AppError(
      `Unable to create conversation: ${created.error?.message ?? "Unknown error"}`,
      {
        code: "SUPABASE_CONVERSATION_CREATE_FAILED",
        status: 500,
      },
    );
  }

  return String(created.data.id);
}

export async function getSnapshot(currentWorkspaceId?: string) {
  if (env().demoMode) {
    return demoStore.getSnapshot(currentWorkspaceId);
  }

  return requireSupabaseSnapshot(currentWorkspaceId);
}

export async function workspaceById(workspaceId: string) {
  if (env().demoMode) {
    return demoStore.workspaceById(workspaceId) ?? null;
  }

  const snapshot = await getSnapshot(workspaceId);
  return (
    snapshot.workspaces.find((workspace) => workspace.id === workspaceId) ?? null
  );
}

export async function findPrimaryLeadForWorkspace(workspaceId: string) {
  if (env().demoMode) {
    return (
      demoStore
        .getSnapshot(workspaceId)
        .leads.find((lead) => lead.workspaceId === workspaceId && !lead.optOut) ?? null
    );
  }

  const snapshot = await getSnapshot(workspaceId);
  return (
    snapshot.leads.find((lead) => lead.workspaceId === workspaceId && !lead.optOut) ?? null
  );
}

export async function appendConversationTurn(
  workspaceId: string,
  message: Message,
  response: Message,
) {
  if (env().demoMode) {
    return demoStore.appendConversationMessage(workspaceId, message, response);
  }

  const supabase = getSupabaseAdmin();
  const conversationId = await getLatestConversationId(workspaceId);
  const inserted = await supabase.from("messages").insert([
    {
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
    },
    {
      conversation_id: conversationId,
      role: response.role,
      content: response.content,
    },
  ]);

  if (inserted.error) {
    throw new AppError(`Unable to save messages: ${inserted.error.message}`, {
      code: "SUPABASE_MESSAGE_INSERT_FAILED",
      status: 500,
    });
  }
}

export async function previewAgentAction(result: AgentResult) {
  if (env().demoMode) {
    return demoStore.previewAgentAction(result);
  }

  const supabase = getSupabaseAdmin();

  if (result.pendingApproval) {
    const approval = result.pendingApproval;
    const inserted = await supabase.from("approvals").insert({
      id: approval.id,
      workspace_id: approval.workspaceId,
      action_type: approval.type,
      recipient: approval.recipient,
      payload: {
        title: approval.title,
        message: approval.message,
        metadata: approval.metadata ?? {},
        scheduledFor: approval.scheduledFor,
      },
      reason: approval.reason,
      risk_level: approval.risk,
      status: approval.status,
      last_error: approval.lastError ?? null,
    });

    if (inserted.error) {
      throw new AppError(`Unable to save approval: ${inserted.error.message}`, {
        code: "SUPABASE_APPROVAL_INSERT_FAILED",
        status: 500,
      });
    }
  }

  if (result.draftAutomation) {
    const automation = result.draftAutomation;
    const inserted = await supabase.from("automations").insert({
      id: automation.id,
      workspace_id: automation.workspaceId,
      name: automation.name,
      trigger_type: automation.trigger,
      trigger_config: {},
      actions: automation.actions,
      enabled: automation.enabled,
    });

    if (inserted.error) {
      throw new AppError(
        `Unable to save automation draft: ${inserted.error.message}`,
        {
          code: "SUPABASE_AUTOMATION_INSERT_FAILED",
          status: 500,
        },
      );
    }
  }
}

export async function addAuditLog(entry: Omit<AuditLog, "id" | "timestamp">) {
  if (env().demoMode) {
    demoStore.addAuditLog(entry);
    return;
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase.from("audit_logs").insert({
    workspace_id: entry.workspaceId,
    user_id: entry.userId,
    action: entry.action,
    input: { value: entry.input },
    output: { value: entry.output },
    approval_status: entry.approvalStatus,
    error: entry.error ?? null,
  });

  if (inserted.error) {
    throw new AppError(`Unable to save audit log: ${inserted.error.message}`, {
      code: "SUPABASE_AUDIT_INSERT_FAILED",
      status: 500,
    });
  }
}

export async function addToolCall(entry: Omit<ToolCall, "id" | "timestamp">) {
  if (env().demoMode) {
    demoStore.addToolCall(entry);
    return;
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase.from("tool_calls").insert({
    workspace_id: entry.workspaceId,
    tool_name: entry.tool,
    status: entry.status,
    input: { value: entry.input },
    output: { value: entry.output },
    error: entry.error ?? null,
  });

  if (inserted.error) {
    throw new AppError(`Unable to save tool call: ${inserted.error.message}`, {
      code: "SUPABASE_TOOL_CALL_INSERT_FAILED",
      status: 500,
    });
  }
}

export async function getApproval(approvalId: string) {
  if (env().demoMode) {
    return demoStore.getApproval(approvalId);
  }

  const supabase = getSupabaseAdmin();
  const response = await supabase
    .from("approvals")
    .select("*")
    .eq("id", approvalId)
    .maybeSingle();

  if (response.error) {
    throw new AppError(`Unable to read approval: ${response.error.message}`, {
      code: "SUPABASE_APPROVAL_READ_FAILED",
      status: 500,
    });
  }

  return response.data ? mapApproval(response.data as Record<string, unknown>) : null;
}

export async function updateApproval(
  approvalId: string,
  updates: Partial<Pick<Approval, "recipient" | "message" | "reason" | "metadata">>,
) {
  if (env().demoMode) {
    return demoStore.updateApproval(approvalId, updates);
  }

  const current = ensure(
    await getApproval(approvalId),
    "Approval not found.",
    "APPROVAL_NOT_FOUND",
  );
  const supabase = getSupabaseAdmin();
  const response = await supabase
    .from("approvals")
    .update({
      recipient: updates.recipient ?? current.recipient,
      reason: updates.reason ?? current.reason,
      payload: {
        title: current.title,
        message: updates.message ?? current.message,
        metadata: updates.metadata ?? current.metadata ?? {},
        scheduledFor: current.scheduledFor,
      },
      last_error: null,
    })
    .eq("id", approvalId)
    .select("*")
    .single();

  if (response.error) {
    throw new AppError(`Unable to update approval: ${response.error.message}`, {
      code: "SUPABASE_APPROVAL_UPDATE_FAILED",
      status: 500,
    });
  }

  return mapApproval(response.data as Record<string, unknown>);
}

export async function resolveApproval(
  approvalId: string,
  decision: "approved" | "cancelled",
) {
  if (env().demoMode) {
    return demoStore.resolveApproval(approvalId, decision);
  }

  const supabase = getSupabaseAdmin();
  const response = await supabase
    .from("approvals")
    .update({ status: decision, last_error: null })
    .eq("id", approvalId)
    .select("*")
    .single();

  if (response.error) {
    throw new AppError(`Unable to resolve approval: ${response.error.message}`, {
      code: "SUPABASE_APPROVAL_RESOLVE_FAILED",
      status: 500,
    });
  }

  return mapApproval(response.data as Record<string, unknown>);
}

export async function markApprovalError(approvalId: string, message: string) {
  if (env().demoMode) {
    return demoStore.markApprovalError(approvalId, message);
  }

  const supabase = getSupabaseAdmin();
  const response = await supabase
    .from("approvals")
    .update({ last_error: message })
    .eq("id", approvalId)
    .select("*")
    .single();

  if (response.error) {
    throw new AppError(`Unable to mark approval error: ${response.error.message}`, {
      code: "SUPABASE_APPROVAL_ERROR_FAILED",
      status: 500,
    });
  }

  return mapApproval(response.data as Record<string, unknown>);
}

export async function createScheduledTaskDraft(
  workspaceId: string,
  title: string,
  dueLabel: string,
) {
  if (env().demoMode) {
    const task = demoStore.createGeneratedTask(workspaceId, title, dueLabel, "scheduled");
    demoStore.addTask(task);
    return task;
  }

  const supabase = getSupabaseAdmin();
  const taskId = crypto.randomUUID();
  const [taskInsert, cronInsert] = await Promise.all([
    supabase.from("tasks").insert({
      id: taskId,
      workspace_id: workspaceId,
      title,
      due_at: null,
      display_due_label: dueLabel,
      status: "scheduled",
    }),
    supabase.from("cron_jobs").insert({
      workspace_id: workspaceId,
      name: title,
      schedule: dueLabel,
      task_type: "scheduled_task_placeholder",
      payload: {},
      enabled: false,
    }),
  ]);

  if (taskInsert.error) {
    throw new AppError(`Unable to create task draft: ${taskInsert.error.message}`, {
      code: "SUPABASE_TASK_INSERT_FAILED",
      status: 500,
    });
  }

  if (cronInsert.error) {
    throw new AppError(
      `Unable to create scheduled job placeholder: ${cronInsert.error.message}`,
      {
        code: "SUPABASE_CRON_INSERT_FAILED",
        status: 500,
      },
    );
  }

  return {
    id: taskId,
    workspaceId,
    title,
    dueLabel,
    status: "scheduled",
  } satisfies TaskItem;
}

export async function upsertIntegrationSetting(input: {
  workspaceId: string;
  provider: string;
  kind: string;
  status: string;
  config?: Record<string, string | number | boolean | null>;
}) {
  if (env().demoMode) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const existing = await supabase
    .from("integrations")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("provider", input.provider)
    .eq("kind", input.kind)
    .maybeSingle();

  if (existing.error) {
    throw new AppError(
      `Unable to read integration setting: ${existing.error.message}`,
      {
        code: "SUPABASE_INTEGRATION_READ_FAILED",
        status: 500,
      },
    );
  }

  if (existing.data?.id) {
    const update = await supabase
      .from("integrations")
      .update({
        status: input.status,
        config: input.config ?? {},
      })
      .eq("id", existing.data.id);

    if (update.error) {
      throw new AppError(
        `Unable to update integration setting: ${update.error.message}`,
        {
          code: "SUPABASE_INTEGRATION_UPDATE_FAILED",
          status: 500,
        },
      );
    }

    return;
  }

  const insert = await supabase.from("integrations").insert({
    workspace_id: input.workspaceId,
    provider: input.provider,
    kind: input.kind,
    status: input.status,
    config: input.config ?? {},
  });

  if (insert.error) {
    throw new AppError(
      `Unable to insert integration setting: ${insert.error.message}`,
      {
        code: "SUPABASE_INTEGRATION_INSERT_FAILED",
        status: 500,
      },
    );
  }
}

export function createGeneratedApproval(
  workspaceId: string,
  title: string,
  recipient: string,
  message: string,
  reason: string,
  risk: Approval["risk"],
  type: Approval["type"],
  metadata?: Record<string, string>,
) {
  return demoStore.createGeneratedApproval(
    workspaceId,
    title,
    recipient,
    message,
    reason,
    risk,
    type,
    metadata,
  );
}

export function createGeneratedAutomation(
  workspaceId: string,
  name: string,
  trigger: string,
  actions: string[],
) {
  return demoStore.createGeneratedAutomation(workspaceId, name, trigger, actions);
}

export async function addAutomationDraft(automation: Automation) {
  if (env().demoMode) {
    demoStore.addAutomation(automation);
    return automation;
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase.from("automations").insert({
    id: automation.id,
    workspace_id: automation.workspaceId,
    name: automation.name,
    trigger_type: automation.trigger,
    trigger_config: {},
    actions: automation.actions,
    enabled: automation.enabled,
  });

  if (inserted.error) {
    throw new AppError(
      `Unable to create automation draft: ${inserted.error.message}`,
      {
        code: "SUPABASE_AUTOMATION_INSERT_FAILED",
        status: 500,
      },
    );
  }

  return automation;
}
