import "server-only";

import * as demoStore from "@/lib/demo-store";
import {
  automationTemplates,
  formatDateLabel,
  getAutomationTemplate,
  nextRunForRecurrence,
} from "@/lib/automation-templates";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { enrichWorkspaceWithBase44Knowledge } from "@/lib/services/base44";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  type AgentResult,
  type Approval,
  type Activity,
  type AuditLog,
  type Automation,
  type CallLog,
  type Contact,
  type Conversation,
  type CrmTimelineItem,
  type IntegrationSetting,
  type JobRunLog,
  type Lead,
  type Message,
  type NotificationItem,
  type ScheduledJob,
  type Snapshot,
  type Suggestion,
  type TaskItem,
  type ToolCall,
  type Workspace,
  type WorkspaceSummary,
} from "@/lib/types";

function ensure<T>(value: T | null | undefined, message: string, code: string) {
  if (!value) {
    throw new AppError(message, { code, status: 404 });
  }
  return value;
}

const SEEDED_USER_ID = "11111111-1111-1111-1111-111111111111";

function normalizeUserId(userId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    userId,
  )
    ? userId
    : SEEDED_USER_ID;
}

function formatStamp(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? String(value) : formatDateLabel(date);
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

function mapSuggestion(row: Record<string, unknown>): Suggestion {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    type: String(row.type),
    title: String(row.title),
    description: String(row.description ?? ""),
    suggestedAction: String(row.suggested_action ?? ""),
    priority: String(row.priority ?? "medium") as Suggestion["priority"],
    status: String(row.status ?? "pending") as Suggestion["status"],
    linkedEntityId: row.linked_entity_id ? String(row.linked_entity_id) : undefined,
    createdAt: formatStamp(String(row.created_at ?? new Date().toISOString())),
  };
}

function mapNotification(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    message: String(row.message),
    type: String(row.type ?? "info"),
    read: Boolean(row.read),
    createdAt: formatStamp(String(row.created_at ?? new Date().toISOString())),
  };
}

function mapWorkspaceSummary(row: Record<string, unknown>): WorkspaceSummary {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    kind: "daily",
    content: String(row.content ?? ""),
    createdAt: formatStamp(String(row.created_at ?? new Date().toISOString())),
  };
}

function mapScheduledJob(row: Record<string, unknown>): ScheduledJob {
  const payload = (row.payload as Record<string, unknown> | null) ?? {};
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    schedule: String(row.schedule),
    taskType: String(row.task_type),
    templateKey: payload.templateKey ? String(payload.templateKey) : undefined,
    recurrence: String(payload.recurrence ?? "once") as ScheduledJob["recurrence"],
    enabled: Boolean(row.enabled),
    status: String(row.status ?? "pending") as ScheduledJob["status"],
    nextRunAt: row.next_run_at ? formatStamp(String(row.next_run_at)) : undefined,
    nextRunAtValue: row.next_run_at ? String(row.next_run_at) : undefined,
    lastRunAt: row.last_run_at ? formatStamp(String(row.last_run_at)) : undefined,
    lastRunAtValue: row.last_run_at ? String(row.last_run_at) : undefined,
    lastError: row.last_error ? String(row.last_error) : undefined,
    retryCount: Number(row.retry_count ?? 0),
    maxRetries: Number(row.max_retries ?? 3),
    leadId:
      row.lead_id || payload.leadId ? String(row.lead_id ?? payload.leadId) : undefined,
    automationId:
      row.automation_id || payload.automationId
        ? String(row.automation_id ?? payload.automationId)
        : undefined,
    requiresApproval: Boolean(payload.requiresApproval ?? false),
  };
}

function mapJobRun(
  row: Record<string, unknown>,
  jobsById: Map<string, ScheduledJob>,
): JobRunLog {
  const jobId = row.cron_job_id ? String(row.cron_job_id) : undefined;
  const job = jobId ? jobsById.get(jobId) : undefined;
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    jobId,
    jobName: String(row.job_name ?? job?.name ?? "Scheduled job"),
    status: String(row.status ?? "completed") as JobRunLog["status"],
    attempts: Number(row.attempts ?? 0),
    createdAt: formatStamp(String(row.created_at ?? new Date().toISOString())),
    detail: String(row.detail ?? row.error ?? "Execution completed."),
  };
}

function mapContact(row: Record<string, unknown>): Contact {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.full_name ?? "Contact"),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    company: String(row.company_name ?? "Unassigned"),
    status: String(row.status ?? "active"),
    notes: String(row.notes ?? ""),
    lastContactedAt: row.last_contacted_at
      ? new Date(String(row.last_contacted_at)).toLocaleString([], {
          hour: "2-digit",
          minute: "2-digit",
          month: "short",
          day: "numeric",
        })
      : "Never",
  };
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.value === "string") {
      const nested = parseJsonObject(record.value);
      return nested ?? record;
    }

    return record;
  } catch {
    return null;
  }
}

function deriveActivities(
  toolCalls: ToolCall[],
  approvals: Approval[],
  auditLogs: AuditLog[],
  smsLogs: Array<Record<string, unknown>>,
): Activity[] {
  const fromSmsLogs = smsLogs.slice(0, 6).map((row) => {
    const direction = String(row.direction ?? "sms").toLowerCase();
    const isInbound = direction === "inbound";
    const title = isInbound ? "SMS received" : "SMS sent";
    const detail = String(row.message_body ?? "SMS activity");

    return {
      id: `activity_sms_${String(row.id)}`,
      workspaceId: String(row.workspace_id),
      icon: "message" as const,
      title,
      subtitle: detail,
      timeLabel: new Date(String(row.created_at ?? new Date().toISOString())).toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit",
        },
      ),
    };
  });

  const fromTools = toolCalls.slice(0, 6).map((toolCall) => {
    const input = parseJsonObject(toolCall.input);
    const output = parseJsonObject(toolCall.output);
    const recipient =
      typeof input?.recipient === "string"
        ? input.recipient
        : typeof input?.to === "string"
          ? input.to
          : typeof output?.to === "string"
            ? output.to
            : toolCall.tool === "place_call"
              ? "lead"
              : "recipient";
    const statusLabel =
      toolCall.status === "success"
        ? typeof output?.status === "string"
          ? output.status
          : "completed"
        : (toolCall.error ?? "Failed").replace(/^Twilio SMS failed:\s*/i, "");

    return {
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
          ? `Call to ${recipient}`
          : toolCall.tool === "send_sms"
            ? `SMS to ${recipient}`
            : toolCall.tool,
      subtitle: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
      timeLabel: new Date(toolCall.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  });

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

  return [...fromSmsLogs, ...fromTools, ...fromApprovals, ...fromAudit].slice(0, 8) as Activity[];
}

function deriveCrmTimeline(input: {
  workspaceId: string;
  notes: Array<Record<string, unknown>>;
  smsLogs: Array<Record<string, unknown>>;
  callLogs: Array<Record<string, unknown>>;
  tasks: TaskItem[];
  auditLogs: AuditLog[];
}): CrmTimelineItem[] {
  const noteItems = input.notes.map((note) => ({
    id: `crm_note_${String(note.id)}`,
    workspaceId: input.workspaceId,
    leadId: note.lead_id ? String(note.lead_id) : undefined,
    contactId: note.contact_id ? String(note.contact_id) : undefined,
    type: "note" as const,
    title: "Note added",
    detail: String(note.content ?? ""),
    timestamp: String(note.created_at ?? new Date().toISOString()),
  }));

  const smsItems = input.smsLogs.map((row) => ({
    id: `crm_sms_${String(row.id)}`,
    workspaceId: input.workspaceId,
    leadId: row.lead_id ? String(row.lead_id) : undefined,
    type: "sms" as const,
    title: String(row.direction ?? "sms").toLowerCase() === "inbound" ? "SMS received" : "SMS sent",
    detail: String(row.message_body ?? ""),
    timestamp: String(row.created_at ?? new Date().toISOString()),
  }));

  const callItems = input.callLogs.map((row) => ({
    id: `crm_call_${String(row.id)}`,
    workspaceId: input.workspaceId,
    leadId: row.lead_id ? String(row.lead_id) : undefined,
    type: "call" as const,
    title: "Call made",
    detail: String(row.summary ?? row.outcome ?? row.status ?? "Call activity"),
    timestamp: String(row.created_at ?? new Date().toISOString()),
  }));

  const taskItems = input.tasks.map((task) => ({
    id: `crm_task_${task.id}`,
    workspaceId: task.workspaceId,
    leadId: task.linkedLeadId,
    contactId: task.linkedContactId,
    type: "task" as const,
    title: "Task created",
    detail: task.title,
    timestamp: task.dueLabel,
  }));

  const summaryItems = input.auditLogs
    .filter((entry) => entry.action.includes("summary"))
    .map((entry) => ({
      id: `crm_summary_${entry.id}`,
      workspaceId: entry.workspaceId,
      type: "summary" as const,
      title: "AI summary",
      detail: entry.output,
      timestamp: entry.timestamp,
    }));

  return [...smsItems, ...callItems, ...noteItems, ...summaryItems, ...taskItems]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 30);
}

