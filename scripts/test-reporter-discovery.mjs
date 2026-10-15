import fs from 'node:fs';
import path from 'node:path';

export default async function* testReporter(source) {
  const executedFiles = new Set();
  for await (const event of source) {
    if (event.data?.file) {
      executedFiles.add(path.resolve(event.data.file));
    }
  }
  const outFile = process.env.TEST_DISCOVERY_OUT;
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(Array.from(executedFiles)), 'utf-8');
  } else {
    process.stdout.write(`\n__EXECUTED_TEST_FILES__:${JSON.stringify(Array.from(executedFiles))}\n`);
  }
}
