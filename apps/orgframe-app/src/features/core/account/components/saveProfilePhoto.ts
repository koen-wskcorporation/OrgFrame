import { updateAccountDetailsAction } from "@/src/features/core/account/actions";
import { uploadAccountImage } from "@/src/features/files/uploads/uploadAccountImage";
import type { ImageCropResult } from "@/src/features/files/uploads/ImageCropDialog";

export async function saveProfilePhoto(result: ImageCropResult) {
  const asset = await uploadAccountImage({
    file: result.file,
    purpose: "profile-photo",
    crop: result.crop,
    width: result.width,
    height: result.height
  });

  const saveResult = await updateAccountDetailsAction({ avatarPath: asset.path });
  if (!saveResult.ok) {
    throw new Error(saveResult.error || "Could not save profile picture.");
  }
}
