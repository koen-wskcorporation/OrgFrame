import type { Permission } from "@/modules/core/access";
import type { UploadAspectMode, UploadPurpose } from "@/modules/uploads/types";

export type UploadPurposeConfig = {
  bucket: "org-assets" | "account-assets" | "org-site-assets";
  maxSizeMB: number;
  allowedExtensions: string[];
  orgPermission?: Permission;
  allowPublicOrg?: boolean;
  defaultAspect?: UploadAspectMode;
};

const defaultImageExtensions = ["png", "jpg", "jpeg", "webp", "svg", "heic", "heif"];

export const uploadPurposeConfigByPurpose: Record<UploadPurpose, UploadPurposeConfig> = {
  "org-logo": {
    bucket: "org-assets",
    maxSizeMB: 10,
    allowedExtensions: defaultImageExtensions,
    orgPermission: "org.branding.write",
    defaultAspect: "free"
  },
  "org-icon": {
    bucket: "org-assets",
    maxSizeMB: 10,
    allowedExtensions: [...defaultImageExtensions, "ico"],
    orgPermission: "org.branding.write",
    defaultAspect: "square"
  },
  "program-cover": {
    bucket: "org-assets",
    maxSizeMB: 10,
    allowedExtensions: defaultImageExtensions,
    orgPermission: "programs.write",
    defaultAspect: "wide"
  },
  "profile-photo": {
    bucket: "account-assets",
    maxSizeMB: 5,
    allowedExtensions: defaultImageExtensions,
    defaultAspect: "square"
  },
  "birth-certificate": {
    bucket: "account-assets",
    maxSizeMB: 10,
    allowedExtensions: ["pdf", "png", "jpg", "jpeg", "webp", "heic", "heif"],
    defaultAspect: "free"
  },
  "site-hero": {
    bucket: "org-site-assets",
    maxSizeMB: 10,
    allowedExtensions: defaultImageExtensions,
    orgPermission: "org.pages.write",
    defaultAspect: "wide"
  },
  "site-block-image": {
    bucket: "org-site-assets",
    maxSizeMB: 10,
    allowedExtensions: defaultImageExtensions,
    orgPermission: "org.pages.write",
    defaultAspect: "wide"
  },
  attachment: {
    bucket: "org-site-assets",
    maxSizeMB: 10,
    allowedExtensions: ["pdf", "txt", "csv", "doc", "docx", "xls", "xlsx", ...defaultImageExtensions],
    orgPermission: "org.manage.read",
    defaultAspect: "free"
  }
};
