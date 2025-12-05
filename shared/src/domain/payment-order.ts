export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED'
}

export function isTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  switch (from) {
    case OrderStatus.PENDING:
      return to === OrderStatus.PROCESSING;
    case OrderStatus.PROCESSING:
      return to === OrderStatus.SUCCESS || to === OrderStatus.FAILED;
    case OrderStatus.SUCCESS:
    case OrderStatus.FAILED:
      return false;
    default:
      return false;
  }
}