function mapCallLog(row: Record<string, unknown>): CallLog {
  const createdAtValue = String(row.created_at ?? new Date().toISOString());
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    leadId: row.lead_id ? String(row.lead_id) : undefined,
    direction: String(row.direction ?? "outbound") === "inbound" ? "inbound" : "outbound",
    status: String(row.status ?? "completed"),
    summary: String(row.summary ?? "Call activity"),
    transcript: row.transcript ? String(row.transcript) : null,
    recordingUrl: row.recording_url ? String(row.recording_url) : null,
    nextAction: row.next_action ? String(row.next_action) : null,
    callSid: row.outcome ? String(row.outcome) : null,
    createdAt: formatStamp(createdAtValue),
    createdAtValue,
  };
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
    executionLogResponse,
    leadResponse,
    contactResponse,
    taskResponse,
    automationResponse,
    notesResponse,
    smsResponse,
    callResponse,
    suggestionResponse,
    notificationResponse,
    summaryResponse,
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
    supabase
      .from("task_execution_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("leads").select("*").order("created_at", { ascending: false }),
    supabase.from("contacts").select("*").order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").order("created_at", { ascending: false }),
    supabase.from("automations").select("*").order("created_at", { ascending: false }),
    supabase.from("notes").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("sms_logs").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("call_logs").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("suggestions").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50),
    supabase
      .from("workspace_summaries")
      .select("*")
      .eq("kind", "daily")
      .order("created_at", { ascending: false })
      .limit(20),
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
    executionLogResponse.error,
    leadResponse.error,
    contactResponse.error,
    taskResponse.error,
    automationResponse.error,
    notesResponse.error,
    smsResponse.error,
    callResponse.error,
    suggestionResponse.error,
    notificationResponse.error,
    summaryResponse.error,
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

  const workspaces = await Promise.all(
    (workspaceResponse.data ?? []).map(async (row) =>
      enrichWorkspaceWithBase44Knowledge(mapWorkspace(row as Record<string, unknown>)),
    ),
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
  const jobsById = new Map(scheduledJobs.map((job) => [job.id, job]));
  const jobRuns = (executionLogResponse.data ?? []).map((row) =>
    mapJobRun(row as Record<string, unknown>, jobsById),
  );

  const companyIds = Array.from(
    new Set(
      (contactResponse.data ?? [])
        .map((row) => String((row as Record<string, unknown>).company_id ?? ""))
        .filter(Boolean),
    ),
  );
  const companyMap = new Map<string, string>();
  if (companyIds.length > 0) {
    const companiesResponse = await supabase
      .from("companies")
      .select("id,name")
      .in("id", companyIds);
    if (companiesResponse.error) {
      throw new AppError(
        `Supabase query failed: ${companiesResponse.error.message}`,
        {
          code: "SUPABASE_QUERY_FAILED",
          status: 500,
        },
      );
    }
    for (const company of companiesResponse.data ?? []) {
      companyMap.set(String(company.id), String(company.name));
    }
  }

  const contactsById = new Map<string, Contact>();
  const contacts: Contact[] = (contactResponse.data ?? []).map((row) => {
    const contactRow = row as Record<string, unknown>;
    const mapped = mapContact({
      ...contactRow,
      company_name: companyMap.get(String(contactRow.company_id ?? "")) ?? "Unassigned",
    });
    contactsById.set(mapped.id, mapped);
    return mapped;
  });

  const notesByLeadId = new Map<string, string[]>();
  for (const row of notesResponse.data ?? []) {
    const leadId = String((row as Record<string, unknown>).lead_id ?? "");
    if (!leadId) {
      continue;
    }
    const list = notesByLeadId.get(leadId) ?? [];
    list.push(String((row as Record<string, unknown>).content ?? ""));
    notesByLeadId.set(leadId, list);
  }

  const leads: Lead[] = (leadResponse.data ?? []).map((row) => {
    const leadRow = row as Record<string, unknown>;
    const contact = contactsById.get(String(leadRow.contact_id ?? ""));
    return {
      id: String(leadRow.id),
      workspaceId: String(leadRow.workspace_id),
      contactId: leadRow.contact_id ? String(leadRow.contact_id) : undefined,
      name: String(leadRow.full_name ?? contact?.name ?? "Lead"),
      company: String(contact?.company ?? "Unassigned"),
      phone: String(leadRow.phone ?? contact?.phone ?? ""),
      email: String(leadRow.email ?? contact?.email ?? ""),
      source: String(leadRow.source ?? "Manual"),
      stage: String(leadRow.status ?? "New lead"),
      estimatedValue: Number(leadRow.estimated_value ?? 0),
      nextFollowUpAt: leadRow.next_follow_up_at
        ? new Date(String(leadRow.next_follow_up_at)).toLocaleString([], {
            hour: "2-digit",
            minute: "2-digit",
            month: "short",
            day: "numeric",
          })
        : "Not scheduled",
      nextFollowUpAtValue: leadRow.next_follow_up_at
        ? String(leadRow.next_follow_up_at)
        : undefined,
      notes: notesByLeadId.get(String(leadRow.id))?.join(" ") ?? String(leadRow.summary ?? ""),
      lastTouch: contact?.lastContactedAt ?? "Recent",
      optOut: false,
    };
  });

  const tasks: TaskItem[] = (taskResponse.data ?? []).map((row) => {
    const taskRow = row as Record<string, unknown>;
    return {
      id: String(taskRow.id),
      workspaceId: String(taskRow.workspace_id),
      title: String(taskRow.title),
      description: String(taskRow.description ?? ""),
      dueLabel: String(taskRow.display_due_label ?? taskRow.due_at ?? "Scheduled"),
      status:
        String(taskRow.status) === "done"
          ? "done"
          : String(taskRow.status) === "blocked"
            ? "blocked"
            : "scheduled",
      linkedLeadId: taskRow.lead_id ? String(taskRow.lead_id) : undefined,
      linkedContactId: taskRow.contact_id ? String(taskRow.contact_id) : undefined,
    };
  });

  const automations: Automation[] = (automationResponse.data ?? []).map((row) => {
    const automationRow = row as Record<string, unknown>;
    return {
      id: String(automationRow.id),
      workspaceId: String(automationRow.workspace_id),
      name: String(automationRow.name),
      description: String(automationRow.description ?? ""),
      templateKey: automationRow.template_key ? String(automationRow.template_key) : undefined,
      trigger: String(automationRow.trigger_type),
      actions: Array.isArray(automationRow.actions)
        ? automationRow.actions.map(String)
        : [],
      enabled: Boolean(automationRow.enabled),
      status: Boolean(automationRow.enabled) ? "active" : "draft",
      lastRunAt: automationRow.last_run_at
        ? formatStamp(String(automationRow.last_run_at))
        : undefined,
      lastRunAtValue: automationRow.last_run_at
        ? String(automationRow.last_run_at)
        : undefined,
    };
  });

  const activities = deriveActivities(
    toolCalls,
    approvals,
    auditLogs,
    (smsResponse.data ?? []) as Array<Record<string, unknown>>,
  );
  const crmTimeline = deriveCrmTimeline({
    workspaceId: selectedWorkspaceId,
    notes: (notesResponse.data ?? []) as Array<Record<string, unknown>>,
    smsLogs: (smsResponse.data ?? []) as Array<Record<string, unknown>>,
    callLogs: (callResponse.data ?? []) as Array<Record<string, unknown>>,
    tasks,
    auditLogs,
  });
  const callLogs = ((callResponse.data ?? []) as Array<Record<string, unknown>>).map(mapCallLog);
  const suggestions = (suggestionResponse.data ?? []).map((row) =>
    mapSuggestion(row as Record<string, unknown>),
  );
  const notifications = (notificationResponse.data ?? []).map((row) =>
    mapNotification(row as Record<string, unknown>),
  );
  const workspaceSummaries = (summaryResponse.data ?? []).map((row) =>
    mapWorkspaceSummary(row as Record<string, unknown>),
  );
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
    contacts,
    tasks,
    leads,
    crmTimeline,
    callLogs,
    automations,
    conversations,
    auditLogs,
    toolCalls,
    integrationSettings,
    scheduledJobs,
    jobRuns,
    suggestions,
    notifications,
    workspaceSummaries,
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

export async function findWorkspaceByTwilioNumber(phoneNumber: string) {
  const snapshot = await getSnapshot();
  const normalize = (value: string) => value.replace(/[^\d+]/g, "");
  const normalizedPhone = normalize(phoneNumber);
  const matchingIntegration = snapshot.integrationSettings.find(
    (setting) =>
      setting.provider === "twilio" &&
      typeof setting.config.phoneNumber === "string" &&
      normalize(String(setting.config.phoneNumber)) === normalizedPhone,
  );

  if (matchingIntegration) {
    return (
      snapshot.workspaces.find(
        (workspace) => workspace.id === matchingIntegration.workspaceId,
      ) ?? null
    );
  }

  const envTwilioMatches =
    env().twilioPhoneNumber && normalize(env().twilioPhoneNumber) === normalizedPhone;

  if (envTwilioMatches) {
    const activeTwilioWorkspace = snapshot.integrationSettings.find(
      (setting) => setting.provider === "twilio" && setting.status === "connected",
    )?.workspaceId;

    if (activeTwilioWorkspace) {
      return (
        snapshot.workspaces.find((workspace) => workspace.id === activeTwilioWorkspace) ?? null
      );
    }

    const anyTwilioWorkspace = snapshot.integrationSettings.find(
      (setting) => setting.provider === "twilio",
    )?.workspaceId;

    if (anyTwilioWorkspace) {
      return (
        snapshot.workspaces.find((workspace) => workspace.id === anyTwilioWorkspace) ?? null
      );
    }

    if (env().base44WorkspaceId) {
      const configuredWorkspace = snapshot.workspaces.find(
        (workspace) => workspace.id === env().base44WorkspaceId,
      );

      if (configuredWorkspace) {
        return configuredWorkspace;
      }
    }
  }

  return (
    snapshot.workspaces.find(
      (workspace) => normalize(workspace.twilioNumber) === normalizedPhone,
    ) ?? null
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

export async function findLeadByPhone(workspaceId: string, phoneNumber: string) {
  const normalize = (value: string) => value.replace(/[^\d+]/g, "");
  const snapshot = await getSnapshot(workspaceId);
  return (
    snapshot.leads.find(
      (lead) =>
        lead.workspaceId === workspaceId &&
        normalize(lead.phone) === normalize(phoneNumber),
    ) ?? null
  );
}

export async function findCrmMatches(workspaceId: string, query: string) {
  const snapshot = await getSnapshot(workspaceId);
  const needle = query.toLowerCase();

  const contacts = snapshot.contacts.filter((contact) =>
    [contact.name, contact.email, contact.phone, contact.company, contact.status]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );

  const leads = snapshot.leads.filter((lead) =>
    [lead.name, lead.email, lead.phone, lead.company, lead.stage, lead.source]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );

  return { contacts, leads };
}

export async function createLeadRecord(input: {
  workspaceId: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  status?: string;
  estimatedValue?: number;
  nextFollowUpAt?: string;
  company?: string;
}) {
  if (env().demoMode) {
    const contact: Contact = {
      id: `contact_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      company: input.company ?? "Unassigned",
      status: input.status ?? "new",
      notes: "",
      lastContactedAt: "Never",
    };
    demoStore.addContact(contact);
    const lead = {
      ...demoStore.createGeneratedLead(input.workspaceId, input.name, input.phone),
      contactId: contact.id,
      email: input.email,
      source: input.source,
      stage: input.status ?? "New lead",
      estimatedValue: input.estimatedValue ?? 0,
      nextFollowUpAt: input.nextFollowUpAt
        ? formatStamp(input.nextFollowUpAt)
        : "Not scheduled",
      nextFollowUpAtValue: input.nextFollowUpAt,
      company: input.company ?? "Unassigned",
    };
    demoStore.addLead(lead);
    demoStore.addCrmTimelineItem({
      id: `timeline_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      leadId: lead.id,
      contactId: contact.id,
      type: "summary",
      title: "Lead created",
      detail: `${input.name} added from ${input.source}.`,
      timestamp: new Date().toISOString(),
    });
    return lead;
  }

  const supabase = getSupabaseAdmin();
  let companyId: string | null = null;
  if (input.company && input.company !== "Unassigned") {
    const companyInsert = await supabase
      .from("companies")
      .insert({ workspace_id: input.workspaceId, name: input.company })
      .select("id")
      .single();
    if (companyInsert.error) {
      throw new AppError(`Unable to create company: ${companyInsert.error.message}`, {
        code: "SUPABASE_COMPANY_INSERT_FAILED",
        status: 500,
      });
    }
    companyId = String(companyInsert.data.id);
  }

  const contactInsert = await supabase
    .from("contacts")
    .insert({
      workspace_id: input.workspaceId,
      company_id: companyId,
      full_name: input.name,
      phone: input.phone,
      email: input.email,
      status: input.status ?? "new",
      notes: "",
      last_contacted_at: null,
    })
    .select("id")
    .single();
  if (contactInsert.error) {
    throw new AppError(`Unable to create contact: ${contactInsert.error.message}`, {
      code: "SUPABASE_CONTACT_INSERT_FAILED",
      status: 500,
    });
  }

  const leadInsert = await supabase
    .from("leads")
    .insert({
      workspace_id: input.workspaceId,
      contact_id: contactInsert.data.id,
      full_name: input.name,
      phone: input.phone,
      email: input.email,
      source: input.source,
      status: input.status ?? "New lead",
      summary: "",
      estimated_value: input.estimatedValue ?? 0,
      next_follow_up_at: input.nextFollowUpAt
        ? new Date(input.nextFollowUpAt).toISOString()
        : null,
    })
    .select("*")
    .single();
  if (leadInsert.error) {
    throw new AppError(`Unable to create lead: ${leadInsert.error.message}`, {
      code: "SUPABASE_LEAD_INSERT_FAILED",
      status: 500,
    });
  }

  await addAuditLog({
    workspaceId: input.workspaceId,
    userId: "user_alex",
    action: "create_lead",
    input: input.name,
    output: String(leadInsert.data.id),
    approvalStatus: "not_required",
  });

  const snapshot = await getSnapshot(input.workspaceId);
  return ensure(
    snapshot.leads.find((lead) => lead.id === String(leadInsert.data.id)),
    "Lead not found after creation.",
    "LEAD_NOT_FOUND",
  );
}

export async function updateLeadStatus(input: {
  workspaceId: string;
  leadId: string;
  status: string;
  nextFollowUpAt?: string;
}) {
  if (env().demoMode) {
    const snapshot = demoStore.getSnapshot(input.workspaceId);
    const lead = snapshot.leads.find((item) => item.id === input.leadId);
    if (!lead) {
      throw new AppError("Lead not found.", { code: "LEAD_NOT_FOUND", status: 404 });
    }
    lead.stage = input.status;
    if (input.nextFollowUpAt) {
      lead.nextFollowUpAt = formatStamp(input.nextFollowUpAt);
      lead.nextFollowUpAtValue = input.nextFollowUpAt;
    }
    demoStore.addCrmTimelineItem({
      id: `timeline_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      leadId: lead.id,
      type: "summary",
      title: "Lead updated",
      detail: `Status changed to ${input.status}.`,
      timestamp: new Date().toISOString(),
    });
    return lead;
  }

  const supabase = getSupabaseAdmin();
  const updated = await supabase
    .from("leads")
    .update({
      status: input.status,
      next_follow_up_at: input.nextFollowUpAt
        ? new Date(input.nextFollowUpAt).toISOString()
        : null,
    })
    .eq("id", input.leadId);
  if (updated.error) {
    throw new AppError(`Unable to update lead: ${updated.error.message}`, {
      code: "SUPABASE_LEAD_UPDATE_FAILED",
      status: 500,
    });
  }

  await addAuditLog({
    workspaceId: input.workspaceId,
    userId: "user_alex",
    action: "update_lead_status",
    input: input.leadId,
    output: input.status,
    approvalStatus: "not_required",
  });

  const snapshot = await getSnapshot(input.workspaceId);
  return ensure(
    snapshot.leads.find((lead) => lead.id === input.leadId),
    "Lead not found after update.",
    "LEAD_NOT_FOUND",
  );
}

export async function addCrmNote(input: {
  workspaceId: string;
  leadId?: string;
  contactId?: string;
  content: string;
}) {
  if (env().demoMode) {
    demoStore.addCrmTimelineItem({
      id: `timeline_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      contactId: input.contactId,
      type: "note",
      title: "Note added",
      detail: input.content,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase.from("notes").insert({
    workspace_id: input.workspaceId,
    lead_id: input.leadId ?? null,
    contact_id: input.contactId ?? null,
    content: input.content,
  });
  if (inserted.error) {
    throw new AppError(`Unable to add note: ${inserted.error.message}`, {
      code: "SUPABASE_NOTE_INSERT_FAILED",
      status: 500,
    });
  }
}

export async function createFollowUpTask(input: {
  workspaceId: string;
  title: string;
  description: string;
  dueAt: string;
  leadId?: string;
  contactId?: string;
}) {
  if (env().demoMode) {
    const task: TaskItem = {
      id: `task_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      title: input.title,
      description: input.description,
      dueLabel: formatStamp(input.dueAt),
      status: "scheduled",
      linkedLeadId: input.leadId,
      linkedContactId: input.contactId,
    };
    demoStore.addTask(task);
    demoStore.addCrmTimelineItem({
      id: `timeline_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      contactId: input.contactId,
      type: "task",
      title: "Task created",
      detail: input.title,
      timestamp: formatStamp(input.dueAt),
    });
    return task;
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase
    .from("tasks")
    .insert({
      workspace_id: input.workspaceId,
      title: input.title,
      description: input.description,
      due_at: new Date(input.dueAt).toISOString(),
      display_due_label: input.dueAt,
      status: "scheduled",
      lead_id: input.leadId ?? null,
      contact_id: input.contactId ?? null,
    })
    .select("*")
    .single();
  if (inserted.error) {
    throw new AppError(`Unable to create task: ${inserted.error.message}`, {
      code: "SUPABASE_TASK_INSERT_FAILED",
      status: 500,
    });
  }
  return {
    id: String(inserted.data.id),
    workspaceId: input.workspaceId,
    title: input.title,
    description: input.description,
    dueLabel: formatStamp(input.dueAt),
    status: "scheduled",
    linkedLeadId: input.leadId,
    linkedContactId: input.contactId,
  } satisfies TaskItem;
}

export async function summarizeRecentCrmActivity(workspaceId: string) {
  const snapshot = await getSnapshot(workspaceId);
  const recent = snapshot.crmTimeline.slice(0, 5);
  if (recent.length === 0) {
    return "No recent CRM activity.";
  }
  return recent
    .map((item) => `${item.title}: ${item.detail}`)
    .join(" ");
}

export async function logSmsActivity(input: {
  workspaceId: string;
  leadId?: string;
  direction: "inbound" | "outbound";
  messageBody: string;
  providerMessageId?: string;
}) {
  if (env().demoMode) {
    demoStore.addCrmTimelineItem({
      id: `timeline_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      type: "sms",
      title: input.direction === "inbound" ? "SMS received" : "SMS sent",
      detail: input.messageBody,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase.from("sms_logs").insert({
    workspace_id: input.workspaceId,
    lead_id: input.leadId ?? null,
    direction: input.direction,
    message_body: input.messageBody,
    provider_message_id: input.providerMessageId ?? null,
  });
  if (inserted.error) {
    throw new AppError(`Unable to log SMS activity: ${inserted.error.message}`, {
      code: "SUPABASE_SMS_LOG_FAILED",
      status: 500,
    });
  }
}

export async function logCallActivity(input: {
  workspaceId: string;
  leadId?: string;
  status: string;
  summary: string;
  outcome?: string;
  direction?: "inbound" | "outbound";
  transcript?: string;
  nextAction?: string;
}) {
  if (env().demoMode) {
    demoStore.addCrmTimelineItem({
      id: `timeline_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      type: "call",
      title: input.direction === "inbound" ? "Call received" : "Call made",
      detail: input.summary,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase.from("call_logs").insert({
    workspace_id: input.workspaceId,
    lead_id: input.leadId ?? null,
    direction: input.direction ?? "outbound",
    status: input.status,
    summary: input.summary,
    outcome: input.outcome ?? null,
    transcript: input.transcript ?? null,
    next_action: input.nextAction ?? null,
  });
  if (inserted.error) {
    throw new AppError(`Unable to log call activity: ${inserted.error.message}`, {
      code: "SUPABASE_CALL_LOG_FAILED",
      status: 500,
    });
  }
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
      description: automation.description ?? "",
      template_key: automation.templateKey ?? null,
      trigger_type: automation.trigger,
      trigger_config: {},
      actions: automation.actions,
      enabled: automation.enabled,
      last_run_at: automation.lastRunAtValue ?? null,
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
    user_id: normalizeUserId(entry.userId),
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
        metadata: {
          ...(current.metadata ?? {}),
          ...(updates.metadata ?? {}),
        },
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
      payload: {
        recurrence: "once",
        requiresApproval: false,
      },
      enabled: false,
      status: "pending",
      max_retries: 1,
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
    .select("id, config")
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
    const existingConfig =
      existing.data.config && typeof existing.data.config === "object"
        ? (existing.data.config as Record<string, string | number | boolean | null>)
        : {};
    const update = await supabase
      .from("integrations")
      .update({
        status: input.status,
        config: {
          ...existingConfig,
          ...(input.config ?? {}),
        },
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

async function createScheduledJobRecord(input: {
  workspaceId: string;
  name: string;
  schedule: string;
  taskType: string;
  templateKey?: string;
  recurrence: ScheduledJob["recurrence"];
  enabled: boolean;
  nextRunAtValue?: string;
  leadId?: string;
  automationId?: string;
  requiresApproval: boolean;
  maxRetries?: number;
}) {
  const job: ScheduledJob = {
    id: `job_${Math.random().toString(36).slice(2, 10)}`,
    workspaceId: input.workspaceId,
    name: input.name,
    schedule: input.schedule,
    taskType: input.taskType,
    templateKey: input.templateKey,
    recurrence: input.recurrence,
    enabled: input.enabled,
    status: "pending",
    nextRunAt: input.nextRunAtValue ? formatStamp(input.nextRunAtValue) : undefined,
    nextRunAtValue: input.nextRunAtValue,
    retryCount: 0,
    maxRetries: input.maxRetries ?? 3,
    leadId: input.leadId,
    automationId: input.automationId,
    requiresApproval: input.requiresApproval,
  };

  if (env().demoMode) {
    demoStore.addScheduledJob(job);
    return job;
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase
    .from("cron_jobs")
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      schedule: input.schedule,
      task_type: input.taskType,
      payload: {
        templateKey: input.templateKey ?? null,
        recurrence: input.recurrence,
        leadId: input.leadId ?? null,
        automationId: input.automationId ?? null,
        requiresApproval: input.requiresApproval,
      },
      enabled: input.enabled,
      status: "pending",
      next_run_at: input.nextRunAtValue ?? null,
      retry_count: 0,
      max_retries: input.maxRetries ?? 3,
      lead_id: input.leadId ?? null,
      automation_id: input.automationId ?? null,
    })
    .select("*")
    .single();

  if (inserted.error) {
    throw new AppError(`Unable to create scheduled job: ${inserted.error.message}`, {
      code: "SUPABASE_CRON_INSERT_FAILED",
      status: 500,
    });
  }

  return mapScheduledJob(inserted.data as Record<string, unknown>);
}

async function updateScheduledJobRecord(
  jobId: string,
  updates: Partial<ScheduledJob>,
) {
  if (env().demoMode) {
    return demoStore.updateScheduledJob(jobId, updates);
  }

  const supabase = getSupabaseAdmin();
  const payload: Record<string, unknown> = {};
  if (updates.templateKey !== undefined) {
    payload.templateKey = updates.templateKey;
  }
  if (updates.recurrence !== undefined) {
    payload.recurrence = updates.recurrence;
  }
  if (updates.leadId !== undefined) {
    payload.leadId = updates.leadId;
  }
  if (updates.automationId !== undefined) {
    payload.automationId = updates.automationId;
  }
  if (updates.requiresApproval !== undefined) {
    payload.requiresApproval = updates.requiresApproval;
  }

  const response = await supabase
    .from("cron_jobs")
    .update({
      name: updates.name,
      schedule: updates.schedule,
      task_type: updates.taskType,
      enabled: updates.enabled,
      status: updates.status,
      next_run_at: updates.nextRunAtValue,
      last_run_at: updates.lastRunAtValue,
      last_error: updates.lastError ?? null,
      retry_count: updates.retryCount,
      max_retries: updates.maxRetries,
      lead_id: updates.leadId ?? null,
      automation_id: updates.automationId ?? null,
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    })
    .eq("id", jobId)
    .select("*")
    .single();

  if (response.error) {
    throw new AppError(`Unable to update scheduled job: ${response.error.message}`, {
      code: "SUPABASE_CRON_UPDATE_FAILED",
      status: 500,
    });
  }

  return mapScheduledJob(response.data as Record<string, unknown>);
}

async function addJobRunRecord(input: {
  workspaceId: string;
  jobId?: string;
  jobName: string;
  status: JobRunLog["status"];
  attempts: number;
  detail: string;
}) {
  const run: JobRunLog = {
    id: `jobrun_${Math.random().toString(36).slice(2, 10)}`,
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    jobName: input.jobName,
    status: input.status,
    attempts: input.attempts,
    createdAt: formatStamp(new Date()),
    detail: input.detail,
  };

  if (env().demoMode) {
    demoStore.addJobRun(run);
    return run;
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase.from("task_execution_logs").insert({
    cron_job_id: input.jobId ?? null,
    workspace_id: input.workspaceId,
    status: input.status,
    attempts: input.attempts,
    error: input.status === "failed" ? input.detail : null,
    job_name: input.jobName,
    detail: input.detail,
  });

  if (inserted.error) {
    throw new AppError(`Unable to save job run: ${inserted.error.message}`, {
      code: "SUPABASE_JOB_RUN_INSERT_FAILED",
      status: 500,
    });
  }

  return run;
}

export function getAutomationTemplates() {
  return automationTemplates;
}

export async function getOverdueFollowUps(workspaceId: string) {
  const snapshot = await getSnapshot(workspaceId);
  const now = Date.now();
  return snapshot.leads.filter(
    (lead) => lead.workspaceId === workspaceId && !!lead.nextFollowUpAtValue && new Date(lead.nextFollowUpAtValue).getTime() <= now,
  );
}

export async function scheduleLeadFollowUp(input: {
  workspaceId: string;
  leadId: string;
  dueAt: string;
  title?: string;
  description?: string;
}) {
  const snapshot = await getSnapshot(input.workspaceId);
  const lead = ensure(
    snapshot.leads.find((entry) => entry.id === input.leadId),
    "Lead not found.",
    "LEAD_NOT_FOUND",
  );

  const task = await createFollowUpTask({
    workspaceId: input.workspaceId,
    title: input.title ?? `Follow up ${lead.name}`,
    description:
      input.description ?? `AEGIS reminder to follow up ${lead.name} on their latest enquiry.`,
    dueAt: input.dueAt,
    leadId: lead.id,
    contactId: lead.contactId,
  });

  await updateLeadStatus({
    workspaceId: input.workspaceId,
    leadId: lead.id,
    status: "Follow-up scheduled",
    nextFollowUpAt: input.dueAt,
  });

  const job = await createScheduledJobRecord({
    workspaceId: input.workspaceId,
    name: `Follow up ${lead.name}`,
    schedule: formatStamp(input.dueAt),
    taskType: "lead_follow_up",
    recurrence: "once",
    enabled: true,
    nextRunAtValue: input.dueAt,
    leadId: lead.id,
    requiresApproval: true,
    maxRetries: 3,
  });

  await addAuditLog({
    workspaceId: input.workspaceId,
    userId: "user_alex",
    action: "schedule_lead_follow_up",
    input: lead.name,
    output: job.id,
    approvalStatus: "not_required",
  });

  return { task, job };
}

export async function createAutomationFromTemplate(input: {
  workspaceId: string;
  templateKey: string;
  enabled?: boolean;
}) {
  const template = ensure(
    getAutomationTemplate(input.templateKey),
    "Automation template not found.",
    "AUTOMATION_TEMPLATE_NOT_FOUND",
  );

  const automation = createGeneratedAutomation(
    input.workspaceId,
    template.name,
    template.trigger,
    template.actions,
    {
      description: template.description,
      templateKey: template.key,
      enabled: input.enabled ?? false,
    },
  );
  await addAutomationDraft(automation);

  const nextRun = nextRunForRecurrence(template.recurrence);
  const job = await createScheduledJobRecord({
    workspaceId: input.workspaceId,
    name: template.name,
    schedule: template.defaultSchedule,
    taskType: template.taskType,
    templateKey: template.key,
    recurrence: template.recurrence,
    enabled: input.enabled ?? false,
    nextRunAtValue: nextRun?.toISOString(),
    automationId: automation.id,
    requiresApproval: template.requiresApproval,
    maxRetries: 3,
  });

  return { automation, job, template };
}

export async function toggleAutomationEnabled(automationId: string, enabled: boolean) {
  if (env().demoMode) {
    const automation = demoStore.updateAutomation(automationId, {
      enabled,
      status: enabled ? "active" : "draft",
    });
    if (!automation) {
      throw new AppError("Automation not found.", {
        code: "AUTOMATION_NOT_FOUND",
        status: 404,
      });
    }
    const relatedJobs = demoStore
      .getSnapshot()
      .scheduledJobs.filter((job) => job.automationId === automationId);
    for (const job of relatedJobs) {
      demoStore.updateScheduledJob(job.id, { enabled });
    }
    return automation;
  }

  const supabase = getSupabaseAdmin();
  const response = await supabase
    .from("automations")
    .update({ enabled })
    .eq("id", automationId)
    .select("*")
    .single();

  if (response.error) {
    throw new AppError(`Unable to update automation: ${response.error.message}`, {
      code: "SUPABASE_AUTOMATION_UPDATE_FAILED",
      status: 500,
    });
  }

  const cronUpdate = await supabase
    .from("cron_jobs")
    .update({ enabled })
    .eq("automation_id", automationId);
  if (cronUpdate.error) {
    throw new AppError(`Unable to update automation jobs: ${cronUpdate.error.message}`, {
      code: "SUPABASE_CRON_UPDATE_FAILED",
      status: 500,
    });
  }

  return {
    id: String(response.data.id),
    workspaceId: String(response.data.workspace_id),
    name: String(response.data.name),
    description: String(response.data.description ?? ""),
    templateKey: response.data.template_key ? String(response.data.template_key) : undefined,
    trigger: String(response.data.trigger_type),
    actions: Array.isArray(response.data.actions) ? response.data.actions.map(String) : [],
    enabled: Boolean(response.data.enabled),
    status: Boolean(response.data.enabled) ? "active" : "draft",
    lastRunAt: response.data.last_run_at
      ? formatStamp(String(response.data.last_run_at))
      : undefined,
    lastRunAtValue: response.data.last_run_at ? String(response.data.last_run_at) : undefined,
  } satisfies Automation;
}

export async function toggleScheduledJobEnabled(jobId: string, enabled: boolean) {
  const current = (await getSnapshot()).scheduledJobs.find((job) => job.id === jobId);
  if (!current) {
    throw new AppError("Scheduled job not found.", {
      code: "SCHEDULED_JOB_NOT_FOUND",
      status: 404,
    });
  }
  return updateScheduledJobRecord(jobId, { ...current, enabled });
}

function buildSalesSummary(leads: Lead[]) {
  const totalValue = leads.reduce((sum, lead) => sum + lead.estimatedValue, 0);
  return `${leads.length} active leads worth GBP ${totalValue.toLocaleString()}.`;
}

async function executeScheduledJob(job: ScheduledJob) {
  const snapshot = await getSnapshot(job.workspaceId);
  const lead = job.leadId
    ? snapshot.leads.find((entry) => entry.id === job.leadId)
    : snapshot.leads.find((entry) => entry.workspaceId === job.workspaceId && !entry.optOut);

  if (job.taskType === "lead_follow_up") {
    const targetLead = ensure(lead, "Lead not found for follow-up job.", "LEAD_NOT_FOUND");
    await createFollowUpTask({
      workspaceId: job.workspaceId,
      title: `Follow up ${targetLead.name}`,
      description: "Scheduled by AEGIS follow-up runner.",
      dueAt: new Date().toISOString(),
      leadId: targetLead.id,
      contactId: targetLead.contactId,
    });
    await previewAgentAction({
      message: "",
      actionCards: [],
      pendingApproval: createGeneratedApproval(
        job.workspaceId,
        `Send follow-up SMS to ${targetLead.name}`,
        targetLead.name,
        `Hi ${targetLead.name.split(" ")[0]}, just checking in on your quote and next steps.`,
        "Scheduled lead follow-up reached its due time.",
        "medium",
        "send_sms",
        {
          phone: targetLead.phone,
          leadId: targetLead.id,
        },
      ),
    });
    return `Created a follow-up task and drafted an approval-safe SMS for ${targetLead.name}.`;
  }

  if (job.taskType === "missed_call_follow_up") {
    const targetLead = ensure(lead, "No lead available for missed-call follow-up.", "LEAD_NOT_FOUND");
    await previewAgentAction({
      message: "",
      actionCards: [],
      pendingApproval: createGeneratedApproval(
        job.workspaceId,
        `Missed-call SMS for ${targetLead.name}`,
        targetLead.name,
        `Hi ${targetLead.name.split(" ")[0]}, sorry we missed you. Would you like me to arrange a callback today?`,
        "Missed-call automation runner prepared a safe SMS draft.",
        "medium",
        "send_sms",
        {
          phone: targetLead.phone,
          leadId: targetLead.id,
        },
      ),
    });
    return `Prepared a missed-call SMS approval for ${targetLead.name}.`;
  }

  if (job.taskType === "no_reply_follow_up") {
    const staleLead = snapshot.leads.find(
      (entry) =>
        entry.workspaceId === job.workspaceId &&
        !!entry.nextFollowUpAtValue &&
        new Date(entry.nextFollowUpAtValue).getTime() <= Date.now(),
    );
    if (!staleLead) {
      return "No stale leads needed a no-reply follow-up.";
    }
    await previewAgentAction({
      message: "",
      actionCards: [],
      pendingApproval: createGeneratedApproval(
        job.workspaceId,
        `No-reply follow-up for ${staleLead.name}`,
        staleLead.name,
        `Hi ${staleLead.name.split(" ")[0]}, just checking whether you want to move forward with the quote.`,
        "No-reply automation prepared a follow-up draft after 2 days.",
        "medium",
        "send_sms",
        {
          phone: staleLead.phone,
          leadId: staleLead.id,
        },
      ),
    });
    return `Prepared a no-reply follow-up draft for ${staleLead.name}.`;
  }

  if (job.taskType === "daily_crm_summary") {
    const overdue = await getOverdueFollowUps(job.workspaceId);
    const summary = await summarizeRecentCrmActivity(job.workspaceId);
    const detail = `${summary} Overdue follow-ups: ${overdue.length}.`;
    await addAuditLog({
      workspaceId: job.workspaceId,
      userId: "user_alex",
      action: "daily_crm_summary",
      input: job.name,
      output: detail,
      approvalStatus: "not_required",
    });
    return detail;
  }

  if (job.taskType === "weekly_sales_summary") {
    const detail = buildSalesSummary(
      snapshot.leads.filter((entry) => entry.workspaceId === job.workspaceId),
    );
    await addAuditLog({
      workspaceId: job.workspaceId,
      userId: "user_alex",
      action: "weekly_sales_summary",
      input: job.name,
      output: detail,
      approvalStatus: "not_required",
    });
    return detail;
  }

  return "No execution handler was needed for this scheduled job.";
}

export async function runDueScheduledJobs(input?: { workspaceId?: string; limit?: number }) {
  const snapshot = await getSnapshot(input?.workspaceId);
  const now = Date.now();
  const dueJobs = snapshot.scheduledJobs
    .filter((job) => {
      if (input?.workspaceId && job.workspaceId !== input.workspaceId) {
        return false;
      }
      return (
        job.enabled &&
        !!job.nextRunAtValue &&
        new Date(job.nextRunAtValue).getTime() <= now
      );
    })
    .slice(0, input?.limit ?? 10);

  const results: Array<{ jobId: string; status: ScheduledJob["status"]; detail: string }> = [];

  for (const job of dueJobs) {
    const startedAt = new Date().toISOString();
    await updateScheduledJobRecord(job.id, {
      ...job,
      status: "running",
      lastError: undefined,
    });

    try {
      const detail = await executeScheduledJob(job);
      const nextRun =
        job.recurrence === "daily" || job.recurrence === "weekly"
          ? nextRunForRecurrence(job.recurrence)?.toISOString()
          : undefined;
      await updateScheduledJobRecord(job.id, {
        ...job,
        status: "completed",
        enabled: nextRun ? job.enabled : false,
        lastRunAt: formatStamp(startedAt),
        lastRunAtValue: startedAt,
        nextRunAt: nextRun ? formatStamp(nextRun) : undefined,
        nextRunAtValue: nextRun,
        retryCount: 0,
        lastError: undefined,
      });
      await addJobRunRecord({
        workspaceId: job.workspaceId,
        jobId: job.id,
        jobName: job.name,
        status: "completed",
        attempts: job.retryCount + 1,
        detail,
      });
      if (job.automationId) {
        await touchAutomationRun(job.automationId, startedAt);
      }
      results.push({ jobId: job.id, status: "completed", detail });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scheduled job failed.";
      const retryCount = job.retryCount + 1;
      const canRetry = retryCount < job.maxRetries;
      const retryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await updateScheduledJobRecord(job.id, {
        ...job,
        status: "failed",
        enabled: canRetry,
        retryCount,
        lastError: message,
        nextRunAt: canRetry ? formatStamp(retryAt) : job.nextRunAt,
        nextRunAtValue: canRetry ? retryAt : job.nextRunAtValue,
      });
      await addJobRunRecord({
        workspaceId: job.workspaceId,
        jobId: job.id,
        jobName: job.name,
        status: "failed",
        attempts: retryCount,
        detail: message,
      });
      results.push({ jobId: job.id, status: "failed", detail: message });
    }
  }

  return {
    processed: results.length,
    results,
  };
}

export type WorkspaceIssueRecord = {
  type: string;
  linkedEntityId?: string;
  title: string;
  detail: string;
  metadata?: Record<string, string | number | boolean | null>;
};

type SuggestionInput = {
  workspaceId: string;
  type: string;
  title: string;
  description: string;
  suggestedAction: string;
  priority: Suggestion["priority"];
  linkedEntityId?: string;
};

function parseMaybeDate(value: string | undefined) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function listActiveWorkspaces() {
  if (env().demoMode) {
    return demoStore.getSnapshot().workspaces;
  }

  const supabase = getSupabaseAdmin();
  const response = await supabase
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: true });

  if (response.error) {
    throw new AppError(`Unable to load workspaces: ${response.error.message}`, {
      code: "SUPABASE_WORKSPACE_LIST_FAILED",
      status: 500,
    });
  }

  return Promise.all(
    (response.data ?? []).map(async (row) =>
      enrichWorkspaceWithBase44Knowledge(mapWorkspace(row as Record<string, unknown>)),
    ),
  );
}

export async function createSuggestion(input: SuggestionInput) {
  if (env().demoMode) {
    const suggestion: Suggestion = {
      id: `suggestion_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      description: input.description,
      suggestedAction: input.suggestedAction,
      priority: input.priority,
      status: "pending",
      linkedEntityId: input.linkedEntityId,
      createdAt: formatStamp(new Date()),
    };
    demoStore.addSuggestion(suggestion);
    return suggestion;
  }

  const supabase = getSupabaseAdmin();
  const existing = await supabase
    .from("suggestions")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("type", input.type)
    .eq("linked_entity_id", input.linkedEntityId ?? "")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new AppError(`Unable to read suggestions: ${existing.error.message}`, {
      code: "SUPABASE_SUGGESTION_READ_FAILED",
      status: 500,
    });
  }

  if (existing.data) {
    return mapSuggestion(existing.data as Record<string, unknown>);
  }

  const inserted = await supabase
    .from("suggestions")
    .insert({
      workspace_id: input.workspaceId,
      type: input.type,
      title: input.title,
      description: input.description,
      suggested_action: input.suggestedAction,
      priority: input.priority,
      status: "pending",
      linked_entity_id: input.linkedEntityId ?? null,
    })
    .select("*")
    .single();

  if (inserted.error) {
    throw new AppError(`Unable to create suggestion: ${inserted.error.message}`, {
      code: "SUPABASE_SUGGESTION_INSERT_FAILED",
      status: 500,
    });
  }

  return mapSuggestion(inserted.data as Record<string, unknown>);
}

export async function createNotification(input: {
  workspaceId: string;
  message: string;
  type: string;
}) {
  if (env().demoMode) {
    const notification: NotificationItem = {
      id: `notification_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      message: input.message,
      type: input.type,
      read: false,
      createdAt: formatStamp(new Date()),
    };
    demoStore.addNotification(notification);
    return notification;
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase
    .from("notifications")
    .insert({
      workspace_id: input.workspaceId,
      message: input.message,
      type: input.type,
      read: false,
    })
    .select("*")
    .single();

  if (inserted.error) {
    throw new AppError(`Unable to create notification: ${inserted.error.message}`, {
      code: "SUPABASE_NOTIFICATION_INSERT_FAILED",
      status: 500,
    });
  }

  return mapNotification(inserted.data as Record<string, unknown>);
}

export async function upsertDailyWorkspaceSummary(input: {
  workspaceId: string;
  content: string;
}) {
  if (env().demoMode) {
    return demoStore.upsertWorkspaceSummary({
      id: `summary_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      kind: "daily",
      content: input.content,
      createdAt: formatStamp(new Date()),
    });
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase
    .from("workspace_summaries")
    .insert({
      workspace_id: input.workspaceId,
      kind: "daily",
      content: input.content,
    })
    .select("*")
    .single();

  if (inserted.error) {
    throw new AppError(`Unable to save workspace summary: ${inserted.error.message}`, {
      code: "SUPABASE_SUMMARY_INSERT_FAILED",
      status: 500,
    });
  }

  return mapWorkspaceSummary(inserted.data as Record<string, unknown>);
}

export async function acquireBackgroundJobLock(lockKey: string, ttlMinutes = 30) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  if (env().demoMode) {
    const snapshot = demoStore.getSnapshot();
    const existing = snapshot.notifications.find(
      (entry) =>
        entry.type === "background_lock" &&
        entry.message === lockKey &&
        ((parseMaybeDate(entry.createdAt)?.getTime() ?? 0) >
          Date.now() - ttlMinutes * 60 * 1000),
    );
    if (existing) {
      return false;
    }
    demoStore.addNotification({
      id: `lock_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: "system",
      message: lockKey,
      type: "background_lock",
      read: true,
      createdAt: expiresAt,
    });
    return true;
  }

  const supabase = getSupabaseAdmin();
  const existing = await supabase
    .from("background_job_locks")
    .select("*")
    .eq("lock_key", lockKey)
    .maybeSingle();

  if (existing.error) {
    throw new AppError(`Unable to read background lock: ${existing.error.message}`, {
      code: "SUPABASE_LOCK_READ_FAILED",
      status: 500,
    });
  }

  const lockedUntil = existing.data?.locked_until
    ? new Date(String(existing.data.locked_until))
    : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return false;
  }

  const response = await supabase.from("background_job_locks").upsert(
    {
      lock_key: lockKey,
      locked_until: expiresAt,
    },
    { onConflict: "lock_key" },
  );

  if (response.error) {
    throw new AppError(`Unable to acquire background lock: ${response.error.message}`, {
      code: "SUPABASE_LOCK_UPSERT_FAILED",
      status: 500,
    });
  }

  return true;
}

export async function releaseBackgroundJobLock(lockKey: string) {
  if (env().demoMode) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const response = await supabase
    .from("background_job_locks")
    .update({ locked_until: null })
    .eq("lock_key", lockKey);

  if (response.error) {
    throw new AppError(`Unable to release background lock: ${response.error.message}`, {
      code: "SUPABASE_LOCK_RELEASE_FAILED",
      status: 500,
    });
  }
}

export async function getWorkspaceIssueSummaryCounts(workspaceId: string) {
  const issues = await listWorkspaceIssues(workspaceId);
  return {
    leadsNeedingFollowUp: issues.filter((issue) =>
      issue.type.startsWith("lead_followup"),
    ).length,
    overdueTasks: issues.filter((issue) => issue.type === "task_overdue").length,
    pendingApprovals: issues.filter((issue) => issue.type === "approval_pending_stale").length,
  };
}

export async function listWorkspaceIssues(workspaceId: string): Promise<WorkspaceIssueRecord[]> {
  if (env().demoMode) {
    const snapshot = demoStore.getSnapshot(workspaceId);
    const now = Date.now();
    const issues: WorkspaceIssueRecord[] = [];

    for (const lead of snapshot.leads.filter((entry) => entry.workspaceId === workspaceId)) {
      if (!lead.nextFollowUpAtValue) {
        issues.push({
          type: "lead_followup_missing",
          linkedEntityId: lead.id,
          title: `Follow-up missing for ${lead.name}`,
          detail: `${lead.name} has no next follow-up date set.`,
          metadata: { leadId: lead.id, phone: lead.phone },
        });
      } else if (new Date(lead.nextFollowUpAtValue).getTime() <= now) {
        issues.push({
          type: "lead_followup_overdue",
          linkedEntityId: lead.id,
          title: `Follow-up overdue for ${lead.name}`,
          detail: `${lead.name} should already have been contacted again.`,
          metadata: { leadId: lead.id, phone: lead.phone },
        });
      }
    }

    for (const call of snapshot.callLogs.filter(
      (entry) => entry.workspaceId === workspaceId && entry.direction === "inbound",
    )) {
      const replied = snapshot.crmTimeline.some(
        (item) =>
          item.workspaceId === workspaceId &&
          item.type === "sms" &&
          item.leadId === call.leadId &&
          item.timestamp >= (call.createdAtValue ?? call.createdAt),
      );
      if (!replied) {
        issues.push({
          type: "missed_call_no_reply",
          linkedEntityId: call.id,
          title: "Missed call has no reply",
          detail: call.summary,
          metadata: { leadId: call.leadId ?? "", callId: call.id },
        });
      }
    }

    const recentActivity = [
      ...snapshot.callLogs.map((entry) => entry.createdAtValue ?? entry.createdAt),
      ...snapshot.crmTimeline.map((entry) => entry.timestamp),
    ]
      .map((value) => parseMaybeDate(value))
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    if (!recentActivity || recentActivity.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      issues.push({
        type: "workspace_inactive_24h",
        linkedEntityId: workspaceId,
        title: "No recent activity",
        detail: "This workspace has been quiet for over 24 hours.",
      });
    }

    return issues;
  }

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const staleApprovalBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const inactiveBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [leadsResponse, callsResponse, smsResponse, tasksResponse, approvalsResponse, auditResponse] =
    await Promise.all([
      supabase
        .from("leads")
        .select("id,full_name,phone,next_follow_up_at")
        .eq("workspace_id", workspaceId),
      supabase
        .from("call_logs")
        .select("id,lead_id,summary,created_at,direction,status")
        .eq("workspace_id", workspaceId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("sms_logs")
        .select("lead_id,created_at,direction")
        .eq("workspace_id", workspaceId)
        .eq("direction", "outbound"),
      supabase
        .from("tasks")
        .select("id,title,due_at,status")
        .eq("workspace_id", workspaceId),
      supabase
        .from("approvals")
        .select("id,action_type,recipient,created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .lt("created_at", staleApprovalBefore),
      supabase
        .from("audit_logs")
        .select("created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  const errors = [
    leadsResponse.error,
    callsResponse.error,
    smsResponse.error,
    tasksResponse.error,
    approvalsResponse.error,
    auditResponse.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new AppError(`Unable to inspect workspace issues: ${errors[0]?.message}`, {
      code: "SUPABASE_WORKSPACE_ISSUE_READ_FAILED",
      status: 500,
    });
  }

  const issues: WorkspaceIssueRecord[] = [];
  for (const row of leadsResponse.data ?? []) {
    const lead = row as Record<string, unknown>;
    if (!lead.next_follow_up_at) {
      issues.push({
        type: "lead_followup_missing",
        linkedEntityId: String(lead.id),
        title: `Follow-up missing for ${String(lead.full_name ?? "lead")}`,
        detail: `${String(lead.full_name ?? "Lead")} has no follow-up date set.`,
        metadata: { leadId: String(lead.id), phone: String(lead.phone ?? "") },
      });
    } else if (String(lead.next_follow_up_at) <= nowIso) {
      issues.push({
        type: "lead_followup_overdue",
        linkedEntityId: String(lead.id),
        title: `Follow-up overdue for ${String(lead.full_name ?? "lead")}`,
        detail: `${String(lead.full_name ?? "Lead")} is overdue for follow-up.`,
        metadata: { leadId: String(lead.id), phone: String(lead.phone ?? "") },
      });
    }
  }

  for (const row of callsResponse.data ?? []) {
    const call = row as Record<string, unknown>;
    const replied = (smsResponse.data ?? []).some((smsRow) => {
      const sms = smsRow as Record<string, unknown>;
      return (
        String(sms.lead_id ?? "") === String(call.lead_id ?? "") &&
        String(sms.created_at ?? "") >= String(call.created_at ?? "")
      );
    });
    if (!replied) {
      issues.push({
        type: "missed_call_no_reply",
        linkedEntityId: String(call.id),
        title: "Missed call has no reply",
        detail: String(call.summary ?? "Inbound call still needs a reply."),
        metadata: { leadId: String(call.lead_id ?? ""), callId: String(call.id) },
      });
    }
  }

  for (const row of tasksResponse.data ?? []) {
    const task = row as Record<string, unknown>;
    if (
      task.due_at &&
      String(task.status ?? "") !== "done" &&
      String(task.due_at) <= nowIso
    ) {
      issues.push({
        type: "task_overdue",
        linkedEntityId: String(task.id),
        title: `Task overdue: ${String(task.title ?? "Task")}`,
        detail: `${String(task.title ?? "Task")} is overdue.`,
      });
    }
  }

  for (const row of approvalsResponse.data ?? []) {
    const approval = row as Record<string, unknown>;
    issues.push({
      type: "approval_pending_stale",
      linkedEntityId: String(approval.id),
      title: `Approval pending too long`,
      detail: `${String(approval.action_type ?? "Approval")} for ${String(approval.recipient ?? "recipient")} has been pending over 2 hours.`,
    });
  }

  const latestAudit = (auditResponse.data ?? [])[0] as Record<string, unknown> | undefined;
  if (!latestAudit?.created_at || String(latestAudit.created_at) < inactiveBefore) {
    issues.push({
      type: "workspace_inactive_24h",
      linkedEntityId: workspaceId,
      title: "No recent activity",
      detail: "This workspace has had no logged activity in the last 24 hours.",
    });
  }

  return issues;
}

async function touchAutomationRun(automationId: string, lastRunAtValue: string) {
  if (env().demoMode) {
    demoStore.updateAutomation(automationId, {
      lastRunAt: formatStamp(lastRunAtValue),
      lastRunAtValue,
    });
    return;
  }

  const supabase = getSupabaseAdmin();
  const response = await supabase
    .from("automations")
    .update({ last_run_at: lastRunAtValue })
    .eq("id", automationId);

  if (response.error) {
    throw new AppError(`Unable to update automation run state: ${response.error.message}`, {
      code: "SUPABASE_AUTOMATION_UPDATE_FAILED",
      status: 500,
    });
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
  const approval = demoStore.createGeneratedApproval(
    workspaceId,
    title,
    recipient,
    message,
    reason,
    risk,
    type,
    metadata,
  );
  return {
    ...approval,
    id: crypto.randomUUID(),
  };
}

export function createGeneratedAutomation(
  workspaceId: string,
  name: string,
  trigger: string,
  actions: string[],
  options?: {
    description?: string;
    templateKey?: string;
    enabled?: boolean;
  },
) : Automation {
  return {
    ...demoStore.createGeneratedAutomation(workspaceId, name, trigger, actions),
    id: crypto.randomUUID(),
    description: options?.description ?? "",
    templateKey: options?.templateKey,
    enabled: options?.enabled ?? false,
    status: options?.enabled ? ("active" as const) : ("draft" as const),
  } satisfies Automation;
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
    description: automation.description ?? "",
    template_key: automation.templateKey ?? null,
    trigger_type: automation.trigger,
    trigger_config: {},
    actions: automation.actions,
    enabled: automation.enabled,
    last_run_at: automation.lastRunAtValue ?? null,
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
