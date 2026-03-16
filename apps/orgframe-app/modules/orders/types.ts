export type OrderPanelOpenInput = {
  orgSlug: string;
  orderId?: string;
  sourceRef?: string;
};

export type OrderPanelOrder = {
  id: string;
  sourceOrderId: string;
  sourceOrderNo: string | null;
  sourcePaymentStatus: string | null;
  orderStatus: string | null;
  orderDate: string | null;
  totalAmount: number | null;
  totalPaidAmount: number | null;
  balanceAmount: number | null;
  billingFirstName: string | null;
  billingLastName: string | null;
  billingAddress: string | null;
  metadataJson: Record<string, unknown>;
};

export type OrderPanelItem = {
  id: string;
  sourceLineKey: string;
  description: string | null;
  sourceProgramName: string | null;
  sourceDivisionName: string | null;
  sourceTeamName: string | null;
  amount: number | null;
  amountPaid: number | null;
  balanceAmount: number | null;
  metadataJson: Record<string, unknown>;
};

export type OrderPanelPayment = {
  id: string;
  sourcePaymentKey: string;
  paymentStatus: string | null;
  paymentDate: string | null;
  paymentAmount: number | null;
  paidRegistrationFee: number | null;
  paidCcFee: number | null;
  metadataJson: Record<string, unknown>;
};

export type OrderPanelData = {
  order: OrderPanelOrder;
  items: OrderPanelItem[];
  payments: OrderPanelPayment[];
};

export type OrderPanelResult =
  | {
      ok: true;
      data: OrderPanelData;
    }
  | {
      ok: false;
      error: string;
    };

export type OrderPanelContextValue = {
  openOrderPanel: (input: OrderPanelOpenInput) => Promise<void>;
};
