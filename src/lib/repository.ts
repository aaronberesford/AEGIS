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
  type Contact,
  type Conversation,
  type CrmTimelineItem,
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
    notesResponse,
    smsResponse,
    callResponse,
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
    supabase.from("notes").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("sms_logs").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("call_logs").select("*").order("created_at", { ascending: false }).limit(50),
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
    notesResponse.error,
    smsResponse.error,
    callResponse.error,
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
      trigger: String(automationRow.trigger_type),
      actions: Array.isArray(automationRow.actions)
        ? automationRow.actions.map(String)
        : [],
      enabled: Boolean(automationRow.enabled),
      status: Boolean(automationRow.enabled) ? "active" : "draft",
    };
  });

  const activities = deriveActivities(toolCalls, approvals, auditLogs);
  const crmTimeline = deriveCrmTimeline({
    workspaceId: selectedWorkspaceId,
    notes: (notesResponse.data ?? []) as Array<Record<string, unknown>>,
    smsLogs: (smsResponse.data ?? []) as Array<Record<string, unknown>>,
    callLogs: (callResponse.data ?? []) as Array<Record<string, unknown>>,
    tasks,
    auditLogs,
  });
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
      nextFollowUpAt: input.nextFollowUpAt ?? "Not scheduled",
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
      lead.nextFollowUpAt = input.nextFollowUpAt;
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
      dueLabel: input.dueAt,
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
      timestamp: input.dueAt,
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
    dueLabel: input.dueAt,
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
}) {
  if (env().demoMode) {
    demoStore.addCrmTimelineItem({
      id: `timeline_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      type: "call",
      title: "Call made",
      detail: input.summary,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const supabase = getSupabaseAdmin();
  const inserted = await supabase.from("call_logs").insert({
    workspace_id: input.workspaceId,
    lead_id: input.leadId ?? null,
    direction: "outbound",
    status: input.status,
    summary: input.summary,
    outcome: input.outcome ?? null,
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
