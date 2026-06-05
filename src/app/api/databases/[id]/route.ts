import { NextResponse, type NextRequest } from "next/server";
import { closeEntry } from "@/lib/server/registry";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Close an open database, releasing its handle (the file is kept). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  closeEntry(id);
  return new NextResponse(null, { status: 204 });
}
