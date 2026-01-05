# Admin Dashboard Layout - ImmoPro

Modern admin dashboard layout with fixed sidebar and sticky header, built with React, React Router, Tailwind CSS, and TypeScript following the Sufee Admin style.

## 🎨 Design Features

### Layout Structure
- **Fixed Sidebar** (256px width) - Dark theme navigation on the left
- **Sticky Header** (64px height) - White header with search and user controls
- **Main Content Area** - Light gray background with padding

### Color Scheme
- **Sidebar**: Dark slate (bg-slate-900)
- **Primary Accent**: Blue (#3b82f6)
- **Header**: White background
- **Content Area**: Light gray (bg-slate-50)
- **Active Menu**: Blue left border accent

### Typography
- **Font**: Inter (Google Fonts)
- **Menu Items**: text-sm font-medium
- **Headings**: Various weights (bold, semibold)

## 📁 File Structure

```
apps/web/src/
├── components/
│   ├── dashboard/
│   │   ├── sidebar.tsx           # Fixed sidebar navigation
│   │   ├── header.tsx            # Sticky header with search & user menu
│   │   └── dashboard-layout.tsx  # Main layout wrapper
│   └── ui/
│       ├── avatar.tsx            # Avatar component (Radix UI)
│       ├── badge.tsx             # Badge component
│       ├── button.tsx            # Button component
│       ├── input.tsx             # Input component
│       └── dropdown-menu.tsx     # Dropdown menu (Radix UI)
├── lib/
│   └── utils.ts                  # Utility functions (cn helper)
└── pages/
    └── Dashboard.tsx             # Updated dashboard page
```

## 🚀 Components

### Sidebar Component
**Location**: `src/components/dashboard/sidebar.tsx`

Features:
- Fixed positioning (left-0, top-0, z-40)
- Full height (h-screen), 256px width (w-64)
- Dark theme (bg-slate-900, text-slate-100)
- Logo section with app icon and name
- Collapsible navigation sections
- Active state with blue left border
- Smooth hover transitions

Navigation Items:
- Tableau de bord
- Propriétés (with submenu)
- Clients (with submenu)
- Transactions (with submenu)
- Rapports
- Notifications
- Paramètres (with submenu)
- Aide

### Header Component
**Location**: `src/components/dashboard/header.tsx`

Features:
- Sticky positioning (sticky top-0 z-30)
- Height: 64px (h-16)
- Search bar with icon (384px width)
- Language selector (FR)
- Notification bell with badge counter
- User dropdown menu with avatar
- Logout functionality

### Dashboard Layout
**Location**: `src/components/dashboard/dashboard-layout.tsx`

Features:
- Flex container with overflow hidden
- Sidebar on left, content area with pl-64 padding
- Suspense wrapper with loading spinner
- Main content area with bg-slate-50

## 📦 Dependencies

```json
{
  "dependencies": {
    "lucide-react": "latest",
    "@radix-ui/react-avatar": "latest",
    "@radix-ui/react-dropdown-menu": "latest",
    "@radix-ui/react-slot": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest"
  }
}
```

## 🎯 Usage

### Wrap your pages with DashboardLayout

```tsx
import { DashboardLayout } from '@/components/dashboard/dashboard-layout';

export const YourPage = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Your page content */}
      </div>
    </DashboardLayout>
  );
};
```

### Navigation Items Structure

```typescript
interface NavItem {
  title: string;
  href?: string;
  icon: React.ReactNode;
  children?: { title: string; href: string }[];
}
```

## 🎨 Tailwind Configuration

The Tailwind config has been updated with:
- Inter font family
- Custom primary color palette
- Extended color scheme

## 🔧 Customization

### Change Sidebar Width
Update the following classes:
- Sidebar: `w-64` (256px)
- Content area: `pl-64` (256px padding)

### Change Colors
Update in `tailwind.config.js`:
```javascript
colors: {
  primary: {
    DEFAULT: '#3b82f6', // Your primary color
    // ... other shades
  },
}
```

### Add Navigation Items
Edit `navigationItems` array in `sidebar.tsx`:
```typescript
{
  title: 'Your Section',
  icon: <YourIcon className="h-5 w-5" />,
  children: [
    { title: 'Submenu 1', href: '/path1' },
    { title: 'Submenu 2', href: '/path2' },
  ],
}
```

## 📱 Responsive Design

The current implementation is optimized for desktop. For mobile responsiveness:
- Add a hamburger menu button in the header
- Make sidebar toggleable on mobile
- Adjust padding on smaller screens

## 🌐 Internationalization

Currently set to French (FR). To add more languages:
- Update the language selector in `header.tsx`
- Implement i18n library (e.g., react-i18next)
- Translate navigation items and UI text

## 💰 Currency Format

All monetary amounts are displayed in FCFA with space separators:
- Example: `45 000 000 FCFA`

## 🔐 Authentication

The dashboard uses the existing `useAuth` hook from the project for:
- User information display
- Logout functionality
- Protected routes

## 📝 Notes

- The layout is built with React Router (not Next.js App Router as originally requested)
- All components use TypeScript for type safety
- Tailwind CSS is used for all styling
- Icons are from lucide-react
- UI primitives are from Radix UI

