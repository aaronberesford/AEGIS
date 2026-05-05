import "server-only";

import {
  acquireBackgroundJobLock,
  addAuditLog,
  createGeneratedApproval,
  createNotification,
  createSuggestion,
  getWorkspaceIssueSummaryCounts,
  listActiveWorkspaces,
  listWorkspaceIssues,
  previewAgentAction,
  releaseBackgroundJobLock,
  upsertDailyWorkspaceSummary,
  type WorkspaceIssueRecord,
} from "@/lib/repository";
import { workspaceById } from "@/lib/repository";
import {
  generateDailyWorkspaceSummary,
  generateWorkspaceSuggestionDrafts,
} from "@/lib/services/openai";
import { type Workspace } from "@/lib/types";

const MAX_AI_CALLS_PER_WORKSPACE_PER_RUN = 5;

function riskyActionTypeToApprovalType(actionType?: string) {
  switch (actionType) {
    case "send_sms":
      return "send_sms" as const;
    case "call_customer":
      return "make_call" as const;
    case "update_website":
      return "update_website" as const;
    case "bulk_update":
      return "bulk_crm_update" as const;
    default:
      return null;
  }
}

function approvalRiskFromPriority(priority: "low" | "medium" | "high") {
  return priority === "high" ? "high" : priority === "medium" ? "medium" : "low";
}

function buildApprovalDraft(
  workspaceId: string,
  issue: WorkspaceIssueRecord,
  draft: {
    title: string;
    suggestedAction: string;
    priority: "low" | "medium" | "high";
    actionType?: string;
  },
) {
  const approvalType = riskyActionTypeToApprovalType(draft.actionType);
  if (!approvalType) {
    return null;
  }

  const phone = typeof issue.metadata?.phone === "string" ? issue.metadata.phone : "";
  const leadId = typeof issue.metadata?.leadId === "string" ? issue.metadata.leadId : "";
  const recipient =
    typeof issue.metadata?.name === "string"
      ? issue.metadata.name
      : draft.actionType === "update_website"
        ? "Website"
        : draft.actionType === "bulk_update"
          ? "CRM records"
          : "Customer";

  if ((approvalType === "send_sms" || approvalType === "make_call") && !phone) {
    return null;
  }

  return createGeneratedApproval(
    workspaceId,
    draft.title,
    recipient,
    draft.suggestedAction,
    issue.detail,
    approvalRiskFromPriority(draft.priority),
    approvalType,
    {
      phone,
      leadId,
      issueType: issue.type,
    },
  );
}

async function persistSuggestionSet(
  workspace: Workspace,
  issues: WorkspaceIssueRecord[],
  mode: "check" | "deep_scan",
) {
  if (issues.length === 0) {
    return { createdSuggestions: 0, createdApprovals: 0 };
  }

  const drafts = (await generateWorkspaceSuggestionDrafts({
    workspace,
    issues,
    mode,
  })).slice(0, MAX_AI_CALLS_PER_WORKSPACE_PER_RUN);

  let createdSuggestions = 0;
  let createdApprovals = 0;
  const usedIssueIds = new Set<string>();

  for (const draft of drafts) {
    const issue =
      issues.find(
        (candidate) =>
          candidate.type === draft.issueType &&
          !usedIssueIds.has(`${candidate.type}:${candidate.linkedEntityId ?? candidate.title}`),
      ) ?? issues.find((candidate) => !usedIssueIds.has(`${candidate.type}:${candidate.linkedEntityId ?? candidate.title}`));

    if (!issue) {
      continue;
    }

    usedIssueIds.add(`${issue.type}:${issue.linkedEntityId ?? issue.title}`);

    await createSuggestion({
      workspaceId: workspace.id,
      type: issue.type,
      title: draft.title,
      description: draft.description,
      suggestedAction: draft.suggestedAction,
      priority: draft.priority,
      linkedEntityId: issue.linkedEntityId,
    });
    createdSuggestions += 1;

    await createNotification({
      workspaceId: workspace.id,
      type: "suggestion_created",
      message: `New ${draft.priority} suggestion: ${draft.title}`,
    });

    const approval = buildApprovalDraft(workspace.id, issue, draft);
    if (approval) {
      await previewAgentAction({
        message: "",
        actionCards: [],
        pendingApproval: approval,
      });
      createdApprovals += 1;
      await createNotification({
        workspaceId: workspace.id,
        type: "approval_created",
        message: `Approval draft ready: ${approval.title}`,
      });
    }
  }

  await addAuditLog({
    workspaceId: workspace.id,
    userId: "user_alex",
    action: mode === "check" ? "background_workspace_check" : "background_deep_scan",
    input: JSON.stringify(issues),
    output: JSON.stringify({ createdSuggestions, createdApprovals }),
    approvalStatus: createdApprovals > 0 ? "pending" : "not_required",
  });

  return { createdSuggestions, createdApprovals };
}

