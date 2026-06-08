import { NextResponse } from "next/server";
import { listPresetFiles } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";

// Reading the configured paths needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

/** List the pre-set database files the server is configured to open. */
export async function GET() {
  try {
    return NextResponse.json({ files: listPresetFiles() });
  } catch (err) {
    return errorResponse(err);
  }
}
