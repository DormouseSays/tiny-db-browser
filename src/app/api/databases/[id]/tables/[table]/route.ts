import { NextResponse, type NextRequest } from "next/server";
import { mutate, read } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";
import { countRows, getTableSchema, listTables, rebuildTable } from "@/lib/sqlite";
import type { EditColumn } from "@/lib/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; table: string }> };

/** Get a table's column schema and current row count (for the table editor). */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id, table } = await params;
  try {
    const data = read(id, (db) => ({
      columns: getTableSchema(db, table),
      rowCount: countRows(db, table),
    }));
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

/** Rebuild a table (rename / change columns). Body: `{ name, columns }`. */
export async function PUT(request: NextRequest, { params }: Params) {
  const { id, table } = await params;
  try {
    const { name, columns } = (await request.json()) as {
      name?: string;
      columns?: EditColumn[];
    };
    if (!name || !Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json(
        { error: "A table name and at least one column are required." },
        { status: 400 },
      );
    }
    const tables = await mutate(id, (db) => {
      rebuildTable(db, table, name, columns);
      return listTables(db);
    });
    return NextResponse.json({ tables });
  } catch (err) {
    return errorResponse(err);
  }
}
