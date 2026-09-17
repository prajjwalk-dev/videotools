// GET /api/transcriptions — newest first.

import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { toListItem } from "@/lib/serialize";
import { store } from "@/lib/store";

export const GET = handle(async () => {
  const docs = await store().list();
  return NextResponse.json(docs.map(toListItem));
});
