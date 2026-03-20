Source: Context Hub (`react/react-dom`, JS, version 19.2.4)
CDN path: https://cdn.aichub.org/v1/react/docs/react-dom/javascript/DOC.md

React DOM JavaScript Guide

Golden Rule

Install matching react and react-dom versions, import browser root APIs from react-dom/client, import DOM helpers such as createPortal and flushSync from react-dom, and import server rendering APIs from react-dom/server.

Key rules:
- use `createRoot` for fresh client mounts
- use `hydrateRoot` for server-rendered HTML
- import `createRoot` / `hydrateRoot` from `react-dom/client`
- match react and react-dom versions
- treat `flushSync` as an escape hatch, not a default pattern

Official sources:
- https://react.dev/reference/react-dom/client/createRoot
- https://react.dev/reference/react-dom/client/hydrateRoot
- https://react.dev/reference/react-dom/createPortal
- https://react.dev/reference/react-dom/flushSync
- https://react.dev/reference/react-dom/server
