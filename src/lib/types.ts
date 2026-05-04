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
  dueLabel: string;
  status: "today" | "scheduled" | "blocked" | "done";
};

export type Lead = {
  id: string;
  workspaceId: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  stage: string;
  lastTouch: string;
  optOut: boolean;
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
  tasks: TaskItem[];
  leads: Lead[];
  automations: Automation[];
  conversations: Conversation[];
  auditLogs: AuditLog[];
};

export type AgentResult = {
  message: string;
  actionCards: ActionCard[];
  pendingApproval?: Approval;
  draftAutomation?: Automation;
  transcript?: string;
};
