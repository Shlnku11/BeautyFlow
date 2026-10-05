export class TransientProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = 'TransientProviderError'; }
}

export class PermanentProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = 'PermanentProviderError'; }
}
