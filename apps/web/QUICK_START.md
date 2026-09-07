# Quick Start Guide - Admin Dashboard

## 🚀 Get Started in 3 Steps

### Step 1: Install Dependencies (Already Done ✅)
```bash
cd apps/web
npm install
```

### Step 2: Run the Application
```bash
npm run dev
```

### Step 3: Login and View Dashboard
1. Navigate to `http://localhost:3000`
2. Login with your credentials
3. You'll be redirected to the new admin dashboard!

## 📸 What You'll See

### Dashboard Layout
```
┌─────────────────────────────────────────────────────────┐
│  [Logo] ImmoPro                    [Search] [🔔] [User] │ ← Header (Sticky)
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  📊 Dash │  Tableau de bord                            │
│  🏢 Props│                                              │
│  👥 Clien│  [Stats Cards: Properties, Clients, etc.]   │
│  📄 Trans│                                              │
│  📊 Rappo│  [Recent Activity Feed]                     │
│  🔔 Notif│                                              │
│  ⚙️  Param│  [User Information Card]                    │
│  ❓ Aide │                                              │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
   Sidebar                Main Content Area
  (Fixed)                 (Scrollable)
```

## 🎨 Key Features

### ✅ Fixed Sidebar
- Dark theme (slate-900)
- 256px width
- Collapsible sections
- Active state highlighting
- Smooth animations

### ✅ Sticky Header
- White background
- Search bar
- Language selector (FR)
- Notification bell with badge
- User dropdown menu

### ✅ Dashboard Content
- Stats cards with icons
- Recent activity feed
- User information
- Responsive grid layout

## 📝 Quick Examples

### Create a New Page
```tsx
// src/pages/MyPage.tsx
import { DashboardLayout } from '../components/dashboard/dashboard-layout';

export const MyPage = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">My Page</h1>
        {/* Your content */}
      </div>
    </DashboardLayout>
  );
};
```

### Add to Router
```tsx
// src/App.tsx
import { MyPage } from './pages/MyPage';

<Route
  path="/my-page"
  element={
    <ProtectedRoute>
      <MyPage />
    </ProtectedRoute>
  }
/>
```

### Add to Sidebar
```tsx
// src/components/dashboard/sidebar.tsx
{
  title: 'My Section',
  href: '/my-page',
  icon: <Icon className="h-5 w-5" />,
}
```

## 🎯 Common Components

### Button
```tsx
import { Button } from '@/components/ui/button';

<Button>Click me</Button>
<Button variant="outline">Outline</Button>
```

### Input
```tsx
import { Input } from '@/components/ui/input';

<Input placeholder="Search..." />
```

### Badge
```tsx
import { Badge } from '@/components/ui/badge';

<Badge>New</Badge>
<Badge variant="destructive">Error</Badge>
```

## 📚 Documentation Files

1. **ADMIN_DASHBOARD_README.md** - Complete feature documentation
2. **DASHBOARD_USAGE_GUIDE.md** - Detailed usage patterns
3. **DASHBOARD_IMPLEMENTATION_SUMMARY.md** - Implementation details
4. **This file** - Quick start guide

## 🎨 Design System

### Colors
- Primary: `bg-blue-600` / `text-blue-600`
- Success: `bg-green-600` / `text-green-600`
- Warning: `bg-yellow-600` / `text-yellow-600`
- Error: `bg-red-600` / `text-red-600`

### Spacing
- Small: `gap-2` (8px)
- Medium: `gap-4` (16px)
- Large: `gap-6` (24px)

### Typography
- Heading: `text-3xl font-bold`
- Subheading: `text-xl font-semibold`
- Body: `text-sm`
- Caption: `text-xs`

## 💡 Tips

1. **Always use DashboardLayout** for consistent navigation
2. **Use space-y-6** for vertical spacing between sections
3. **Follow the color scheme** for consistency
4. **Use lucide-react icons** throughout
5. **Format currency as FCFA** with space separators (e.g., 25 000 000 FCFA)

## 🔍 Troubleshooting

### Dashboard not showing?
- Make sure you're logged in
- Check that the route is wrapped with `<ProtectedRoute>`

### Styles not working?
- Clear cache: `npm run build`
- Check Tailwind classes are correct

### Icons missing?
- Import from `lucide-react`
- Example: `import { Home } from 'lucide-react'`

## 🎉 You're Ready!

The admin dashboard is fully set up and ready to use. Start by exploring the existing pages and then create your own!

For more details, check the other documentation files.

