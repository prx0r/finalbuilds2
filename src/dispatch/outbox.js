import fs from 'node:fs/promises';
import path from 'node:path';

export class JsonlTaskOutbox {
  constructor(filePath = 'runtime/hermes-outbox.jsonl') { this.filePath = filePath; }
  async dispatch(task) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(task)}\n`, 'utf8');
    return { accepted: true, transport: 'jsonl-outbox', task_id: task.id };
  }
}
