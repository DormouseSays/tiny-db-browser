import { NextResponse, type NextRequest } from "next/server";
import { openExisting } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Open a database file already on the server by id (reusing an open handle). */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    return NextResponse.json(await openExisting(id));
  } catch (err) {
    return errorResponse(err);
  }
}
