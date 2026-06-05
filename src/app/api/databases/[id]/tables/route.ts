import { NextResponse, type NextRequest } from "next/server";
import { withDatabase } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";
import { createTable, listTables } from "@/lib/sqlite";
import type { ColumnDefinition } from "@/lib/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** List the user tables in a database. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    return NextResponse.json({ tables: withDatabase(id, listTables) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Create a new table. Body: `{ name, columns }`. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const { name, columns } = (await request.json()) as {
      name?: string;
      columns?: ColumnDefinition[];
    };
    if (!name || !Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json(
        { error: "A table name and at least one column are required." },
        { status: 400 },
      );
    }
    const tables = withDatabase(id, (db) => {
      createTable(db, name, columns);
      return listTables(db);
    });
    return NextResponse.json({ tables });
  } catch (err) {
    return errorResponse(err);
  }
}
