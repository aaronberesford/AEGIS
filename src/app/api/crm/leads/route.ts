import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { createLeadRecord, findCrmMatches } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      name?: string;
      phone?: string;
      email?: string;
      source?: string;
      status?: string;
      estimatedValue?: number;
      nextFollowUpAt?: string;
      company?: string;
    };

    if (!body.workspaceId || !body.name || !body.phone || !body.email || !body.source) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const lead = await createLeadRecord({
      workspaceId: body.workspaceId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      source: body.source,
      status: body.status,
      estimatedValue: body.estimatedValue,
      nextFollowUpAt: body.nextFollowUpAt,
      company: body.company,
    });

    return NextResponse.json({ lead });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const query = searchParams.get("query");

    if (!workspaceId || !query) {
      return NextResponse.json({ error: "workspaceId and query are required" }, { status: 400 });
    }

    return NextResponse.json(await findCrmMatches(workspaceId, query));
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
