import { cache } from "react";
import { getFacilityMapManageDetail } from "@/src/features/facilities/actions";
import { listFacilitySpaceStatuses } from "@/src/features/facilities/db/queries";

export const getFacilityMapManageDetailCached = cache(getFacilityMapManageDetail);
export const listFacilitySpaceStatusesCached = cache(listFacilitySpaceStatuses);
