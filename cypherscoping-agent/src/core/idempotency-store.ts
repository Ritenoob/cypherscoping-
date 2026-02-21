import { promises as fs } from 'fs';
import path from 'path';

interface StoredState {
  version: 1;
  updatedAt: number;
  entries: Record<string, number>;
}

export class IdempotencyStore {
  private readonly storePath: string;

  constructor(storePath?: string) {
    this.storePath =
      storePath ||
      process.env.IDEMPOTENCY_STORE_PATH ||
      path.join(process.cwd(), 'runtime', 'idempotency-store.json');
  }

  async load(): Promise<Map<string, number>> {
    try {
      const raw = await fs.readFile(this.storePath, 'utf8');
      const parsed = JSON.parse(raw) as StoredState;
      if (!parsed || typeof parsed !== 'object' || !parsed.entries) {
        return new Map();
      }
      return new Map(Object.entries(parsed.entries));
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return new Map();
      return new Map();
    }
  }

  async save(entries: Map<string, number>): Promise<void> {
    const dir = path.dirname(this.storePath);
    await fs.mkdir(dir, { recursive: true });

    const payload: StoredState = {
      version: 1,
      updatedAt: Date.now(),
      entries: Object.fromEntries(entries.entries())
    };

    await fs.writeFile(this.storePath, JSON.stringify(payload, null, 2), 'utf8');
  }
}
