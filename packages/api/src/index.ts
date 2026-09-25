// Validates required configuration and aborts startup on an unsafe setup.
// Must be imported first so no module reads process.env before validation.
import { env, frontendUrl } from './config/env';
import express from 'express';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { getUploadsRoot } from './utils/project-root';
import { existsSync, mkdirSync } from 'fs';
import { configurePassport } from './config/passport';
import authRoutes from './routes/auth-routes';
import tenantRoutes from './routes/tenant-routes';
import adminRoutes from './routes/admin-routes';
import roleRoutes from './routes/role-routes';
import crmRoutes from './routes/crm-routes';
import dashboardRoutes from './routes/dashboard-routes';
import contactSearchRoutes from './routes/contact-search-routes';
import propertyRoutes from './routes/property-routes';
import syndicRoutes from './routes/syndic-routes';
import propertyPublicRoutes from './routes/property-public-routes';
import geographicRoutes from './routes/geographic-routes';
import rentalRoutes from './routes/rental-routes';
import documentRoutes from './routes/document-routes';
import maintenanceRoutes from './routes/maintenance-routes';
import emailNotificationConfigRoutes from './routes/email-notification-config-routes';
import whatsappNotificationConfigRoutes from './routes/whatsapp-notification-config-routes';
import newsletterRoutes from './routes/newsletter-routes';
import newsletterPublicRoutes from './routes/newsletter-public-routes';
import whatsappWebhookRoutes from './routes/whatsapp.webhook.route';
import tenantPortalRoutes from './routes/tenant-portal-routes';
import ownerPortalRoutes from './routes/owner-portal-routes';
import patrimoineRoutes from './routes/patrimoine-routes';
import ownerStatementsRoutes from './routes/owner-statements-routes';
import { startPenaltyCalculationJob } from './jobs/penalty-calculation-job';
import { startReminderSchedulerJob } from './jobs/reminder-scheduler.job';
import { startNewsletterCampaignSchedulerJob } from './jobs/newsletter-campaign-scheduler.job';
import { corsMiddleware } from './middleware/cors-middleware';
import { requestLogger } from './middleware/logging-middleware';
import { requestContextMiddleware } from './middleware/request-context-middleware';
import { errorHandler } from './middleware/error-middleware';
import { compressionMiddleware } from './middleware/compression-middleware';
import { uploadsAccessGuard } from './middleware/uploads-access-middleware';
import { globalApiRateLimiter } from './middleware/rate-limit-middleware';
import { logger } from './utils/logger';
import helmet from 'helmet';

const app = express();
const PORT = env.PORT;

// Trust proxy so req.ip is the real client IP when behind nginx/reverse proxy
app.set('trust proxy', 1);

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
        imgSrc: ["'self'", 'data:', 'blob:', env.BACKEND_URL, frontendUrl],
        mediaSrc: ["'self'", 'blob:', env.BACKEND_URL, frontendUrl]
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
const uploadsPath = getUploadsRoot(env.UPLOADS_DIR);
console.log('Serving static files from:', uploadsPath);
// Ensure uploads directory exists
if (!existsSync(uploadsPath)) {
  mkdirSync(uploadsPath, { recursive: true });
  console.log('Created uploads directory:', uploadsPath);
}
app.use(
  '/uploads',
  // Private documents (leases, payment proofs, attachments) require an
  // authenticated user with access to the owning tenant. Public listing media
  // passes straight through.
  uploadsAccessGuard,
  express.static(uploadsPath, {
    setHeaders: (res, filePath) => {
      // Credentialed requests cannot use a wildcard origin: scope to the app.
      res.setHeader('Access-Control-Allow-Origin', frontendUrl);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      // Set appropriate content type for images and documents
      if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (filePath.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (filePath.endsWith('.webp')) {
        res.setHeader('Content-Type', 'image/webp');
      } else if (filePath.endsWith('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf');
      } else if (filePath.endsWith('.doc')) {
        res.setHeader('Content-Type', 'application/msword');
      } else if (filePath.endsWith('.docx')) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }
    }
  })
);

// CORS
app.use(corsMiddleware);

// Baseline rate limiting for the whole API (tighter per-endpoint limiters
// remain on the sensitive auth routes).
app.use(globalApiRateLimiter);

// Request context (IP, User-Agent) for audit logs – must run before routes
app.use(requestContextMiddleware);

// Request logging
if (env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
// WhatsApp incoming webhook must be mounted before any /api router
// that applies auth middleware globally (router.use(authenticate)).
app.use('/api', whatsappWebhookRoutes);
app.use('/api/auth', authRoutes);
// Keep non-tenant endpoints before broad tenant-scoped routers mounted on /api.
// The syndic/patrimoine/owner-statements routers below call requireTenantAccess
// at router level, so they run for EVERY /api/* request that reaches them and
// reject anything without a tenant id in the path. /api/admin is platform-wide,
// so it has to be mounted before them or the whole back-office answers 400.
app.use('/api/admin', adminRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/tenants', dashboardRoutes); // Generic tenant dashboard figures
app.use('/api/tenants', crmRoutes); // CRM routes are tenant-scoped
app.use('/api/tenants/:tenantId/crm/contacts-search', contactSearchRoutes);
app.use('/api/tenants', rentalRoutes); // Rental routes are tenant-scoped
app.use('/api/tenants', documentRoutes); // Document routes are tenant-scoped
app.use('/api/tenants/:tenantId/maintenance', maintenanceRoutes); // Maintenance routes are tenant-scoped
app.use('/api/tenants/:tenantId/email-notifications', emailNotificationConfigRoutes); // Notifications email (activation + templates)
app.use('/api/tenants/:tenantId/whatsapp-notifications', whatsappNotificationConfigRoutes); // Notifications WhatsApp (WaSender/Twilio)
app.use('/api/tenants/:tenantId/newsletter', newsletterRoutes); // Newsletter / Mailing
app.use('/api/newsletter', newsletterPublicRoutes); // Newsletter public (subscribe, confirm, unsubscribe)
app.use('/api/portal/tenant', tenantPortalRoutes); // Tenant portal routes
app.use('/api/portal/owner', ownerPortalRoutes); // Owner portal routes

// Public routes must be mounted before any broad /api router
// that applies auth middleware globally (router.use(authenticate)).
app.use('/api/geographic', geographicRoutes); // Geographic routes (public)
app.use('/api', propertyPublicRoutes); // Property public routes (no auth required)

app.use('/api', propertyRoutes); // Property routes (tenant-scoped)
app.use('/api', syndicRoutes); // Syndic (copropriétés) routes (tenant-scoped)
app.use('/api', patrimoineRoutes); // Patrimoine routes (tenant-scoped)
app.use('/api', ownerStatementsRoutes); // Owner statements routes (tenant-scoped)

// 404 handler for unmatched routes (before the error handler, which only runs
// for actual errors).
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée.',
    code: 'NOT_FOUND'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Safety net: an unhandled rejection anywhere (a fire-and-forget notification,
// a job) would otherwise terminate the process silently on newer Node versions.
process.on('unhandledRejection', reason => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
});

process.on('uncaughtException', error => {
  logger.error('Uncaught exception', { message: error.message, stack: error.stack });
  // The process is in an undefined state: exit and let the supervisor restart it.
  process.exit(1);
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);

  // Start scheduled jobs
  if (env.NODE_ENV !== 'test') {
    startPenaltyCalculationJob();
    startReminderSchedulerJob();
    startNewsletterCampaignSchedulerJob();
  }
});
