# Z-Index Hierarchy for ImmoPro Application

## Overview
The application uses a layered z-index system to ensure proper stacking of UI elements.

## Z-Index Layers (from lowest to highest)

### Layer 30: Sidebar (z-30)
- **Component**: `Sidebar` (apps/web/src/components/dashboard/sidebar.tsx)
- **Purpose**: Fixed navigation sidebar
- **Z-Index**: `z-30`
- **Rationale**: Sidebar should be clickable and visible, but below the header and dropdowns

### Layer 40: Header (z-40)
- **Component**: `Header` (apps/web/src/components/dashboard/header.tsx)
- **Purpose**: Sticky header with search and user menu
- **Z-Index**: `z-40`
- **Rationale**: Header should be above the sidebar and main content, but below modals and dropdowns

### Layer 50: Modals and Overlays (z-50)
- **Components**: Various modal dialogs throughout the app
- **Purpose**: Full-screen overlays and modal dialogs
- **Z-Index**: `z-50`
- **Rationale**: Modals should appear above all regular content

### Layer 9999: Dropdowns and Popovers (z-[9999])
- **Components**: 
  - `DropdownMenu` (apps/web/src/components/ui/dropdown-menu.tsx)
  - `Select` (apps/web/src/components/ui/select.tsx)
  - `LocationSelector` (apps/web/src/components/ui/location-selector.tsx)
  - `ContactSearchableSelect` (apps/web/src/components/properties/ContactSearchableSelect.tsx)
- **Purpose**: Dropdown menus, select options, and popovers
- **Z-Index**: `z-[9999]`
- **Rationale**: Dropdowns must appear above everything else, including modals, to ensure they're always accessible

## Key Principles

1. **Main Content Area**: No z-index applied to avoid creating unnecessary stacking contexts that could interfere with dropdowns.

2. **Portal Components**: Radix UI components (dropdowns, selects) use portals and very high z-index values to ensure they appear above all other content.

3. **Fixed Elements**: The sidebar is fixed with `z-30` to keep it clickable and visible.

4. **Sticky Elements**: The header is sticky with `z-40` to stay above the sidebar.

5. **Consistency**: All dropdown-like components should use `z-[9999]` to maintain consistency.

## Common Issues and Solutions

### Issue: Dropdown appears behind sidebar
**Solution**: Ensure dropdowns use `z-[9999]` and are rendered in portals (Radix UI does this automatically).

### Issue: Sidebar not clickable
**Solution**: Ensure sidebar has a higher z-index than the main content area. Sidebar should be `z-30` or higher.

### Issue: Header dropdown appears behind content
**Solution**: Header should have `z-40` and dropdowns should use portals with `z-[9999]`.

## Current Z-Index Values
- Sidebar: `z-30`
- Header: `z-40`
- Modals: `z-50`
- Dropdowns: `z-[9999]`
- Main content: No z-index (default stacking)
