import { NextResponse } from "next/server";
import { commitUpload } from "@/src/features/files/uploads/commit";

export async function POST(request: Request) {
  const formData = await request.formData();
  const result = await commitUpload(formData);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400
  });
}