export async function checkWorkspace(workspaceId: string, mode: "check" | "deep_scan" = "check") {
  const workspace = await workspaceById(workspaceId);
  if (!workspace) {
    return { workspaceId, issuesFound: 0, createdSuggestions: 0, createdApprovals: 0 };
  }

  const issues = await listWorkspaceIssues(workspaceId);
  console.log(`[AEGIS cron] ${workspace.name}: found ${issues.length} issues`);

  if (issues.length === 0) {
    return { workspaceId, issuesFound: 0, createdSuggestions: 0, createdApprovals: 0 };
  }

  const result = await persistSuggestionSet(workspace, issues, mode);
  console.log(
    `[AEGIS cron] ${workspace.name}: created ${result.createdSuggestions} suggestions and ${result.createdApprovals} approvals`,
  );
  return {
    workspaceId,
    issuesFound: issues.length,
    createdSuggestions: result.createdSuggestions,
    createdApprovals: result.createdApprovals,
  };
}

export async function runWorkspaceChecks() {
  console.log("[AEGIS cron] Running workspace checks...");
  const lockAcquired = await acquireBackgroundJobLock("workspace_checks", 110);
  if (!lockAcquired) {
    console.log("[AEGIS cron] Workspace checks skipped because a lock is active.");
    return { processed: 0, skipped: true, results: [] as Array<unknown> };
  }

  try {
    const workspaces = await listActiveWorkspaces();
    const results = [];
    for (const workspace of workspaces) {
      results.push(await checkWorkspace(workspace.id, "check"));
    }
    return { processed: results.length, skipped: false, results };
  } finally {
    await releaseBackgroundJobLock("workspace_checks");
  }
}

export async function runDeepWorkspaceScan() {
  console.log("[AEGIS cron] Running deep workspace scan...");
  const lockAcquired = await acquireBackgroundJobLock("deep_workspace_scan", 350);
  if (!lockAcquired) {
    console.log("[AEGIS cron] Deep scan skipped because a lock is active.");
    return { processed: 0, skipped: true, results: [] as Array<unknown> };
  }

  try {
    const workspaces = await listActiveWorkspaces();
    const results = [];
    for (const workspace of workspaces) {
      results.push(await checkWorkspace(workspace.id, "deep_scan"));
    }
    return { processed: results.length, skipped: false, results };
  } finally {
    await releaseBackgroundJobLock("deep_workspace_scan");
  }
}

export async function runDailySummary() {
  console.log("[AEGIS cron] Running daily summary...");
  const lockAcquired = await acquireBackgroundJobLock("daily_summary", 90);
  if (!lockAcquired) {
    console.log("[AEGIS cron] Daily summary skipped because a lock is active.");
    return { processed: 0, skipped: true, results: [] as Array<unknown> };
  }

  try {
    const workspaces = await listActiveWorkspaces();
    const results = [];
    for (const workspace of workspaces) {
      const counts = await getWorkspaceIssueSummaryCounts(workspace.id);
      const content = await generateDailyWorkspaceSummary({
        workspace,
        ...counts,
      });
      await upsertDailyWorkspaceSummary({
        workspaceId: workspace.id,
        content,
      });
      await createNotification({
        workspaceId: workspace.id,
        type: "daily_summary",
        message: "Daily AEGIS summary is ready.",
      });
      await addAuditLog({
        workspaceId: workspace.id,
        userId: "user_alex",
        action: "background_daily_summary",
        input: JSON.stringify(counts),
        output: content,
        approvalStatus: "not_required",
      });
      results.push({ workspaceId: workspace.id, ...counts });
    }
    return { processed: results.length, skipped: false, results };
  } finally {
    await releaseBackgroundJobLock("daily_summary");
  }
}
