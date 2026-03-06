"use server";

import { commitUpload } from "@/modules/uploads/commit";
import type { CommitUploadResult } from "@/modules/uploads/types";

export async function commitUploadAction(formData: FormData): Promise<CommitUploadResult> {
  return commitUpload(formData);
}
