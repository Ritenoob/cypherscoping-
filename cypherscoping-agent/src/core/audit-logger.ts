import { promises as fs } from 'fs';
import path from 'path';

export interface AuditEvent {
  timestamp: number;
  eventType: string;
  correlationId: string;
  component: string;
  severity: 'info' | 'warn' | 'error';
  payload: Record<string, unknown>;
}

export class AuditLogger {
  private readonly logPath: string;

  constructor(logPath?: string) {
    this.logPath =
      logPath ||
      process.env.AUDIT_LOG_PATH ||
      path.join(process.cwd(), 'runtime', 'audit.log');
  }

  async log(event: AuditEvent): Promise<void> {
    const line = `${JSON.stringify(event)}\n`;
    const dir = path.dirname(this.logPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(this.logPath, line, 'utf8');
  }
}
