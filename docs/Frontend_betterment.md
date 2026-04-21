# Frontend Betterment Handoff Brief

Purpose: Improve the frontend experience, responsiveness, and visual quality while preserving existing backend-integrated workflows, RBAC behavior, and endpoint contracts.

## Scope and Non-Negotiables

1. Preserve backend-first architecture.
2. Do not change API paths, HTTP methods, payload keys, or response assumptions already wired in frontend data layer.
3. Do not alter role permissions logic behavior:
- super admin can edit across bases and trigger ML.
- base admin can edit own base only and cannot trigger ML.
4. Keep blockchain-triggering business actions intact by preserving calls through existing frontend data methods.
5. No backend code changes in this task unless explicitly required for bugfix compatibility.

## Current App Surface

1. Login page: frontend/index.html
2. Protected page: frontend/dashboard.html
3. Data layer: frontend/js/data.js
4. App logic: frontend/js/app.js
5. Auth guard: frontend/js/auth-guard.js
6. Styling: frontend/css/style.css

## Existing Behavior That Must Stay Correct

1. Login uses backend API auth and stores session in sessionStorage key avms_session.
2. Protected page requires login-first redirect via auth guard.
3. Vehicle create/update/delete flows trigger backend workflows and blockchain logging.
4. Maintenance and inventory actions preserve RBAC checks and backend writes.
5. ML retrigger runs from super admin only and displays latest run output details.
6. Base map filter affects scope views without corrupting data fetch logic.

## Betterment Goals

1. Visual Polish
- Create a clearer design system using CSS variables with stronger hierarchy.
- Improve typography scale and spacing rhythm.
- Improve table readability, sticky headers, and row density options.

2. Responsiveness
- Optimize all screens for mobile, tablet, desktop.
- Sidebar should become collapsible drawer on smaller screens.
- Tables should have responsive stacked or horizontal-scroll modes with retained usability.

3. UX Clarity
- Add explicit loading states, skeletons, and empty states for each section.
- Add consistent success, warning, and error patterns.
- Add clear confirmations for destructive actions and show transaction-impact hints.

4. Accessibility
- Keyboard navigability for all actions and modals.
- Focus states, aria labels, semantic roles, color-contrast compliance.
- Avoid color-only status encoding; include text labels/icons.

5. Performance
- Reduce unnecessary re-renders and repeated DOM rebuilds where possible.
- Debounce search/filter inputs.
- Keep chart updates incremental where feasible.

## Implementation Constraints

1. Keep plain HTML/CSS/vanilla JS approach.
2. Avoid introducing heavy frameworks.
3. If adding utility libraries, keep them minimal and justify usage.
4. Ensure no breaking changes to:
- AppData.loginWithBackend
- AppData.fetchVehiclesFromBackend
- AppData.createVehicle
- AppData.updateVehicleDetails
- AppData.deleteVehicleById
- AppData.fetchMaintenanceFromBackend
- AppData.createMaintenance
- AppData.updateMaintenance
- AppData.deleteMaintenance
- AppData.fetchInventoryFromBackend
- AppData.createInventory
- AppData.updateInventory
- AppData.deleteInventory
- AppData.fetchLatestMlStatus
- AppData.triggerMlInference

## Suggested Work Plan

1. Audit and Baseline
- Capture current screenshots of dashboard, map, vehicles, maintenance, inventory, login.
- Identify low-contrast and spacing pain points.

2. Design System Pass
- Standardize spacing tokens, typography scale, component states.
- Add consistent button, badge, table, modal, and form primitives.

3. Layout and Responsive Pass
- Improve sidebar behavior.
- Improve KPI and chart layout at multiple breakpoints.
- Improve table interactions on smaller viewports.

4. Interaction Pass
- Add loading indicators and skeletons.
- Add robust empty-state cards with next-action hints.
- Improve modal usability and validation messages.

5. Quality and Regression Pass
- Verify all core role-based workflows still work end-to-end.
- Verify no API contract regressions.

## Acceptance Checklist

1. Login-first guard works:
- opening protected page without session redirects to login.
- after login, user returns to requested protected page.

2. Role behavior remains intact for super admin and base admin.

3. Vehicle add/edit/remove still updates UI and backend and preserves blockchain-triggering workflow.

4. ML retrigger and ML output panel still function for super admin.

5. Maintenance and inventory create/update/delete still function with RBAC.

6. Layout is responsive and polished at common viewport widths.

7. No new console errors.

## Manual Test Matrix

1. Super admin login:
- dashboard load
- map scope changes
- add vehicle
- transfer vehicle
- decommission vehicle
- trigger ML and inspect run output

2. Base admin login:
- own-base edits allowed
- other-base edits blocked
- ML retrigger hidden/blocked

3. Deep-link security:
- open /frontend/dashboard.html directly while logged out, verify redirect to login.
- login, verify redirect back to dashboard.

4. Mobile sanity:
- login page
- dashboard metrics and tables
- modal forms

## Definition of Done

1. Better visual design and responsiveness delivered.
2. Backend logic workflow unchanged and stable.
3. RBAC and blockchain-related action paths unaffected.
4. Documentation note added in frontend/README.md summarizing UI improvements and confirming no API contract changes.
