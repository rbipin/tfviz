// ReportWriter.ts — Handles file I/O for generated reports.
// Writes content to disk and prints a formatted size line to stdout.
// Usage: new ReportWriter('./output-dir').write('filename.html', content)

import fs from 'node:fs';
import path from 'node:path';

export class ReportWriter {
  private static readonly PR_COMMENT_LIMIT = 65_000;
  private static readonly PR_COMMENT_FILENAME = 'pr-comment.html';

  constructor(private readonly outputDir: string) {}

  /** Create the output directory if it does not exist. */
  ensureOutputDir(): void {
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  /** Write content to a file inside outputDir and print the size line. */
  write(filename: string, content: string): void {
    const filePath = path.join(this.outputDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');

    const bytes = Buffer.byteLength(content, 'utf8');
    console.log(this.formatSizeLine(filename, bytes));
  }

  private formatSizeLine(filename: string, bytes: number): string {
    const kb = (bytes / 1024).toFixed(1);

    if (filename === ReportWriter.PR_COMMENT_FILENAME) {
      if (bytes >= ReportWriter.PR_COMMENT_LIMIT) {
        return `${filename.padEnd(20)} ${kb} KB  [WARNING — exceeds 65KB GitHub comment limit. Will not post inline.]`;
      }
      return `${filename.padEnd(20)} ${kb} KB  [OK — under 65KB limit]`;
    }

    return `${filename.padEnd(20)} ${kb} KB`;
  }
}
