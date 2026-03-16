"use client";

import { useContext } from "react";
import { OrderPanelContext } from "@/modules/orders/OrderPanelProvider";

export function useOrderPanel() {
  const context = useContext(OrderPanelContext);

  if (!context) {
    throw new Error("useOrderPanel must be used within OrderPanelProvider.");
  }

  return context;
}
