import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./scaffold.css";

export function ScaffoldNotice() {
  return (
    <main className="scaffold-notice">
      <p className="eyebrow">Policy workspace</p>
      <h1>Permissions Playground</h1>
      <p>
        The product implementation is intentionally absent from this starter
        scaffold.
      </p>
      <p>
        Builders: read the specification and public-test contract before adding
        implementation files.
      </p>
    </main>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root mount element");
}

createRoot(root).render(
  <StrictMode>
    <ScaffoldNotice />
  </StrictMode>,
);
