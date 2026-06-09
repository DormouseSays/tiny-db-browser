import { NextResponse, type NextRequest } from "next/server";
import { requireEngine } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";
import type { SqlValue } from "@/lib/schema";
import { decodeValue, encodeRow, encodeValue, type WireValue } from "@/lib/wire";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; table: string }> };

/** Decode a `{ column: WireValue }` map of incoming values into SqlValues. */
function decodeValues(values: Record<string, WireValue>): Record<string, SqlValue> {
  const decoded: Record<string, SqlValue> = {};
  for (const [column, value] of Object.entries(values)) {
    decoded[column] = decodeValue(value);
  }
  return decoded;
}

/** Read a page of rows, with each row's rowid, for the grid. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id, table } = await params;
  try {
    const data = await requireEngine(id).readTable(table);
    return NextResponse.json({
      columns: data.columns,
      rows: data.rows.map(encodeRow),
      rowIds: data.rowIds.map(encodeValue),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Insert a new row. Body: `{ values: { column: WireValue } }`. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id, table } = await params;
  try {
    const { values } = (await request.json()) as {
      values?: Record<string, WireValue>;
    };
    await requireEngine(id).insertRow(table, decodeValues(values ?? {}));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Update a row by rowid. Body: `{ rowId: WireValue, values: { column: WireValue } }`. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id, table } = await params;
  try {
    const { rowId, values } = (await request.json()) as {
      rowId?: WireValue;
      values?: Record<string, WireValue>;
    };
    if (rowId === undefined) {
      return NextResponse.json({ error: "Missing rowId." }, { status: 400 });
    }
    await requireEngine(id).updateRow(
      table,
      decodeValue(rowId),
      decodeValues(values ?? {}),
    );
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Delete a row by rowid. Body: `{ rowId: WireValue }`. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id, table } = await params;
  try {
    const { rowId } = (await request.json()) as { rowId?: WireValue };
    if (rowId === undefined) {
      return NextResponse.json({ error: "Missing rowId." }, { status: 400 });
    }
    await requireEngine(id).deleteRow(table, decodeValue(rowId));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
