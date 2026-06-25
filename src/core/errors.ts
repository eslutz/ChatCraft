export class ChatCraftError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ChatCraftError";
  }
}

export function invariant(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) {
    throw new ChatCraftError(code, message);
  }
}
