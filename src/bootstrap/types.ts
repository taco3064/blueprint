import type { OperationalText } from '../operational-contract';

export type Action
  = | { kind: 'write'; path: string; content: string; note: OperationalText }
    | { kind: 'mkdir'; path: string; note: OperationalText }
    | { kind: 'install'; command: string; note: OperationalText }
    | { kind: 'rm'; path: string; note: OperationalText }
    | { kind: 'instruct'; note: OperationalText };
