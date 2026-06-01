// Ambient type declaration for the pdfjs-dist worker module. The
// package's own type entry points don't cover this sibling file, so a
// bare `import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'`
// errors under TypeScript's strict module resolution. The runtime
// shape is `{ WorkerMessageHandler: <pdfjs WorkerMessageHandler class> }`
// — that's the only export, and the only one `lib/pdf/disablePdfjsWorker.ts`
// reads from it.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const WorkerMessageHandler: any;
}
