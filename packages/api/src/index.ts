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
import financeRoutes from './routes/finance-routes';
import financeSuppliersRoutes from './routes/finance-suppliers-routes';
import financeSitesRoutes from './routes/finance-sites-routes';
import financeBudgetsRoutes from './routes/finance-budgets-routes';
import financePurchaseOrdersRoutes from './routes/finance-purchase-orders-routes';
import financePilotageRoutes from './routes/finance-pilotage-routes';
import financeLandLeasesRoutes from './routes/finance-land-leases-routes';
import financeSalariesRoutes from './routes/finance-salaries-routes';
import financePartnershipsRoutes from './routes/finance-partnerships-routes';
import financeContractorsRoutes from './routes/finance-contractors-routes';
import financeRetentionsRoutes from './routes/finance-retentions-routes';
import financeSiteClosingRoutes from './routes/finance-site-closing-routes';
import financeStockReferentielRoutes from './routes/finance-stock-referentiel-routes';
import financeStockMouvementsRoutes from './routes/finance-stock-mouvements-routes';
import financeStockInventaireRoutes from './routes/finance-stock-inventaire-routes';
import financeStockRapprochementRoutes from './routes/finance-stock-rapprochement-routes';
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
import agencySettingsRoutes from './routes/agency-settings-routes';
import managementFeeRoutes from './routes/management-fee-routes';
import ownerAccountRoutes, { ownerAccountPortalRouter } from './routes/owner-account-routes';
import leaseLifecycleRoutes from './routes/lease-lifecycle-routes';
import leaseInspectionRoutes from './routes/lease-inspection-routes';
import accountingExportsRoutes from './routes/accounting-exports-routes';
import propertyOwnershipRoutes from './routes/property-ownership-routes';
import cashSessionRoutes from './routes/cash-session-routes';
import treasuryRoutes from './routes/treasury-routes';
import salesRoutes from './routes/sales-routes';
import { startPenaltyCalculationJob } from './jobs/penalty-calculation-job';
import { startLandLeaseAccrualJob } from './jobs/land-lease-accrual-job';
import { startReminderSchedulerJob } from './jobs/reminder-scheduler.job';
import { startNewsletterCampaignSchedulerJob } from './jobs/newsletter-campaign-scheduler.job';
import { corsMiddleware } from './middleware/cors-middleware';
import { requestLogger } from './middleware/logging-middleware';
import { requestContextMiddleware } from './middleware/request-context-middleware';
import { resolveLanguage } from './middleware/language-middleware';
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
//
// La racine vient de `getProjectRoot()`, comme pour les services qui ecrivent
// ces fichiers. Le calcul fait ici ne remontait que d'un niveau : le serveur
// cherchait dans `packages/uploads` ce que le service des pieces jointes de
// maintenance ecrivait a la racine. Les vignettes des tickets revenaient
// introuvables, et un dossier `packages/uploads` vide se creait au demarrage.
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

