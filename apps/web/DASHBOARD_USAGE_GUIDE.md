# Dashboard Usage Guide

## Quick Start

### 1. Running the Application

```bash
cd apps/web
npm run dev
```

The application will start on `http://localhost:3000`

### 2. Login

Navigate to `/login` and use your credentials to access the dashboard.

## Creating New Pages

### Step 1: Create the Page Component

Create a new file in `src/pages/` directory:

```tsx
// src/pages/YourPage.tsx
import React from 'react';
import { DashboardLayout } from '../components/dashboard/dashboard-layout';

export const YourPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Your Page Title</h1>
          <p className="mt-2 text-sm text-slate-600">
            Page description
          </p>
        </div>

        {/* Page Content */}
        <div className="bg-white rounded-lg shadow p-6">
          {/* Your content here */}
        </div>
      </div>
    </DashboardLayout>
  );
};
```

### Step 2: Add Route to App.tsx

```tsx
// Import the page
import { YourPage } from './pages/YourPage';

// Add route in the Routes component
<Route
  path="/your-page"
  element={
    <ProtectedRoute>
      <YourPage />
    </ProtectedRoute>
  }
/>
```

### Step 3: Add Navigation Item to Sidebar

Edit `src/components/dashboard/sidebar.tsx`:

```tsx
const navigationItems: NavItem[] = [
  // ... existing items
  {
    title: 'Your Section',
    href: '/your-page',
    icon: <YourIcon className="h-5 w-5" />,
  },
];
```

## Common Patterns

### Stats Card

```tsx
<div className="bg-white overflow-hidden rounded-lg shadow">
  <div className="p-5">
    <div className="flex items-center">
      <div className="flex-shrink-0">
        <Icon className="h-6 w-6 text-blue-600" />
      </div>
      <div className="ml-5 w-0 flex-1">
        <dl>
          <dt className="text-sm font-medium text-slate-500 truncate">
            Label
          </dt>
          <dd className="text-2xl font-bold text-slate-900">Value</dd>
        </dl>
      </div>
    </div>
  </div>
  <div className="bg-slate-50 px-5 py-3">
    <div className="text-sm">
      <Link to="/link" className="font-medium text-blue-600 hover:text-blue-500">
        View details
      </Link>
    </div>
  </div>
</div>
```

### Data Table

```tsx
<div className="bg-white rounded-lg shadow overflow-hidden">
  <table className="min-w-full divide-y divide-slate-200">
    <thead className="bg-slate-50">
      <tr>
        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
          Column 1
        </th>
        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
          Column 2
        </th>
      </tr>
    </thead>
    <tbody className="bg-white divide-y divide-slate-200">
      <tr>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
          Data 1
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
          Data 2
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Form Layout

```tsx
<div className="bg-white rounded-lg shadow p-6">
  <form className="space-y-6">
    <div>
      <label htmlFor="field" className="block text-sm font-medium text-slate-700">
        Field Label
      </label>
      <Input
        id="field"
        type="text"
        className="mt-1"
        placeholder="Enter value..."
      />
    </div>
    
    <div className="flex justify-end gap-3">
      <Button variant="outline">Cancel</Button>
      <Button type="submit">Save</Button>
    </div>
  </form>
</div>
```

## Available UI Components

### Button
```tsx
import { Button } from '../components/ui/button';

<Button>Default</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Delete</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
```

### Input
```tsx
import { Input } from '../components/ui/input';

<Input type="text" placeholder="Enter text..." />
<Input type="email" placeholder="Email..." />
<Input type="search" placeholder="Search..." />
```

### Badge
```tsx
import { Badge } from '../components/ui/badge';

<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Outline</Badge>
```

### Avatar
```tsx
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';

<Avatar>
  <AvatarImage src="/avatar.jpg" alt="User" />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>
```

## Styling Guidelines

### Colors
- Primary: `text-blue-600`, `bg-blue-600`
- Success: `text-green-600`, `bg-green-600`
- Warning: `text-yellow-600`, `bg-yellow-600`
- Error: `text-red-600`, `bg-red-600`
- Neutral: `text-slate-600`, `bg-slate-600`

### Spacing
- Small gap: `gap-2` (8px)
- Medium gap: `gap-4` (16px)
- Large gap: `gap-6` (24px)
- Section spacing: `space-y-6` (24px vertical)

### Shadows
- Card: `shadow`
- Hover: `hover:shadow-lg`
- None: `shadow-none`

### Rounded Corners
- Default: `rounded-lg` (8px)
- Full: `rounded-full`
- None: `rounded-none`

## Tips

1. **Always wrap pages with DashboardLayout** for consistent navigation
2. **Use the space-y-6 class** on the main container for consistent spacing
3. **Follow the color scheme** defined in the design system
4. **Use lucide-react icons** for consistency
5. **Keep monetary values in FCFA** with space separators
6. **Test on different screen sizes** (responsive design coming soon)

## Troubleshooting

### Sidebar not showing
- Check that you're using `<DashboardLayout>` wrapper
- Verify the route is protected with `<ProtectedRoute>`

### Icons not displaying
- Make sure to import from `lucide-react`
- Check icon name spelling

### Styles not applying
- Verify Tailwind classes are correct
- Check that `index.css` is imported in `index.tsx`
- Clear cache and rebuild: `npm run build`

### TypeScript errors
- Run `npm install` to ensure all dependencies are installed
- Use relative import paths (e.g., `../components/ui/button`) instead of `@/` alias

