export type Action
  = | { kind: 'write'; path: string; content: string; note: string }
    | { kind: 'mkdir'; path: string; note: string }
    | { kind: 'install'; command: string; note: string }
    | { kind: 'rm'; path: string; note: string }
    | { kind: 'instruct'; note: string };
