import type { CommitUploadResult, UploadCrop, UploadPurpose } from "@/src/features/files/uploads/types";

export type UploadAccountImageOptions = {
  file: File;
  purpose: UploadPurpose;
  crop?: UploadCrop;
  width?: number;
  height?: number;
};

export async function uploadAccountImage(options: UploadAccountImageOptions) {
  const formData = new FormData();
  formData.append(
    "request",
    JSON.stringify({
      kind: "account",
      purpose: options.purpose,
      crop: options.crop,
      width: options.width,
      height: options.height
    })
  );
  formData.append("file", options.file);

  const response = await fetch("/api/uploads/commit", { method: "POST", body: formData });
  const result = (await response.json()) as CommitUploadResult;

  if (!result.ok) {
    throw new Error(result.error || "Upload failed.");
  }

  return result.asset;
}
