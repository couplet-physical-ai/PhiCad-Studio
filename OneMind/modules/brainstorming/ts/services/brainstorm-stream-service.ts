export class BrainstormStreamService {
  private connections = new Map<string, Set<ReadableStreamDefaultController>>();

  subscribe(boardId: string): ReadableStream {
    let controller: ReadableStreamDefaultController;

    const stream = new ReadableStream({
      start: (c) => {
        controller = c;
        if (!this.connections.has(boardId)) {
          this.connections.set(boardId, new Set());
        }
        this.connections.get(boardId)!.add(controller);

        // Send initial ping
        this.sendEvent(controller, "ping", { timestamp: Date.now() });
      },
      cancel: () => {
        if (this.connections.has(boardId)) {
          const set = this.connections.get(boardId)!;
          set.delete(controller);
          if (set.size === 0) {
            this.connections.delete(boardId);
          }
        }
      },
    });

    return stream;
  }

  publish(boardId: string, event: string, data: unknown) {
    const controllers = this.connections.get(boardId);
    if (!controllers) return;

    for (const controller of controllers) {
      this.sendEvent(controller, event, data);
    }
  }

  private sendEvent(
    controller: ReadableStreamDefaultController,
    event: string,
    data: unknown,
  ) {
    try {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(new TextEncoder().encode(payload));
    } catch (err) {
      // Controller might be closed
    }
  }
}
