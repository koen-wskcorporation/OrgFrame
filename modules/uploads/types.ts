export type UploadAspectMode = "wide" | "square" | "free" | number;

export type UploadCrop = {
  focalX: number;
  focalY: number;
  zoom: number;
};

export type UploadConstraints = {
  accept?: string;
  maxSizeMB?: number;
  aspect?: UploadAspectMode;
  recommendedPx?: {
    w: number;
    h: number;
  };
  allowMultiple?: boolean;
};

export type UploadKind = "org" | "account" | "public-org";

export type UploadPurpose =
  | "org-logo"
  | "org-icon"
  | "program-cover"
  | "profile-photo"
  | "birth-certificate"
  | "site-hero"
  | "site-block-image"
  | "attachment";

export type OpenUploadOptions = {
  kind: UploadKind;
  purpose: UploadPurpose;
  orgSlug?: string;
  constraints?: UploadConstraints;
  initialCrop?: UploadCrop;
  title?: string;
  description?: string;
};

export type UploadedAsset = {
  id: string;
  bucket: string;
  path: string;
  publicUrl: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  crop?: UploadCrop;
};

export type CommitUploadRequest = {
  kind: UploadKind;
  purpose: UploadPurpose;
  orgSlug?: string;
  constraints?: UploadConstraints;
  crop?: UploadCrop;
  width?: number;
  height?: number;
};

export type CommitUploadResult =
  | {
      ok: true;
      asset: UploadedAsset;
    }
  | {
      ok: false;
      error: string;
    };
