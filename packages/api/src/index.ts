import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import * as path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { configurePassport } from './config/passport';
import authRoutes from './routes/auth-routes';
import tenantRoutes from './routes/tenant-routes';
import adminRoutes from './routes/admin-routes';
import roleRoutes from './routes/role-routes';
import crmRoutes from './routes/crm-routes';
import propertyRoutes from './routes/property-routes';
import propertyPublicRoutes from './routes/property-public-routes';
import geographicRoutes from './routes/geographic-routes';
import rentalRoutes from './routes/rental-routes';
import documentRoutes from './routes/document-routes';
import { startPenaltyCalculationJob } from './jobs/penalty-calculation-job';
import { corsMiddleware } from './middleware/cors-middleware';
import { requestLogger } from './middleware/logging-middleware';
import { errorHandler } from './middleware/error-middleware';
import { compressionMiddleware } from './middleware/compression-middleware';
import helmet from 'helmet';

const app = express();
const PORT = process.env.PORT || 8000;

// Configure Passport
configurePassport();

// Middleware
// Configure Helmet to allow static file serving
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'http://localhost:8001', 'http://localhost:3000'],
        mediaSrc: ["'self'", 'blob:', 'http://localhost:8001', 'http://localhost:3000']
      }
    }
  })
);
app.use(compressionMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(passport.initialize());

// Static file serving for uploads
// Use absolute path to match where files are saved
// When running from packages/api, process.cwd() is packages/api, so go up one level
// When running from project root, process.cwd() is already the project root
const cwd = process.cwd();
const projectRoot =
  path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages' ? path.resolve(cwd, '..') : cwd;
const uploadsPath = path.join(projectRoot, 'uploads');
console.log('Serving static files from:', uploadsPath);
// Ensure uploads directory exists
if (!existsSync(uploadsPath)) {
  mkdirSync(uploadsPath, { recursive: true });
  console.log('Created uploads directory:', uploadsPath);
}
app.use(
  '/uploads',
  express.static(uploadsPath, {
    setHeaders: (res, filePath) => {
      // Ensure CORS headers are set for static files
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      // Set appropriate content type for images
      if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (filePath.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (filePath.endsWith('.webp')) {
        res.setHeader('Content-Type', 'image/webp');
      }
    }
  })
);

// CORS
app.use(corsMiddleware);

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/tenants', crmRoutes); // CRM routes are tenant-scoped
app.use('/api/tenants', rentalRoutes); // Rental routes are tenant-scoped
app.use('/api/tenants', documentRoutes); // Document routes are tenant-scoped
app.use('/api', propertyRoutes); // Property routes (tenant-scoped)
app.use('/api', propertyPublicRoutes); // Property public routes (no auth required)
app.use('/api/geographic', geographicRoutes); // Geographic routes (public)
app.use('/api/admin', adminRoutes);
app.use('/api/roles', roleRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée.'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start scheduled jobs
  if (process.env.NODE_ENV !== 'test') {
    startPenaltyCalculationJob();
  }
});
