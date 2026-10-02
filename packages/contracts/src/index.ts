/**
 * The API contract, shared by the server and every client.
 *
 * Each export is both a Zod schema (a value) and the inferred TypeScript type
 * of the same name — so `Company` works in `z.parse` and in a type position.
 * The UI should import from here rather than redeclaring shapes; a server-side
 * schema change then becomes a compile error in the console, not a runtime
 * surprise.
 */
export * from './schemas.js';
