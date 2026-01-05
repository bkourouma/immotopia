# StandardApplication Template

This is a full-stack template application consisting of:

- **Frontend**: React (Create React App) with TypeScript and Tailwind CSS (`apps/web`)
- **Backend**: Express API with TypeScript, Prisma, and JWT Authentication (`packages/api`)

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```

### Running Development Server
Use the provided batch script `start-dev.bat` or run workspaces individually.

```bash
# In packages/api
npm run dev

# In apps/web
npm run dev
```

## Structure
- `apps/web`: Frontend application
- `packages/api`: Backend application
- `specs`: Project specifications
