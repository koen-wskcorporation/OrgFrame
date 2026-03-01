"use client";

import { createContext, useCallback, useMemo, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { commitUploadAction } from "@/modules/uploads/actions";
import { defaultUploadCrop, fileMatchesAccept, isImageFile, readImageDimensions } from "@/modules/uploads/client-utils";
import { uploadPurposeConfigByPurpose } from "@/modules/uploads/config";
import { ImagePositionDialog } from "@/modules/uploads/ImagePositionDialog";
import { UploadDialog } from "@/modules/uploads/UploadDialog";
import type { OpenUploadOptions, UploadedAsset, UploadCrop } from "@/modules/uploads/types";

type UploaderContextValue = {
  openUpload: (options: OpenUploadOptions) => Promise<UploadedAsset | null>;
};

type UploadStep = "pick" | "position";

type ActiveUploadRequest = {
  id: string;
  options: OpenUploadOptions;
  step: UploadStep;
  file: File | null;
  imageDimensions: {
    width: number;
    height: number;
  } | null;
  crop: UploadCrop;
  error: string | null;
  resolve: (asset: UploadedAsset | null) => void;
};

const UploaderContext = createContext<UploaderContextValue | null>(null);

function defaultUploadTitle(options: OpenUploadOptions) {
  switch (options.purpose) {
    case "org-logo":
      return "Upload Organization Logo";
    case "org-icon":
      return "Upload Organization Icon";
    case "profile-photo":
      return "Upload Profile Photo";
    case "site-hero":
      return "Upload Hero Image";
    case "site-block-image":
      return "Upload Block Image";
    default:
      return "Upload File";
  }
}

function defaultUploadDescription(options: OpenUploadOptions) {
  const config = uploadPurposeConfigByPurpose[options.purpose];
  return `Select a file to upload. Maximum size ${config.maxSizeMB}MB.`;
}

function shouldSkipImagePositionStep(purpose: OpenUploadOptions["purpose"]) {
  return purpose.includes("logo") || purpose.includes("icon");
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [activeRequest, setActiveRequest] = useState<ActiveUploadRequest | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const openUpload = useCallback((options: OpenUploadOptions) => {
    return new Promise<UploadedAsset | null>((resolve) => {
      setActiveRequest((current) => {
        current?.resolve(null);

        return {
          id: crypto.randomUUID(),
          options,
          step: "pick",
          file: null,
          imageDimensions: null,
          crop: defaultUploadCrop(options.initialCrop),
          error: null,
          resolve
        };
      });
    });
  }, []);

  const closeActiveRequest = useCallback(() => {
    setActiveRequest((current) => {
      current?.resolve(null);
      return null;
    });
    setIsSaving(false);
  }, []);

  const clearSelectedFile = useCallback(() => {
    setActiveRequest((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        file: null,
        imageDimensions: null,
        crop: defaultUploadCrop(current.options.initialCrop),
        error: null
      };
    });
  }, []);

  const setErrorMessage = useCallback((message: string | null) => {
    setActiveRequest((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        error: message
      };
    });
  }, []);

  const saveAsset = useCallback(async () => {
    if (!activeRequest?.file) {
      return;
    }

    const requestSnapshot = activeRequest;
    const selectedFile = requestSnapshot.file;

    if (!selectedFile) {
      return;
    }

    const requestId = requestSnapshot.id;

    setIsSaving(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.set("file", selectedFile);
    formData.set(
      "request",
      JSON.stringify({
        kind: requestSnapshot.options.kind,
        purpose: requestSnapshot.options.purpose,
        orgSlug: requestSnapshot.options.orgSlug,
        constraints: requestSnapshot.options.constraints,
        crop:
          isImageFile(selectedFile) && !shouldSkipImagePositionStep(requestSnapshot.options.purpose)
            ? requestSnapshot.crop
            : undefined,
        width: requestSnapshot.imageDimensions?.width,
        height: requestSnapshot.imageDimensions?.height
      })
    );

    const result = await commitUploadAction(formData);
    setIsSaving(false);

    if (!result.ok) {
      setActiveRequest((current) => {
        if (!current || current.id !== requestId) {
          return current;
        }

        return {
          ...current,
          error: result.error
        };
      });
      toast({
        title: "Upload failed",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    requestSnapshot.resolve(result.asset);
    setActiveRequest((current) => {
      if (!current || current.id !== requestId) {
        return current;
      }

      return null;
    });
  }, [activeRequest, setErrorMessage, toast]);

  const setStep = useCallback((nextStep: UploadStep) => {
    setActiveRequest((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        step: nextStep,
        error: null
      };
    });
  }, []);

  const selectFile = useCallback(async (file: File) => {
    if (!activeRequest) {
      return;
    }

    const requestId = activeRequest.id;
    const config = uploadPurposeConfigByPurpose[activeRequest.options.purpose];
    const maxSizeMb = Math.min(config.maxSizeMB, activeRequest.options.constraints?.maxSizeMB ?? config.maxSizeMB);
    const accept = activeRequest.options.constraints?.accept ?? config.allowedExtensions.map((entry) => `.${entry}`).join(",");

    if (!fileMatchesAccept(file, accept)) {
      setErrorMessage("This file type is not allowed.");
      return;
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      setErrorMessage(`File must be ${maxSizeMb}MB or smaller.`);
      return;
    }

    const image = isImageFile(file);
    const imageDimensions = image ? await readImageDimensions(file) : null;
    const canAdjustPosition = image && Boolean(imageDimensions) && !shouldSkipImagePositionStep(activeRequest.options.purpose);

    setActiveRequest((current) => {
      if (!current || current.id !== requestId) {
        return current;
      }

      return {
        ...current,
        file,
        imageDimensions,
        step: canAdjustPosition ? "position" : "pick",
        crop: image ? defaultUploadCrop(current.options.initialCrop) : current.crop,
        error: null
      };
    });
  }, [activeRequest, setErrorMessage]);

  const contextValue = useMemo<UploaderContextValue>(() => {
    return {
      openUpload
    };
  }, [openUpload]);

  const activeConfig = activeRequest ? uploadPurposeConfigByPurpose[activeRequest.options.purpose] : null;
  const activeAccept = activeRequest
    ? activeRequest.options.constraints?.accept ?? activeConfig?.allowedExtensions.map((entry) => `.${entry}`).join(",")
    : undefined;
  const activeMaxSize = activeRequest
    ? Math.min(activeConfig?.maxSizeMB ?? 10, activeRequest.options.constraints?.maxSizeMB ?? activeConfig?.maxSizeMB ?? 10)
    : undefined;
  const activeAspect = activeRequest?.options.constraints?.aspect ?? activeConfig?.defaultAspect ?? "free";
  const uploadDialogTitle = activeRequest ? activeRequest.options.title ?? defaultUploadTitle(activeRequest.options) : "Upload File";
  const uploadDialogDescription = activeRequest
    ? activeRequest.options.description ?? defaultUploadDescription(activeRequest.options)
    : "Select a file to upload.";
  const isCurrentFileImage = activeRequest?.file ? isImageFile(activeRequest.file) : false;
  const canAdjustCurrentImagePosition =
    isCurrentFileImage && activeRequest ? !shouldSkipImagePositionStep(activeRequest.options.purpose) : false;

  return (
    <UploaderContext.Provider value={contextValue}>
      {children}

      <UploadDialog
        accept={activeAccept}
        canSave={Boolean(activeRequest?.file)}
        description={uploadDialogDescription}
        error={activeRequest?.step === "pick" ? activeRequest.error : null}
        file={activeRequest?.file ?? null}
        isSaving={isSaving}
        maxSizeMB={activeMaxSize}
        onClearSelection={clearSelectedFile}
        onClose={closeActiveRequest}
        onSave={async () => {
          if (!activeRequest?.file) {
            return;
          }

          if (isImageFile(activeRequest.file) && canAdjustCurrentImagePosition) {
            setStep("position");
            return;
          }

          await saveAsset();
        }}
        onSelectFile={selectFile}
        open={activeRequest?.step === "pick"}
        recommendedPx={activeRequest?.options.constraints?.recommendedPx}
        saveLabel={canAdjustCurrentImagePosition ? "Continue" : "Save"}
        title={uploadDialogTitle}
      />

      <ImagePositionDialog
        aspect={activeAspect}
        crop={activeRequest?.crop ?? defaultUploadCrop()}
        description="Adjust focal point and zoom before saving."
        dimensions={activeRequest?.imageDimensions}
        error={activeRequest?.step === "position" ? activeRequest.error : null}
        file={activeRequest?.file ?? null}
        isSaving={isSaving}
        onBack={() => setStep("pick")}
        onChangeCrop={(nextCrop) => {
          setActiveRequest((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              crop: nextCrop
            };
          });
        }}
        onClose={closeActiveRequest}
        onReset={() => {
          setActiveRequest((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              crop: defaultUploadCrop(current.options.initialCrop)
            };
          });
        }}
        onSave={saveAsset}
        open={activeRequest?.step === "position"}
        recommendedPx={activeRequest?.options.constraints?.recommendedPx}
        title="Position Image"
      />
    </UploaderContext.Provider>
  );
}

export { UploaderContext };
