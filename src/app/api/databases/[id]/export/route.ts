import { NextResponse, type NextRequest } from "next/server";
import { requireEntry } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Download the current bytes of an open database as a SQLite file. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const entry = requireEntry(id);
    const bytes = await entry.engine.exportImage();
    // Strip quotes from the filename so they can't break the header.
    const filename = entry.name.replace(/["\\]/g, "");
    return new NextResponse(new Blob([bytes as BlobPart]), {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
