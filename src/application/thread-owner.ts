import type { Thread, ThreadCommit } from "../domain/types";
import type { ThreadStateWriter } from "../ports/storage";

/** Coordinates request identity so stale browser events cannot commit over newer state. */
export class ThreadStateOwner {
  private readonly requests = new Map<string, string>();

  constructor(private readonly writer: ThreadStateWriter) {}

  begin(operation: string, requestId: string): void {
    this.requests.set(operation, requestId);
  }

  isCurrent(operation: string, requestId: string): boolean {
    return this.requests.get(operation) === requestId;
  }

  async commit(operation: string, requestId: string, input: ThreadCommit): Promise<Thread | null> {
    if (!this.isCurrent(operation, requestId)) return null;
    return this.writer.commit(input);
  }

  finish(operation: string, requestId: string): void {
    if (this.isCurrent(operation, requestId)) this.requests.delete(operation);
  }
}
