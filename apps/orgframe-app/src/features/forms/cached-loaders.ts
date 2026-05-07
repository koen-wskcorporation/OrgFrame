import { cache } from "react";
import { getFormById } from "@/src/features/forms/db/queries";

export const getFormByIdCached = cache(getFormById);
