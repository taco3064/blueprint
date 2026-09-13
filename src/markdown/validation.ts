export interface MarkdownValidationFact {
  kind: 'markdown-markers';
  start: string;
  end: string;
}

export class MarkdownValidationError extends Error {
  readonly name = 'MarkdownValidationError';
  readonly fact: MarkdownValidationFact;

  constructor(fact: MarkdownValidationFact) {
    super();
    this.fact = fact;
  }
}
