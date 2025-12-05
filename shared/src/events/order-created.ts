import { OrderCreatedEvent } from './types';
import { v4 as uuidv4 } from 'uuid';

export function createOrderCreatedEvent(payload: OrderCreatedEvent['payload']): OrderCreatedEvent {
  return {
    event_id: uuidv4(),
    event_type: 'OrderCreated',
    occurred_at: new Date().toISOString(),
    payload
  } as OrderCreatedEvent;
}
