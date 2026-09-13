/**
 * No-op stand-in for the `server-only` package under Vitest.
 *
 * `server-only` resolves to a module that throws unless the bundler is running with
 * React's "react-server" condition. Vitest is not, so importing any server module that
 * guards itself with it would fail at collection. The guard still does its job where it
 * matters -- a real client-component import is a build error in `next build`.
 */
export {};
