import React from "react";
import "./workspace-switch.css";

const workspaces = [
  { id: "parent", label: "Parent", href: "/parent/" },
  { id: "coach", label: "Coach", href: "/coach-dashboard/" },
  { id: "admin", label: "Admin", href: "/admin/" },
];

export default function WorkspaceSwitch({ current, canAdmin, canCoach }) {
  const active = workspaces.find(workspace => workspace.id === current);
  const available = workspaces.filter(workspace =>
    workspace.id === "parent" || workspace.id === current ||
    (workspace.id === "admin" ? canAdmin : canCoach)
  );

  if (available.length === 1) {
    return <span className="workspace-switch-label">{active.label}</span>;
  }

  function closeOnEscape(event) {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  }

  return <details className="workspace-switch" onKeyDown={closeOnEscape}>
    <summary className="workspace-switch-label" aria-label={`Switch workspace from ${active.label}`}>
      {active.label}
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </summary>
    <nav className="workspace-switch-options" aria-label="Workspaces">
      {available.map(workspace => workspace.id === current
        ? <span key={workspace.id} aria-current="page">{workspace.label}</span>
        : <a key={workspace.id} href={workspace.href}>{workspace.label}</a>)}
    </nav>
  </details>;
}
