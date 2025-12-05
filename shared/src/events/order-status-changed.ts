import { OrderStatusChangedEvent } from './types';
import { v4 as uuidv4 } from 'uuid';

export function createOrderStatusChangedEvent(payload: OrderStatusChangedEvent['payload']): OrderStatusChangedEvent {
  return {
    event_id: uuidv4(),
    event_type: 'OrderStatusChanged',
    occurred_at: new Date().toISOString(),
    payload
  } as OrderStatusChangedEvent;
}
