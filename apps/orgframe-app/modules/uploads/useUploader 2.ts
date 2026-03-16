"use client";

import { useContext } from "react";
import { UploaderContext } from "@/modules/uploads/UploadProvider";

export function useUploader() {
  const context = useContext(UploaderContext);

  if (!context) {
    throw new Error("useUploader must be used within UploadProvider.");
  }

  return context;
}
