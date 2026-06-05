import { NextResponse, type NextRequest } from "next/server";
import { openUploaded } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";

// SQLite + filesystem work requires the Node.js runtime (not Edge).
export const runtime = "nodejs";

/** Upload a SQLite file. The body is multipart form data with a `file` field. */
export async function POST(request: NextRequest) {
  let file: FormDataEntryValue | null;
  try {
    const form = await request.formData();
    file = form.get("file");
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file was uploaded." },
      { status: 400 },
    );
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = await openUploaded(file.name, bytes);
    return NextResponse.json(info);
  } catch (err) {
    return errorResponse(err);
  }
}
