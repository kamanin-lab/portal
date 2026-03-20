Source: Context Hub (`react/react`, JS, version 19.2.4)
CDN path: https://cdn.aichub.org/v1/react/docs/react/javascript/DOC.md

React Guide (JavaScript)

Golden Rule

Use react for components, hooks, context, and rendering logic. Use react-dom separately when you need to mount React in a browser.

For browser apps, keep react and react-dom on the same React major line so the runtime and renderer stay compatible.

Install

Install react in every React app. Add react-dom for web apps that render into the DOM.

npm install react

Browser apps
npm install react-dom

React does not need API keys, environment variables, or client initialization.

This guide assumes your app uses a JSX-capable build step. In modern React projects, JSX is usually compiled with the automatic JSX transform, so you do not need import React from "react" just to write JSX.

Initialize a Browser App

react does not mount itself into the page. For that, import createRoot from react-dom/client.

Key pitfalls called out by Context Hub:
- react does not create or hydrate browser roots; use react-dom/client
- useEffect is for external synchronization, not derived values
- StrictMode may run extra development-only setup/cleanup cycles
- use stable keys, not array indexes for reorderable/editable lists
- useMemo/useCallback/memo are performance tools, not correctness tools

Official sources:
- https://react.dev/reference/react
- https://react.dev/reference/react/useState
- https://react.dev/reference/react/useEffect
- https://react.dev/reference/react/createContext
- https://react.dev/reference/react/useContext
- https://react.dev/reference/react/useMemo
- https://react.dev/reference/react/lazy
- https://react.dev/reference/react/Suspense
- https://react.dev/reference/react-dom/client/createRoot
