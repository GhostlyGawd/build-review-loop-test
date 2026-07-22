import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PermissionsPlayground from "./PermissionsPlayground";
import "./scaffold.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root mount element");
}

createRoot(root).render(
  <StrictMode>
    <PermissionsPlayground />
  </StrictMode>,
);
