export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(operation);
    // Callers receive the rejection; a failed operation must not block recovery.
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
