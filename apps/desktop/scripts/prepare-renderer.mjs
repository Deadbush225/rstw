import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const desktopDirectory = fileURLToPath(new URL('..', import.meta.url));
const rendererSource = new URL('../../client/dist/', import.meta.url);
const rendererDestination = new URL('../renderer/', import.meta.url);

await rm(rendererDestination, { force: true, recursive: true });
await mkdir(rendererDestination, { recursive: true });
await cp(rendererSource, rendererDestination, { recursive: true });

const rendererHtml = await readFile(new URL('index.html', rendererDestination), 'utf8');
if (/\b(?:src|href)=["']\//u.test(rendererHtml)) {
  throw new Error(
    'Desktop renderer contains root-relative assets. Set Vite base to ./ before packaging.',
  );
}

console.log(`Prepared desktop renderer in ${desktopDirectory}`);
