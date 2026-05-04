import "server-only";

import {
  type Activity,
  type AgentResult,
  type Approval,
  type AuditLog,
  type Automation,
  type Contact,
  type Conversation,
  type CrmTimelineItem,
  type Lead,
  type Message,
  type Snapshot,
  type ScheduledJob,
  type TaskItem,
  type ToolCall,
  type Workspace,
  type IntegrationSetting,
} from "@/lib/types";

declare global {
  var __aegisSnapshot: Snapshot | undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function seedWorkspaces(): Workspace[] {
  return [
    {
      id: "ws_forklift",
      name: "Forklift Pro Solutions",
      industry: "Material handling",
      toneOfVoice: "Confident, reliable, straight-talking",
      services: ["Forklift hire", "Emergency repair", "Fleet servicing"],
      targetCustomers: ["Warehouses", "Factories", "Distribution centres"],
      twilioNumber: "+44 113 555 0181",
      openAiModel: "gpt-4.1-mini",
      crmProvider: "AEGIS CRM",
      emailProvider: "Connector placeholder",
      websiteProvider: "CMS placeholder",
      businessHours: "Mon-Fri, 08:00-18:00 Europe/London",
      approvalPolicy: "Calls, SMS, email, web and bulk edits require approval",
      voice: {
        name: "alloy",
        speed: 1,
        style: "Clear and sales-focused",
      },
    },
    {
      id: "ws_hamper",
      name: "Yorkshire Hamper Co.",
      industry: "Gift hampers",
      toneOfVoice: "Warm, premium, thoughtful",
      services: ["Corporate hampers", "Seasonal gifting", "Custom branded boxes"],
      targetCustomers: ["HR teams", "Estate agents", "Corporate buyers"],
      twilioNumber: "+44 113 555 0199",
      openAiModel: "gpt-4.1-mini",
      crmProvider: "AEGIS CRM",
      emailProvider: "Connector placeholder",
      websiteProvider: "Shop placeholder",
      businessHours: "Mon-Sat, 09:00-17:30 Europe/London",
      approvalPolicy: "Outbound messages and store updates require approval",
      voice: {
        name: "verse",
        speed: 1,
        style: "Friendly and polished",
      },
    },
  ];
}

function seedApprovals(): Approval[] {
  return [
    {
      id: "approval_1",
      workspaceId: "ws_forklift",
      type: "send_email",
      title: "Send email to 12 leads",
      recipient: "12 warm warehouse leads",
      message: "Follow up on their quote and offer a site visit.",
      reason: "AEGIS detected stale quotes with no reply in 4 days.",
      risk: "high",
      status: "pending",
      scheduledFor: "Today, 10:00 AM",
    },
    {
      id: "approval_2",
      workspaceId: "ws_forklift",
      type: "make_call",
      title: "Call John Smith",
      recipient: "John Smith",
      message: "Discuss the plumbing quote and next inspection slot.",
      reason: "Lead asked for a call back on the last estimate.",
      risk: "medium",
      status: "pending",
      scheduledFor: "Today, 11:30 AM",
      metadata: {
        phone: "+44 7712 345678",
        leadId: "lead_1",
      },
    },
    {
      id: "approval_3",
      workspaceId: "ws_forklift",
      type: "post_online",
      title: "Connect on LinkedIn",
      recipient: "5 new prospects",
      message: "Send personalised connection requests.",
      reason: "New inbound contacts match the target buying profile.",
      risk: "low",
      status: "pending",
      scheduledFor: "Today, 2:00 PM",
    },
  ];
}

function seedActivities(): Activity[] {
  return [
    {
      id: "activity_1",
      workspaceId: "ws_forklift",
      icon: "phone",
      title: "Missed call from +44 7712 345678",
      subtitle: "Auto SMS sent",
      timeLabel: "09:15 AM",
    },
    {
      id: "activity_2",
      workspaceId: "ws_forklift",
      icon: "mail",
      title: "Email sent to James Walker",
      subtitle: "Quote follow up",
      timeLabel: "08:42 AM",
    },
    {
      id: "activity_3",
      workspaceId: "ws_forklift",
      icon: "calendar",
      title: "Appointment scheduled",
      subtitle: "Tomorrow, 10:00 AM",
      timeLabel: "Yesterday",
    },
    {
      id: "activity_4",
      workspaceId: "ws_forklift",
      icon: "web",
      title: "Website updated",
      subtitle: "Homepage banner changed",
      timeLabel: "Yesterday",
    },
  ];
}

function seedTasks(): TaskItem[] {
  return [
    {
      id: "task_1",
      workspaceId: "ws_forklift",
      title: "Review missed-call automation draft",
      description: "Check the copy before enabling the SMS fallback.",
      dueLabel: "Today, 09:45",
      status: "today",
      linkedLeadId: "lead_1",
    },
    {
      id: "task_2",
      workspaceId: "ws_forklift",
      title: "Summarise CRM follow-ups before 12:00",
      description: "Prepare a quick outbound queue.",
      dueLabel: "Today, 11:00",
      status: "scheduled",
    },
    {
      id: "task_3",
      workspaceId: "ws_forklift",
      title: "Confirm quote callback window for John Smith",
      description: "Blocked until approval is given.",
      dueLabel: "Blocked by approval",
      status: "blocked",
      linkedLeadId: "lead_1",
    },
  ];
}

function seedContacts(): Contact[] {
  return [
    {
      id: "contact_1",
      workspaceId: "ws_forklift",
      name: "John Smith",
      phone: "+44 7712 345678",
      email: "john@northline.co.uk",
      company: "Northline Warehousing",
      status: "Quote sent",
      notes: "Prefers calls after 10am.",
      lastContactedAt: "Today, 09:15",
    },
    {
      id: "contact_2",
      workspaceId: "ws_forklift",
      name: "James Walker",
      phone: "+44 7700 100200",
      email: "james@metro-logistics.co.uk",
      company: "Metro Logistics",
      status: "Hot lead",
      notes: "Waiting on service contract pricing.",
      lastContactedAt: "Today, 08:42",
    },
    {
      id: "contact_3",
      workspaceId: "ws_hamper",
      name: "Hannah Reed",
      phone: "+44 7700 500900",
      email: "hannah@northbrook-estates.co.uk",
      company: "Northbrook Estates",
      status: "Proposal requested",
      notes: "Corporate gifting opportunity.",
      lastContactedAt: "Yesterday, 16:20",
    },
  ];
}

function seedLeads(): Lead[] {
  return [
    {
      id: "lead_1",
      workspaceId: "ws_forklift",
      contactId: "contact_1",
      name: "John Smith",
      company: "Northline Warehousing",
      phone: "+44 7712 345678",
      email: "john@northline.co.uk",
      source: "Inbound call",
      stage: "Quote sent",
      estimatedValue: 4200,
      nextFollowUpAt: "Tomorrow, 10:00",
      notes: "Needs quote follow-up for 3-ton fleet package.",
      lastTouch: "2 days ago",
      optOut: false,
    },
    {
      id: "lead_2",
      workspaceId: "ws_forklift",
      contactId: "contact_2",
      name: "James Walker",
      company: "Metro Logistics",
      phone: "+44 7700 100200",
      email: "james@metro-logistics.co.uk",
      source: "Website form",
      stage: "Hot lead",
      estimatedValue: 9800,
      nextFollowUpAt: "Today, 15:00",
      notes: "Requested service contract pricing.",
      lastTouch: "Today",
      optOut: false,
    },
    {
      id: "lead_3",
      workspaceId: "ws_hamper",
      contactId: "contact_3",
      name: "Hannah Reed",
      company: "Northbrook Estates",
      phone: "+44 7700 500900",
      email: "hannah@northbrook-estates.co.uk",
      source: "Referral",
      stage: "Proposal requested",
      estimatedValue: 2300,
      nextFollowUpAt: "Friday, 11:00",
      notes: "Corporate hamper proposal for estate agency onboarding.",
      lastTouch: "Yesterday",
      optOut: false,
    },
  ];
}

function seedCrmTimeline(): CrmTimelineItem[] {
  return [
    {
      id: "timeline_1",
      workspaceId: "ws_forklift",
      leadId: "lead_1",
      contactId: "contact_1",
      type: "sms",
      title: "SMS sent",
      detail: "Missed-call follow-up sent to John Smith.",
      timestamp: "09:15 AM",
    },
    {
      id: "timeline_2",
      workspaceId: "ws_forklift",
      leadId: "lead_1",
      contactId: "contact_1",
      type: "call",
      title: "Call scheduled",
      detail: "Callback approval drafted for John Smith.",
      timestamp: "09:30 AM",
    },
    {
      id: "timeline_3",
      workspaceId: "ws_forklift",
      leadId: "lead_2",
      contactId: "contact_2",
      type: "task",
      title: "Task created",
      detail: "Prepare pricing follow-up for Metro Logistics.",
      timestamp: "08:42 AM",
    },
  ];
}

function seedAutomations(): Automation[] {
  return [
    {
      id: "auto_1",
      workspaceId: "ws_forklift",
      name: "Missed call recovery",
      trigger: "Missed call received",
      actions: ["Send SMS", "Create lead task", "Notify owner"],
      enabled: true,
      status: "active",
    },
    {
      id: "auto_2",
      workspaceId: "ws_hamper",
      name: "Morning email digest",
      trigger: "Every weekday at 09:00",
      actions: ["Summarise urgent emails", "Create priority tasks"],
      enabled: false,
      status: "draft",
    },
  ];
}

function seedConversations(): Conversation[] {
  const baseMessages: Message[] = [
    {
      id: "msg_1",
      role: "assistant",
      content:
        "Morning Alex. Forklift Pro Solutions has 3 approvals pending, 4 leads waiting on follow-up, and 1 missed call that already triggered the SMS recovery flow.",
      timestamp: "09:16",
    },
  ];

  return [
    {
      id: "conv_1",
      workspaceId: "ws_forklift",
      title: "Daily command feed",
      messages: baseMessages,
    },
    {
      id: "conv_2",
      workspaceId: "ws_hamper",
      title: "Yorkshire Hamper Co. brief",
      messages: [
        {
          id: "msg_2",
          role: "assistant",
          content:
            "Yorkshire Hamper Co. has 2 corporate opportunities moving this week and no urgent issues in the queue.",
          timestamp: "08:05",
        },
      ],
    },
  ];
}

function seedToolCalls(): ToolCall[] {
  return [];
}

function seedIntegrationSettings(): IntegrationSetting[] {
  return [
    {
      id: "integration_openai",
      workspaceId: "ws_forklift",
      provider: "openai",
      kind: "ai",
      status: "demo",
      config: {
        model: "gpt-4.1-mini",
      },
    },
    {
      id: "integration_twilio",
      workspaceId: "ws_forklift",
      provider: "twilio",
      kind: "telephony",
      status: "demo",
      config: {
        phoneNumber: "+44 113 555 0181",
      },
    },
  ];
}

function seedScheduledJobs(): ScheduledJob[] {
  return [
    {
      id: "job_1",
      workspaceId: "ws_forklift",
      name: "Morning email summary",
      schedule: "0 9 * * 1-5",
      taskType: "summarize_email_placeholder",
      enabled: false,
    },
  ];
}

function createSnapshot(): Snapshot {
  return {
    user: {
      id: "user_alex",
      name: "Alex",
      avatar: "A",
    },
    currentWorkspaceId: "ws_forklift",
    workspaces: seedWorkspaces(),
    approvals: seedApprovals(),
    activities: seedActivities(),
    contacts: seedContacts(),
    tasks: seedTasks(),
    leads: seedLeads(),
    crmTimeline: seedCrmTimeline(),
    automations: seedAutomations(),
    conversations: seedConversations(),
    auditLogs: [],
    toolCalls: seedToolCalls(),
    integrationSettings: seedIntegrationSettings(),
    scheduledJobs: seedScheduledJobs(),
  };
}

function state(): Snapshot {
  if (!globalThis.__aegisSnapshot) {
    globalThis.__aegisSnapshot = createSnapshot();
  }

  return globalThis.__aegisSnapshot;
}

export function getSnapshot(currentWorkspaceId?: string) {
  const snapshot = structuredClone(state());
  if (currentWorkspaceId) {
    snapshot.currentWorkspaceId = currentWorkspaceId;
  }
  return snapshot;
}

export function setWorkspace(workspaceId: string) {
  const snapshot = state();
  snapshot.currentWorkspaceId = workspaceId;
  return getSnapshot();
}

export function appendConversationMessage(
  workspaceId: string,
  message: Message,
  response: Message,
) {
  const snapshot = state();
  let conversation = snapshot.conversations.find(
    (entry) => entry.workspaceId === workspaceId,
  );

  if (!conversation) {
    conversation = {
      id: id("conv"),
      workspaceId,
      title: "New conversation",
      messages: [],
    };
    snapshot.conversations.unshift(conversation);
  }

  conversation.messages.push(message, response);
  return getSnapshot();
}

export function addApproval(approval: Approval) {
  const snapshot = state();
  snapshot.approvals.unshift(approval);
  return approval;
}

export function resolveApproval(
  approvalId: string,
  decision: "approved" | "cancelled",
) {
  const snapshot = state();
  const approval = snapshot.approvals.find((entry) => entry.id === approvalId);

  if (!approval) {
    return null;
  }

  approval.status = decision;
  snapshot.activities.unshift({
    id: id("activity"),
    workspaceId: approval.workspaceId,
    icon: approval.type === "make_call" ? "phone" : "spark",
    title:
      decision === "approved"
        ? `${approval.title} approved`
        : `${approval.title} cancelled`,
    subtitle: approval.recipient,
    timeLabel: "Just now",
  });
  return approval;
}

export function addAutomation(automation: Automation) {
  const snapshot = state();
  snapshot.automations.unshift(automation);
  return automation;
}

export function addTask(task: TaskItem) {
  const snapshot = state();
  snapshot.tasks.unshift(task);
  return task;
}

export function addActivity(activity: Activity) {
  const snapshot = state();
  snapshot.activities.unshift(activity);
  return activity;
}

export function addLead(lead: Lead) {
  const snapshot = state();
  snapshot.leads.unshift(lead);
  return lead;
}

export function addContact(contact: Contact) {
  const snapshot = state();
  snapshot.contacts.unshift(contact);
  return contact;
}

export function addCrmTimelineItem(item: CrmTimelineItem) {
  const snapshot = state();
  snapshot.crmTimeline.unshift(item);
  return item;
}

export function addAuditLog(entry: Omit<AuditLog, "id" | "timestamp">) {
  const snapshot = state();
  snapshot.auditLogs.unshift({
    ...entry,
    id: id("audit"),
    timestamp: nowIso(),
  });
}

export function addToolCall(entry: Omit<ToolCall, "id" | "timestamp">) {
  const snapshot = state();
  snapshot.toolCalls.unshift({
    ...entry,
    id: id("tool"),
    timestamp: nowIso(),
  });
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
): Approval {
  return {
    id: id("approval"),
    workspaceId,
    title,
    recipient,
    message,
    reason,
    risk,
    type,
    status: "pending",
    scheduledFor: "Awaiting approval",
    metadata,
  };
}

export function createGeneratedAutomation(
  workspaceId: string,
  name: string,
  trigger: string,
  actions: string[],
): Automation {
  return {
    id: id("auto"),
    workspaceId,
    name,
    trigger,
    actions,
    enabled: false,
    status: "draft",
  };
}

export function createGeneratedTask(
  workspaceId: string,
  title: string,
  dueLabel: string,
  status: TaskItem["status"],
): TaskItem {
  return {
    id: id("task"),
    workspaceId,
    title,
    dueLabel,
    status,
  };
}

export function createGeneratedLead(
  workspaceId: string,
  name: string,
  phone: string,
): Lead {
  return {
    id: id("lead"),
    workspaceId,
    contactId: undefined,
    name,
    company: "Unassigned",
    phone,
    email: "pending@example.com",
    source: "Manual",
    stage: "New lead",
    estimatedValue: 0,
    nextFollowUpAt: "Not scheduled",
    notes: "",
    lastTouch: "Just now",
    optOut: false,
  };
}

export function workspaceById(workspaceId: string) {
  return state().workspaces.find((workspace) => workspace.id === workspaceId);
}

export function previewAgentAction(result: AgentResult) {
  if (result.pendingApproval) {
    addApproval(result.pendingApproval);
  }

  if (result.draftAutomation) {
    addAutomation(result.draftAutomation);
  }

  return getSnapshot();
}

export function getApproval(approvalId: string) {
  return state().approvals.find((approval) => approval.id === approvalId) ?? null;
}

export function updateApproval(
  approvalId: string,
  updates: Partial<Pick<Approval, "recipient" | "message" | "reason" | "metadata">>,
) {
  const approval = getApproval(approvalId);

  if (!approval) {
    return null;
  }

  if (typeof updates.recipient === "string") {
    approval.recipient = updates.recipient;
  }

  if (typeof updates.message === "string") {
    approval.message = updates.message;
  }

  if (typeof updates.reason === "string") {
    approval.reason = updates.reason;
  }

  if (updates.metadata) {
    approval.metadata = {
      ...(approval.metadata ?? {}),
      ...updates.metadata,
    };
  }

  approval.lastError = undefined;
  return approval;
}

export function markApprovalError(approvalId: string, message: string) {
  const approval = getApproval(approvalId);

  if (!approval) {
    return null;
  }

  approval.lastError = message;
  return approval;
}
