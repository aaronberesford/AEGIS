export type Workspace = {
  id: string;
  name: string;
  industry: string;
  toneOfVoice: string;
  services: string[];
  targetCustomers: string[];
  twilioNumber: string;
  openAiModel: string;
  crmProvider: string;
  emailProvider: string;
  websiteProvider: string;
  businessHours: string;
  approvalPolicy: string;
  voice: {
    name: string;
    speed: number;
    style: string;
  };
};

export type ApprovalRisk = "low" | "medium" | "high";
export type ApprovalType =
  | "send_sms"
  | "send_email"
  | "make_call"
  | "bulk_crm_update"
  | "post_online"
  | "update_website";

export type Approval = {
  id: string;
  workspaceId: string;
  type: ApprovalType;
  title: string;
  recipient: string;
  message: string;
  reason: string;
  risk: ApprovalRisk;
  status: "pending" | "approved" | "cancelled";
  scheduledFor: string;
  metadata?: Record<string, string>;
  lastError?: string;
};

export type Activity = {
  id: string;
  workspaceId: string;
  icon: "phone" | "mail" | "calendar" | "web" | "message" | "spark";
  title: string;
  subtitle: string;
  timeLabel: string;
};

export type TaskItem = {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  dueLabel: string;
  status: "today" | "scheduled" | "blocked" | "done";
  linkedLeadId?: string;
  linkedContactId?: string;
};

export type Contact = {
  id: string;
  workspaceId: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  status: string;
  notes: string;
  lastContactedAt: string;
};

export type Lead = {
  id: string;
  workspaceId: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  source: string;
  stage: string;
  estimatedValue: number;
  nextFollowUpAt: string;
  notes: string;
  contactId?: string;
  lastTouch: string;
  optOut: boolean;
};

export type CrmTimelineItem = {
  id: string;
  workspaceId: string;
  leadId?: string;
  contactId?: string;
  type: "sms" | "call" | "note" | "summary" | "task";
  title: string;
  detail: string;
  timestamp: string;
};

export type Automation = {
  id: string;
  workspaceId: string;
  name: string;
  trigger: string;
  actions: string[];
  enabled: boolean;
  status: "draft" | "active";
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export type Conversation = {
  id: string;
  workspaceId: string;
  title: string;
  messages: Message[];
};

export type ActionCard = {
  id: string;
  kind: "approval" | "task" | "automation" | "note";
  title: string;
  description: string;
};

export type AuditLog = {
  id: string;
  workspaceId: string;
  userId: string;
  action: string;
  input: string;
  output: string;
  approvalStatus: string;
  timestamp: string;
  error?: string;
};

export type ToolCall = {
  id: string;
  workspaceId: string;
  tool: string;
  status: "success" | "error";
  input: string;
  output: string;
  timestamp: string;
  error?: string;
};

export type IntegrationSetting = {
  id: string;
  workspaceId: string;
  provider: string;
  kind: string;
  status: string;
  config: Record<string, string | number | boolean | null>;
};

export type ScheduledJob = {
  id: string;
  workspaceId: string;
  name: string;
  schedule: string;
  taskType: string;
  enabled: boolean;
};

export type Snapshot = {
  user: {
    id: string;
    name: string;
    avatar: string;
  };
  currentWorkspaceId: string;
  workspaces: Workspace[];
  approvals: Approval[];
  activities: Activity[];
  contacts: Contact[];
  tasks: TaskItem[];
  leads: Lead[];
  crmTimeline: CrmTimelineItem[];
  automations: Automation[];
  conversations: Conversation[];
  auditLogs: AuditLog[];
  toolCalls: ToolCall[];
  integrationSettings: IntegrationSetting[];
  scheduledJobs: ScheduledJob[];
};

export type AgentResult = {
  message: string;
  actionCards: ActionCard[];
  pendingApproval?: Approval;
  draftAutomation?: Automation;
  transcript?: string;
};