// Langue de la requete (Accept-Language) — avant les routes, pour que les
// messages d'erreur sortent dans la langue de l'appelant. Voir
// `middleware/language-middleware.ts`.
app.use(resolveLanguage);

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
app.use('/api', financeRoutes); // Finance : balances, releves, campagnes de facturation
app.use('/api', financeSuppliersRoutes); // Finance lot 2 : fournisseurs, factures, reglements
// ORDRE DE MONTAGE : le pilotage passe AVANT les chantiers du lot 2.
//
// `GET /finance/sites/dashboard` (lot 3) et `GET /finance/sites/:siteId`
// (lot 2) ont la meme forme. Express essaie les routeurs dans leur ordre de
// montage : si celui du lot 2 venait d'abord, il happerait « dashboard » comme
// un identifiant de chantier et le rejetterait en 400, sans jamais laisser la
// requete atteindre le tableau de bord.
//
// Risque signale par l'agent du pilotage dans sa rubrique d'hypotheses, depuis
// son propre territoire, alors que le montage ne lui appartenait pas.
app.use('/api', financePilotageRoutes); // Finance lot 3 : avancement, alertes, tableau de bord
app.use('/api', financeSitesRoutes); // Finance lot 2 : chantiers, caisse, file de validation
app.use('/api', financeBudgetsRoutes); // Finance lot 3 : budgets de chantier et avenants
app.use('/api', financePurchaseOrdersRoutes); // Finance lot 3 : bons de commande et engage
app.use('/api', financeLandLeasesRoutes); // Finance lot 4 : baux de terrain
app.use('/api', financeSalariesRoutes); // Finance lot 4 : salaires
app.use('/api', financePartnershipsRoutes); // Finance lot 4 : associations
app.use('/api', financeContractorsRoutes); // Finance lot 4 : tacherons
app.use('/api', financeRetentionsRoutes); // Finance lot 4 : retenues de garantie
app.use('/api', financeSiteClosingRoutes); // Finance lot 4 : lots, cout de revient, cloture
app.use('/api', financeStockReferentielRoutes); // Finance lot 5 : articles, lieux, valorisation
app.use('/api', financeStockMouvementsRoutes); // Finance lot 5 : receptions, sorties, soldes
app.use('/api', financeStockInventaireRoutes); // Finance lot 5 : transferts et inventaire
app.use('/api', financeStockRapprochementRoutes); // Finance lot 5 : bascule et rapprochement
app.use('/api/tenants/:tenantId/maintenance', maintenanceRoutes); // Maintenance routes are tenant-scoped
app.use('/api/tenants/:tenantId/email-notifications', emailNotificationConfigRoutes); // Notifications email (activation + templates)
app.use('/api/tenants/:tenantId/whatsapp-notifications', whatsappNotificationConfigRoutes); // Notifications WhatsApp (WaSender/Twilio)
app.use('/api/tenants/:tenantId/newsletter', newsletterRoutes); // Newsletter / Mailing
app.use('/api/newsletter', newsletterPublicRoutes); // Newsletter public (subscribe, confirm, unsubscribe)
app.use('/api/portal/tenant', tenantPortalRoutes); // Tenant portal routes
app.use('/api/portal/owner', ownerPortalRoutes); // Owner portal routes
app.use('/api/portal/owner', ownerAccountPortalRouter); // Compte courant du proprietaire connecte

// Public routes must be mounted before any broad /api router
// that applies auth middleware globally (router.use(authenticate)).
app.use('/api/geographic', geographicRoutes); // Geographic routes (public)
app.use('/api', propertyPublicRoutes); // Property public routes (no auth required)

app.use('/api', propertyRoutes); // Property routes (tenant-scoped)
app.use('/api', syndicRoutes); // Syndic (copropriétés) routes (tenant-scoped)
app.use('/api', patrimoineRoutes); // Patrimoine routes (tenant-scoped)
app.use('/api', ownerStatementsRoutes); // Owner statements routes (tenant-scoped)
app.use('/api', agencySettingsRoutes); // Parametres financiers de l'agence (tenant-scoped)
app.use('/api', managementFeeRoutes); // Honoraires de gestion : conditions, gestionnaires, commissions
app.use('/api', ownerAccountRoutes); // Comptes proprietaires et reversements (agence et portail)
app.use('/api', leaseLifecycleRoutes); // Vie du bail : revision, renouvellement, avenant, resiliation
app.use('/api', leaseInspectionRoutes); // Etats des lieux d'entree et de sortie
app.use('/api', accountingExportsRoutes); // Exports comptables : journal, grand livre, balance
app.use('/api', propertyOwnershipRoutes); // Indivision : quotes-parts des proprietaires d'un bien
app.use('/api', cashSessionRoutes); // Caisse d'agence : sessions, comptage, validation
app.use('/api', treasuryRoutes); // Tresorerie : comptes, virements internes, versements DGI
app.use('/api', salesRoutes); // Ventes immobilieres : mandats, offres, compromis, commissions

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
    // Lot 4 : le 2 de chaque mois, un douzieme du loyer de chaque bail de
    // terrain est constate. Idempotent : le rejouer ne double rien.
    startLandLeaseAccrualJob();
    startReminderSchedulerJob();
    startNewsletterCampaignSchedulerJob();
  }
});
