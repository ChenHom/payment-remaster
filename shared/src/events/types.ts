export type EventBase = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  trace_id?: string;
  payload: any;
};

export type OrderCreatedEvent = EventBase & {
  event_type: 'OrderCreated';
  payload: {
    order_id: string;
    merchant_id: string;
    amount: string | number;
    currency: string;
    initial_status: string;
  };
};

export type OrderStatusChangedEvent = EventBase & {
  event_type: 'OrderStatusChanged';
  payload: {
    order_id: string;
    merchant_id: string;
    old_status: string;
    new_status: string;
    failure_code?: string;
    failure_reason?: string;
  };
};
