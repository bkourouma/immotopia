import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { App as AntApp, ConfigProvider, Spin } from 'antd';
import { buildAntdTheme } from './theme/antd-theme';
import './i18n';
import { LanguageProvider } from './i18n/LanguageProvider';
import { LanguagePreferenceSync } from './i18n/LanguagePreferenceSync';
import { useLanguage } from './i18n/useLanguage';
import { FeedbackBridge } from './lib/feedback';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './lib/query-client';
// Atelier de verification visuelle. La garde est sur L IMPORT, pas seulement
// sur la route : Vite remplace `import.meta.env.DEV` par `false` au build, le
// ternaire se reduit a `null`, et Rollup elimine alors l import dynamique avec
// tout le module. Garder l import au niveau du module et ne conditionner que la
// route produisait bien un chunk `Atelier-*.js` dans le build de production —
// verifie, puis corrige.
const Atelier = import.meta.env.DEV ? lazy(() => import('./dev/atelier/Atelier')) : null;
// `NotFound` est `lazy` pour la meme raison qu'`AccessDenied` : il tire
// `Result` d'Ant Design pour un ecran que l'on n'atteint qu'en se trompant
// d'adresse.
const NotFound = lazy(() => import('./components/primitives/NotFound').then(m => ({ default: m.NotFound })));
// La coquille est `lazy` au meme titre que les ecrans : elle n'est utile
// qu'apres authentification, et l'importer statiquement faisait payer a
// /login tout le Menu, le Layout et le Drawer d'Ant Design — mesure : +102 Ko
// gzip sur le chunk d'entree.
const AppShell = lazy(() =>
  import(/* webpackChunkName: "shell" */ './components/shell/AppShell').then(m => ({ default: m.AppShell }))
);
import { useBreakpoint } from './hooks/useBreakpoint';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TenantRedirect } from './components/TenantRedirect';
import { t } from './i18n/t';
const Register = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/Register').then(m => ({ default: m.Register }))
);
const VerifyEmail = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/VerifyEmail').then(m => ({ default: m.VerifyEmail }))
);
const Login = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/Login').then(m => ({ default: m.Login }))
);
const Dashboard = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/Dashboard').then(m => ({ default: m.Dashboard }))
);
const Properties = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/Properties').then(m => ({ default: m.Properties }))
);
const PropertyCreate = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/PropertyCreate').then(m => ({
    default: m.PropertyCreate
  }))
);
const PropertyEdit = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/PropertyEdit').then(m => ({
    default: m.PropertyEdit
  }))
);
const PropertyDetail = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/PropertyDetail').then(m => ({
    default: m.PropertyDetail
  }))
);
const PropertyVisitsCalendar = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/PropertyVisitsCalendar').then(m => ({
    default: m.PropertyVisitsCalendar
  }))
);
const PatrimoineOverviewPage = lazy(() =>
  import(/* webpackChunkName: "patrimoine" */ './pages/patrimoine/PatrimoineOverviewPage').then(m => ({
    default: m.PatrimoineOverviewPage
  }))
);
const PatrimoinePerformancePage = lazy(() =>
  import(/* webpackChunkName: "patrimoine" */ './pages/patrimoine/PatrimoinePerformancePage').then(m => ({
    default: m.PatrimoinePerformancePage
  }))
);
const WorkProgramsPage = lazy(() =>
  import(/* webpackChunkName: "patrimoine" */ './pages/patrimoine/work-programs/WorkProgramsPage').then(m => ({
    default: m.WorkProgramsPage
  }))
);
const OwnerStatementsPage = lazy(() =>
  import(/* webpackChunkName: "patrimoine" */ './pages/patrimoine/statements/OwnerStatementsPage').then(m => ({
    default: m.OwnerStatementsPage
  }))
);
const OwnerStatementDetailPage = lazy(() =>
  import(/* webpackChunkName: "patrimoine" */ './pages/patrimoine/statements/OwnerStatementDetailPage').then(m => ({
    default: m.OwnerStatementDetailPage
  }))
);
// Module financier — regroupe dans un seul morceau : les quatre ecrans se
// consultent a la suite (une balance, puis le releve qu'elle ouvre), et les
// separer ferait payer un aller-retour reseau a chaque clic.
const BalanceClients = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/BalanceClients').then(m => ({
    default: m.BalanceClients
  }))
);
const BalanceAgee = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/BalanceAgee').then(m => ({ default: m.BalanceAgee }))
);
const CommissionsAgents = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/CommissionsAgents').then(m => ({
    default: m.CommissionsAgents
  }))
);
const ComptesProprietaires = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/ComptesProprietaires').then(m => ({
    default: m.ComptesProprietaires
  }))
);
const CompteProprietaire = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/CompteProprietaire').then(m => ({
    default: m.CompteProprietaire
  }))
);
const Releve = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Releve').then(m => ({ default: m.Releve }))
);
const SalesDashboard = lazy(() =>
  import(/* webpackChunkName: "sales" */ './pages/sales/SalesDashboard').then(m => ({ default: m.SalesDashboard }))
);
const SaleMandates = lazy(() =>
  import(/* webpackChunkName: "sales" */ './pages/sales/SaleMandates').then(m => ({ default: m.SaleMandates }))
);
const SaleMandateDetail = lazy(() =>
  import(/* webpackChunkName: "sales" */ './pages/sales/SaleMandateDetail').then(m => ({
    default: m.SaleMandateDetail
  }))
);
const SaleAgreementDetail = lazy(() =>
  import(/* webpackChunkName: "sales" */ './pages/sales/SaleAgreementDetail').then(m => ({
    default: m.SaleAgreementDetail
  }))
);
const SaleCommissions = lazy(() =>
  import(/* webpackChunkName: "sales" */ './pages/sales/SaleCommissions').then(m => ({ default: m.SaleCommissions }))
);
const Comptabilite = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Comptabilite').then(m => ({ default: m.Comptabilite }))
);
const Caisse = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Caisse').then(m => ({ default: m.Caisse }))
);
const Tresorerie = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Tresorerie').then(m => ({ default: m.Tresorerie }))
);
const Facturation = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Facturation').then(m => ({ default: m.Facturation }))
);
// Module financier, lot 2 — meme morceau que le lot 1 : les ecrans se
// consultent a la suite (une balance fournisseurs, puis la facture qu'elle
// ouvre), et les separer ferait payer un aller-retour reseau a chaque clic.
const Fournisseurs = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Fournisseurs').then(m => ({ default: m.Fournisseurs }))
);
const BalanceFournisseurs = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/BalanceFournisseurs').then(m => ({
    default: m.BalanceFournisseurs
  }))
);
const FactureFournisseur = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/FactureFournisseur').then(m => ({
    default: m.FactureFournisseur
  }))
);
const Chantiers = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Chantiers').then(m => ({ default: m.Chantiers }))
);
const ChantierDetail = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/ChantierDetail').then(m => ({ default: m.ChantierDetail }))
);
const PieceDeCaisse = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/PieceDeCaisse').then(m => ({ default: m.PieceDeCaisse }))
);
const BudgetChantier = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/BudgetChantier').then(m => ({
    default: m.BudgetChantier
  }))
);
const BonsDeCommande = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/BonsDeCommande').then(m => ({
    default: m.BonsDeCommande
  }))
);
const BonDeCommande = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/BonDeCommande').then(m => ({
    default: m.BonDeCommande
  }))
);
const BauxDeTerrain = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/BauxDeTerrain').then(m => ({
    default: m.BauxDeTerrain
  }))
);
const BailDeTerrain = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/BailDeTerrain').then(m => ({
    default: m.BailDeTerrain
  }))
);
const Associations = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Associations').then(m => ({
    default: m.Associations
  }))
);
const Association = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Association').then(m => ({
    default: m.Association
  }))
);
const Salaires = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Salaires').then(m => ({
    default: m.Salaires
  }))
);
const Salarie = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Salarie').then(m => ({
    default: m.Salarie
  }))
);
const Tacherons = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Tacherons').then(m => ({
    default: m.Tacherons
  }))
);
const Tacheron = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Tacheron').then(m => ({
    default: m.Tacheron
  }))
);
const Stock = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Stock').then(m => ({ default: m.Stock }))
);
const StockReferentiel = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/StockReferentiel').then(m => ({
    default: m.StockReferentiel
  }))
);
const StockInventaire = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/StockInventaire').then(m => ({
    default: m.StockInventaire
  }))
);
const StockChantier = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/StockChantier').then(m => ({
    default: m.StockChantier
  }))
);
const RetenuesDeGarantie = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/RetenuesDeGarantie').then(m => ({
    default: m.RetenuesDeGarantie
  }))
);
const ClotureChantier = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/ClotureChantier').then(m => ({
    default: m.ClotureChantier
  }))
);
const TableauDeBordChantiers = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/TableauDeBordChantiers').then(m => ({
    default: m.TableauDeBordChantiers
  }))
);
const FileDeValidation = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/FileDeValidation').then(m => ({
    default: m.FileDeValidation
  }))
);
const Importation = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/Importation').then(m => ({
    default: m.Importation
  }))
);
const SyndicsList = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicsList').then(m => ({ default: m.SyndicsList }))
);
const SyndicDetail = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicDetail').then(m => ({ default: m.SyndicDetail }))
);
const SyndicLots = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicLots').then(m => ({ default: m.SyndicLots }))
);
const SyndicCharges = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicCharges').then(m => ({ default: m.SyndicCharges }))
);
const SyndicMeetings = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicMeetings').then(m => ({ default: m.SyndicMeetings }))
);
const SyndicMeetingDetail = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicMeetingDetail').then(m => ({
    default: m.SyndicMeetingDetail
  }))
);
const SyndicProviders = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicProviders').then(m => ({
    default: m.SyndicProviders
  }))
);
const SyndicDocuments = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicDocuments').then(m => ({
    default: m.SyndicDocuments
  }))
);
const SyndicFinances = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicFinances').then(m => ({ default: m.SyndicFinances }))
);
const SyndicRecovery = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicRecovery').then(m => ({ default: m.SyndicRecovery }))
);
const SyndicOwnerAccount = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicOwnerAccount').then(m => ({
    default: m.SyndicOwnerAccount
  }))
);
const SyndicAccounting = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicAccounting').then(m => ({
    default: m.SyndicAccounting
  }))
);
const SyndicBudgets = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicBudgets').then(m => ({ default: m.SyndicBudgets }))
);
const SyndicProfilesIncidents = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicProfilesIncidents').then(m => ({
    default: m.SyndicProfilesIncidents
  }))
);
// Layout d'onglets commun aux trois familles d'écrans Syndic (Copropriété,
// Finances, Assemblées et documents) — même découpe de chunk que les écrans
// qu'il encadre : il ne sert jamais seul.
const SyndicWorkspaceLayout = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './components/navigation/SyndicWorkspaceLayout').then(m => ({
    default: m.SyndicWorkspaceLayout
  }))
);
// Même principe pour les espaces à onglets de la finance (Caisse et
// trésorerie, Facturation et balances, Suivi des chantiers…).
const FinanceWorkspaceLayout = lazy(() =>
  import(/* webpackChunkName: "finance" */ './components/navigation/FinanceWorkspaceLayout').then(m => ({
    default: m.FinanceWorkspaceLayout
  }))
);
const ForgotPassword = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/ForgotPassword').then(m => ({ default: m.ForgotPassword }))
);
const ResetPassword = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/ResetPassword').then(m => ({ default: m.ResetPassword }))
);
const AuthCallback = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/AuthCallback').then(m => ({ default: m.AuthCallback }))
);
const AcceptInvitePage = lazy(() =>
  import(/* webpackChunkName: "auth" */ './pages/auth/AcceptInvitePage').then(m => ({ default: m.AcceptInvitePage }))
);
const SettingsLayout = lazy(() =>
  import(/* webpackChunkName: "settings" */ './pages/settings/SettingsLayout').then(m => ({
    default: m.SettingsLayout
  }))
);
const ProfilePage = lazy(() =>
  import(/* webpackChunkName: "settings" */ './pages/settings/ProfilePage').then(m => ({ default: m.ProfilePage }))
);
// Admin pages
const TenantsList = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/TenantsList').then(m => ({ default: m.TenantsList }))
);
const TenantDetail = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/TenantDetail').then(m => ({ default: m.TenantDetail }))
);
const TenantCreate = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/TenantCreate').then(m => ({ default: m.TenantCreate }))
);
const TenantEdit = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/TenantEdit').then(m => ({ default: m.TenantEdit }))
);
const Statistics = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/Statistics').then(m => ({ default: m.Statistics }))
);
const AuditLogs = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/AuditLogs').then(m => ({ default: m.AuditLogs }))
);
const AdminCollaboratorDetail = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/AdminCollaboratorDetail').then(m => ({
    default: m.AdminCollaboratorDetail
  }))
);
const AdminInviteCollaborator = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/AdminInviteCollaborator').then(m => ({
    default: m.AdminInviteCollaborator
  }))
);
const RolesPermissions = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/RolesPermissions').then(m => ({ default: m.RolesPermissions }))
);
// Tenant pages
const CollaboratorsList = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/CollaboratorsList').then(m => ({
    default: m.CollaboratorsList
  }))
);
const CollaboratorDetail = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/CollaboratorDetail').then(m => ({
    default: m.CollaboratorDetail
  }))
);
const InviteCollaborator = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/InviteCollaborator').then(m => ({
    default: m.InviteCollaborator
  }))
);
const InvitationsList = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/InvitationsList').then(m => ({ default: m.InvitationsList }))
);
const TenantSettings = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/TenantSettings').then(m => ({ default: m.TenantSettings }))
);
const AgencyFinanceSettings = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/AgencyFinanceSettings').then(m => ({
    default: m.AgencyFinanceSettings
  }))
);
// CRM pages
const Contacts = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/Contacts').then(m => ({ default: m.Contacts }))
);
const ContactFormPage = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/ContactFormPage').then(m => ({ default: m.ContactFormPage }))
);
const ContactDetailPage = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/ContactDetailPage').then(m => ({ default: m.ContactDetailPage }))
);
const Deals = lazy(() => import(/* webpackChunkName: "crm" */ './pages/crm/Deals').then(m => ({ default: m.Deals })));
const DealDetailPage = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/DealDetailPage').then(m => ({ default: m.DealDetailPage }))
);
const DealFormPage = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/DealFormPage').then(m => ({ default: m.DealFormPage }))
);
const Activities = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/Activities').then(m => ({ default: m.Activities }))
);
const CrmDashboard = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/Dashboard').then(m => ({ default: m.CrmDashboard }))
);
const CalendarPage = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/Calendar').then(m => ({ default: m.CalendarPage }))
);
// Rental pages
const Leases = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Leases').then(m => ({ default: m.Leases }))
);
const LeaseFormPage = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/LeaseFormPage').then(m => ({ default: m.LeaseFormPage }))
);
const LeaseDetailPage = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/LeaseDetailPage').then(m => ({ default: m.LeaseDetailPage }))
);
const Installments = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Installments').then(m => ({ default: m.Installments }))
);
const InstallmentDetailPage = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/InstallmentDetailPage').then(m => ({
    default: m.InstallmentDetailPage
  }))
);
const Payments = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Payments').then(m => ({ default: m.Payments }))
);
const Penalties = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Penalties').then(m => ({ default: m.Penalties }))
);
const Deposits = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Deposits').then(m => ({ default: m.Deposits }))
);
const Documents = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Documents').then(m => ({ default: m.Documents }))
);
const PaymentDetailPage = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/PaymentDetailPage').then(m => ({
    default: m.PaymentDetailPage
  }))
);
// Maintenance pages
const TicketList = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/maintenance/TicketList').then(m => ({
    default: m.TicketList
  }))
);
const TicketDetail = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/maintenance/TicketDetail').then(m => ({
    default: m.TicketDetail
  }))
);
const CreateTicket = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/maintenance/CreateTicket').then(m => ({
    default: m.CreateTicket
  }))
);
const EditTicket = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/maintenance/EditTicket').then(m => ({
    default: m.EditTicket
  }))
);
const ManagerTickets = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/maintenance/Tickets').then(m => ({ default: m.Tickets }))
);
const ManagerTicketDetail = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/maintenance/TicketDetail').then(m => ({
    default: m.TicketDetail
  }))
);
const Vendors = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/maintenance/Vendors').then(m => ({ default: m.Vendors }))
);
// Communication pages (email + WhatsApp notifications)
const EmailNotificationsUnifiedPage = lazy(() =>
  import(/* webpackChunkName: "communication" */ './pages/communication/EmailNotificationsUnifiedPage').then(m => ({
    default: m.EmailNotificationsUnifiedPage
  }))
);
const WhatsAppNotificationsPage = lazy(() =>
  import(/* webpackChunkName: "communication" */ './pages/communication/WhatsAppNotificationsPage').then(m => ({
    default: m.WhatsAppNotificationsPage
  }))
);
const WhatsAppGroupMessagePage = lazy(() =>
  import(/* webpackChunkName: "communication" */ './pages/communication/WhatsAppGroupMessagePage').then(m => ({
    default: m.WhatsAppGroupMessagePage
  }))
);
// Newsletter pages
const NewsletterListsPage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/NewsletterListsPage').then(m => ({
    default: m.NewsletterListsPage
  }))
);
const NewsletterCampaignsPage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/NewsletterCampaignsPage').then(m => ({
    default: m.NewsletterCampaignsPage
  }))
);
const NewsletterTemplatesPage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/NewsletterTemplatesPage').then(m => ({
    default: m.NewsletterTemplatesPage
  }))
);
const UnsubscribePage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/UnsubscribePage').then(m => ({
    default: m.UnsubscribePage
  }))
);
const ConfirmPage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/ConfirmPage').then(m => ({ default: m.ConfirmPage }))
);
const SubscribePage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/SubscribePage').then(m => ({
    default: m.SubscribePage
  }))
);
// Client pages
const DocumentTemplates = lazy(() =>
  import(/* webpackChunkName: "documents" */ './pages/documents/DocumentTemplates').then(m => ({
    default: m.DocumentTemplates
  }))
);
// Transactions page
// Reports page
// Tenant Portal pages
const TenantDashboard = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Dashboard'));
const TenantLease = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Lease'));
const TenantPayments = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Payments'));
const TenantDeposit = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Deposit'));
const TenantMaintenance = lazy(
  () => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Maintenance')
);
const TenantDocuments = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Documents'));
// Owner Portal pages
const OwnerDashboard = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Dashboard'));
const OwnerProperties = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Properties'));
const OwnerPropertyDetails = lazy(
  () => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/PropertyDetails')
);
const OwnerLeases = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Leases'));
const OwnerLeaseDetails = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/LeaseDetails'));
const OwnerRevenues = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Revenues'));
const OwnerInstallments = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Installments'));
const OwnerPayments = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Payments'));
const OwnerAccount = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Account'));
const OwnerDeposits = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Deposits'));
const OwnerMaintenance = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Maintenance'));
const OwnerDocuments = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Documents'));
const OwnerReports = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Reports'));
const OwnerPreferences = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Preferences'));

/** Shown while a route's chunk is being fetched. */
const RouteFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label={t('Chargement de la page')}
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}
  >
    <Spin size="large" />
  </div>
);

/**
 * Le thème est lu une fois, au premier rendu : les variables de `tokens.css`
 * sont résolues à ce moment et ne changent plus (§3.2).
 */
const antdTheme = buildAntdTheme();

/**
 * `componentSize` est le seul levier qui applique `controlHeightLG` a tous les
 * composants AntD d'un coup. Sous 992 px, chaque controle passe donc a 44 px
 * (plancher tactile) et les champs a `fontSizeLG` = 16 px, la regle non
 * negociable du §3.2 contre le zoom automatique d'iOS Safari.
 */
/**
 * Remonte les ecrans a chaque changement de langue.
 *
 * `t()` est une fonction de module et non un hook (voir `i18n/t.ts`) : elle ne
 * reabonne aucun composant. Sans ce remontage, tout ce qui avait ete memorise
 * avant la bascule — colonnes de tableau construites dans un `useMemo`,
 * libelles d'options, formats de date captures a la construction — gardait ses
 * textes francais.
 *
 * Pose ICI, sous <AuthProvider> : plus haut, il aurait aussi remonte la session
 * et rejoue l'appel /me a chaque changement de langue.
 */
function LocalizedScreens({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  return <React.Fragment key={language}>{children}</React.Fragment>;
}

function ThemedApp({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useBreakpoint();
  const { antdLocale, direction } = useLanguage();
  return (
    <ConfigProvider
      theme={antdTheme}
      locale={antdLocale}
      // `direction` bascule toute la bibliotheque AntD en miroir pour l'arabe :
      // menus, Drawer, colonnes de tableau, fleches de pagination.
      direction={direction}
      componentSize={isDesktop ? 'middle' : 'large'}
    >
      {children}
    </ConfigProvider>
  );
}

/**
 * Créé une seule fois, au chargement du module.
 *
 * Le construire dans le rendu en ferait une instance neuve à chaque rendu de
 * `<App>` : le cache serait vidé à chaque fois, et React Query ne servirait
 * plus à rien tout en pesant son poids.
 */
const queryClient = createQueryClient();

function App() {
  return (
    <ErrorBoundary>
      {/* Cache, déduplication et revalidation (§8.4). Au-dessus du routeur :
          le cache doit survivre aux changements d'écran, c'est tout son
          intérêt. */}
      <QueryClientProvider client={queryClient}>
        {/* `locale` francise DatePicker, Pagination, Table, Upload et Empty (§3.5). */}
        <LanguageProvider>
          <ThemedApp>
            {/* <App> fournit message/notification/modal contextualises : les
            fonctions statiques d'AntD ignorent le ConfigProvider depuis la v5
            et s'afficheraient au theme par defaut (§5.7). */}
            <AntApp>
              <FeedbackBridge />
              <AuthProvider>
                {/* Relie la langue affichee au compte connecte. Sous
                <AuthProvider>, seul endroit d'ou la session est visible. */}
                <LanguagePreferenceSync />
                <Router>
                  {/* Every page below is code-split; this boundary covers chunk loading. */}
                  <LocalizedScreens>
                    <Suspense fallback={<RouteFallback />}>
                      {/* Le `key` remonte les ecrans a chaque changement de langue.
                    `t()` est une fonction de module, pas un hook : elle ne
                    reabonne rien, et sans ce remontage tout ce qui avait ete
                    memorise avant la bascule — colonnes de tableau construites
                    dans un `useMemo`, libelles d'options, formats de date
                    captures a la construction — gardait ses textes francais.
                    Le `key` est pose ICI, sous <AuthProvider> : plus haut, il
                    aurait aussi remonte la session et rejoue le /me a chaque
                    changement de langue. */}
                      <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/verify-email" element={<VerifyEmail />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/auth/callback" element={<AuthCallback />} />
                        <Route path="/auth/accept-invite" element={<AcceptInvitePage />} />
                        <Route path="/newsletter/unsubscribe" element={<UnsubscribePage />} />
                        <Route path="/newsletter/confirm" element={<ConfirmPage />} />
                        <Route path="/newsletter/subscribe" element={<SubscribePage />} />
                        {/* Coquille — routes authentifiees. <AppShell> est monte UNE fois et persiste
                      d un ecran a l autre : c est ce que <Outlet/> apporte, la ou les 81 pages
                      remontaient DashboardLayout a chaque navigation (§4.1). */}
                        <Route
                          element={
                            <ProtectedRoute>
                              <AppShell />
                            </ProtectedRoute>
                          }
                        >
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/properties" element={<Properties />} />
                          {/* Fusions du §4.3. Les ecrans disparaissent, les URL en
                        circulation sont redirigees et non cassees.
                        Clients -> CRM Contacts : meme entite, deux listes,
                        deux interfaces. /clients/new etait deja une
                        redirection vers le formulaire de contact CRM.
                        Transactions -> Affaires filtrees par type, Rapports ->
                        Releves : deux pages-passerelles qui n'affichaient
                        qu'un Empty ou des cartes de redirection, au prix de
                        trois clics. */}
                          <Route path="/clients" element={<TenantRedirect to="crm/contacts" />} />
                          <Route path="/clients/new" element={<TenantRedirect to="crm/contacts/new" />} />
                          <Route
                            path="/clients/groups"
                            element={<TenantRedirect to="crm/contacts" keepParams={['group']} />}
                          />
                          <Route path="/transactions" element={<TenantRedirect to="crm/deals" />} />
                          <Route
                            path="/transactions/sales"
                            element={<TenantRedirect to="crm/deals" query={{ type: 'SALE' }} />}
                          />
                          <Route
                            path="/transactions/rentals"
                            element={<TenantRedirect to="crm/deals" query={{ type: 'RENT' }} />}
                          />
                          <Route path="/reports" element={<TenantRedirect to="patrimoine/statements" />} />
                          {/* SettingsLayout n'est plus qu'un <Outlet/> : la coquille
                        lui vient desormais du parent, comme aux autres ecrans. */}
                          <Route path="/settings" element={<SettingsLayout />}>
                            <Route index element={<Navigate to="/settings/profile" replace />} />
                            <Route path="profile" element={<ProfilePage />} />
                          </Route>
                        </Route>
                        {/* Coquille — routes d'agence. requireTenant est active ICI, en un seul point,
                      au lieu de 63 routes a annoter une par une. La prop existait mais
                      n etait passee nulle part : les routes /tenant/:tenantId/* ne verifiaient
                      pas que l agence de l URL etait celle de l utilisateur (§4.1). */}
                        <Route
                          element={
                            <ProtectedRoute requireTenant>
                              <AppShell />
                            </ProtectedRoute>
                          }
                        >
                          <Route path="/tenant/:tenantId/properties" element={<Properties />} />
                          <Route path="/tenant/:tenantId/properties/new" element={<PropertyCreate />} />
                          <Route
                            path="/tenant/:tenantId/properties/visits/calendar"
                            element={<PropertyVisitsCalendar />}
                          />
                          <Route path="/tenant/:tenantId/properties/:id/edit" element={<PropertyEdit />} />
                          <Route path="/tenant/:tenantId/properties/:id" element={<PropertyDetail />} />
                          <Route path="/tenant/:tenantId/patrimoine" element={<PatrimoineOverviewPage />} />
                          <Route
                            path="/tenant/:tenantId/patrimoine/performance"
                            element={<PatrimoinePerformancePage />}
                          />
                          <Route path="/tenant/:tenantId/patrimoine/work-programs" element={<WorkProgramsPage />} />
                          <Route path="/tenant/:tenantId/patrimoine/statements" element={<OwnerStatementsPage />} />
                          <Route
                            path="/tenant/:tenantId/patrimoine/statements/:id"
                            element={<OwnerStatementDetailPage />}
                          />
                          <Route path="/tenant/:tenantId/syndics" element={<SyndicsList />} />
                          {/* Famille « Copropriété » — fiche, lots (et le compte d'un lot,
                        rattaché à l'onglet Lots), prestataires, profils et incidents.
                        Même route de layout que les deux familles suivantes : elle ne
                        change aucune URL, elle pose l'en-tête de la copropriété et la
                        barre d'onglets au-dessus de <Outlet/>. */}
                          <Route element={<SyndicWorkspaceLayout family="copropriete" />}>
                            <Route path="/tenant/:tenantId/syndics/:syndicId" element={<SyndicDetail />} />
                            <Route path="/tenant/:tenantId/syndics/:syndicId/lots" element={<SyndicLots />} />
                            <Route
                              path="/tenant/:tenantId/syndics/:syndicId/lots/:lotId/compte"
                              element={<SyndicOwnerAccount />}
                            />
                            <Route
                              path="/tenant/:tenantId/syndics/:syndicId/prestataires"
                              element={<SyndicProviders />}
                            />
                            <Route
                              path="/tenant/:tenantId/syndics/:syndicId/profils-incidents"
                              element={<SyndicProfilesIncidents />}
                            />
                          </Route>
                          {/* Famille « Finances » — dans l'ordre du flux : budgets, appels de
                        charges, recouvrement, trésorerie, comptabilité. */}
                          <Route element={<SyndicWorkspaceLayout family="finances" />}>
                            <Route path="/tenant/:tenantId/syndics/:syndicId/budgets" element={<SyndicBudgets />} />
                            <Route path="/tenant/:tenantId/syndics/:syndicId/charges" element={<SyndicCharges />} />
                            <Route
                              path="/tenant/:tenantId/syndics/:syndicId/recouvrement"
                              element={<SyndicRecovery />}
                            />
                            <Route path="/tenant/:tenantId/syndics/:syndicId/finances" element={<SyndicFinances />} />
                            <Route
                              path="/tenant/:tenantId/syndics/:syndicId/comptabilite"
                              element={<SyndicAccounting />}
                            />
                          </Route>
                          {/* Famille « Assemblées et documents » — la fiche d'une assemblée
                        reste rattachée à l'onglet Assemblées générales. */}
                          <Route element={<SyndicWorkspaceLayout family="assemblees-documents" />}>
                            <Route path="/tenant/:tenantId/syndics/:syndicId/assemblees" element={<SyndicMeetings />} />
                            <Route
                              path="/tenant/:tenantId/syndics/:syndicId/assemblees/:meetingId"
                              element={<SyndicMeetingDetail />}
                            />
                            <Route path="/tenant/:tenantId/syndics/:syndicId/documents" element={<SyndicDocuments />} />
                          </Route>
                          <Route path="/tenant/:tenantId/collaborators" element={<CollaboratorsList />} />
                          <Route path="/tenant/:tenantId/collaborators/:userId" element={<CollaboratorDetail />} />
                          <Route path="/tenant/:tenantId/invite" element={<InviteCollaborator />} />
                          <Route path="/tenant/:tenantId/invitations" element={<InvitationsList />} />
                          <Route path="/tenant/:tenantId/settings" element={<TenantSettings />} />
                          <Route path="/tenant/:tenantId/settings/finance" element={<AgencyFinanceSettings />} />
                          <Route path="/tenant/:tenantId/documents/templates" element={<DocumentTemplates />} />
                          <Route path="/tenant/:tenantId/crm/contacts" element={<Contacts />} />
                          <Route path="/tenant/:tenantId/crm/contacts/new" element={<ContactFormPage />} />
                          <Route path="/tenant/:tenantId/crm/contacts/:contactId" element={<ContactDetailPage />} />
                          <Route path="/tenant/:tenantId/crm/contacts/:contactId/edit" element={<ContactFormPage />} />
                          <Route path="/tenant/:tenantId/crm/deals" element={<Deals />} />
                          <Route path="/tenant/:tenantId/crm/deals/new" element={<DealFormPage />} />
                          <Route path="/tenant/:tenantId/crm/deals/:dealId" element={<DealDetailPage />} />
                          <Route path="/tenant/:tenantId/crm/deals/:dealId/edit" element={<DealFormPage />} />
                          <Route path="/tenant/:tenantId/crm/activities" element={<Activities />} />
                          <Route path="/tenant/:tenantId/crm/dashboard" element={<CrmDashboard />} />
                          <Route path="/tenant/:tenantId/crm/calendar" element={<CalendarPage />} />
                          <Route path="/tenant/:tenantId/rental/leases" element={<Leases />} />
                          <Route path="/tenant/:tenantId/rental/leases/new" element={<LeaseFormPage />} />
                          <Route path="/tenant/:tenantId/rental/leases/:leaseId" element={<LeaseDetailPage />} />
                          <Route path="/tenant/:tenantId/rental/leases/:leaseId/edit" element={<LeaseFormPage />} />
                          <Route path="/tenant/:tenantId/rental/installments" element={<Installments />} />
                          <Route
                            path="/tenant/:tenantId/rental/installments/:installmentId"
                            element={<InstallmentDetailPage />}
                          />
                          <Route path="/tenant/:tenantId/rental/payments" element={<Payments />} />
                          <Route path="/tenant/:tenantId/rental/payments/:paymentId" element={<PaymentDetailPage />} />
                          {/*
                        Finance. Les écrans d'un même flux partagent une route
                        de layout (FinanceWorkspaceLayout) qui pose l'en-tête
                        de la famille et ses onglets au-dessus de <Outlet/> :
                        aucune URL ne change. Les familles et leurs onglets
                        sont décrits dans `navigation/finance-workspaces.tsx`.
                        Les sous-routes de détail sont rangées avec leur liste,
                        pour garder les onglets visibles et actifs.
                      */}
                          {/* Caisse et trésorerie. Doit rester AVANT la route
                        PieceDeCaisse plus bas, déclarée sur la même adresse :
                        à égalité, React Router garde la première rencontrée. */}
                          <Route element={<FinanceWorkspaceLayout family="caisse-tresorerie" />}>
                            <Route path="/tenant/:tenantId/finance/caisse" element={<Caisse />} />
                            <Route path="/tenant/:tenantId/finance/tresorerie" element={<Tresorerie />} />
                          </Route>
                          <Route element={<FinanceWorkspaceLayout family="saisie-validation" />}>
                            <Route path="/tenant/:tenantId/finance/validation" element={<FileDeValidation />} />
                            {/*
                          Importation. Un seul menu, une seule adresse : la
                          nature du document se choisit DANS l'ecran, pas dans
                          l'URL. Rien n'y est propre a une nature, et la
                          huitieme s'ajoutera par un descripteur de
                          `lib/importation/natures.ts` sans toucher a cette
                          route.
                        */}
                            <Route path="/tenant/:tenantId/finance/importation" element={<Importation />} />
                          </Route>
                          <Route path="/tenant/:tenantId/finance/comptabilite" element={<Comptabilite />} />
                          <Route element={<FinanceWorkspaceLayout family="facturation-balances" />}>
                            <Route path="/tenant/:tenantId/finance/facturation" element={<Facturation />} />
                            <Route path="/tenant/:tenantId/finance/balance-clients" element={<BalanceClients />} />
                            <Route path="/tenant/:tenantId/finance/balance-agee" element={<BalanceAgee />} />
                          </Route>
                          <Route element={<FinanceWorkspaceLayout family="reversements-commissions" />}>
                            <Route path="/tenant/:tenantId/finance/owner-accounts" element={<ComptesProprietaires />} />
                            <Route
                              path="/tenant/:tenantId/finance/owner-accounts/:ownerClientId"
                              element={<CompteProprietaire />}
                            />
                            <Route path="/tenant/:tenantId/finance/associations" element={<Associations />} />
                            <Route
                              path="/tenant/:tenantId/finance/associations/:partnershipId"
                              element={<Association />}
                            />
                            <Route path="/tenant/:tenantId/finance/commissions" element={<CommissionsAgents />} />
                          </Route>
                          {/* Relevé d'un compte de tiers : ouvert depuis la balance
                        clients, la balance âgée ET la balance fournisseurs, il
                        n'appartient à aucune famille et reste hors onglets. */}
                          <Route path="/tenant/:tenantId/finance/comptes/:accountId" element={<Releve />} />
                          <Route element={<FinanceWorkspaceLayout family="fournisseurs-commandes" />}>
                            <Route path="/tenant/:tenantId/finance/fournisseurs" element={<Fournisseurs />} />
                            {/*
                          Le fournisseur voyage en PARAMETRE DE REQUETE
                          (`?fournisseur=`), et non dans le chemin : cet ecran
                          porte son propre selecteur et s'ouvre legitimement sans
                          fournisseur choisi. La liste des fournisseurs pointe
                          vers cette adresse depuis toujours ; c'est la route
                          declaree ici qui avait une autre forme, si bien que
                          cliquer un fournisseur ne menait nulle part. Corrige le
                          19 septembre 2026. Rattachee a l'onglet Fournisseurs
                          par son `activeFor`.
                        */}
                            <Route
                              path="/tenant/:tenantId/finance/factures-fournisseurs"
                              element={<FactureFournisseur />}
                            />
                            {/*
                          Lot 3. L'ordre compte : « nouveau » AVANT
                          « :orderId », sinon React Router rangerait le mot
                          « nouveau » dans le parametre et l'ecran chercherait un
                          bon de commande qui n'existe pas. Le classement de
                          React Router par specificite ne departage pas un
                          segment fixe d'un segment variable au meme rang.
                        */}
                            <Route path="/tenant/:tenantId/finance/bons-de-commande" element={<BonsDeCommande />} />
                            <Route
                              path="/tenant/:tenantId/finance/bons-de-commande/nouveau"
                              element={<BonDeCommande />}
                            />
                            <Route
                              path="/tenant/:tenantId/finance/bons-de-commande/:orderId"
                              element={<BonDeCommande />}
                            />
                            <Route
                              path="/tenant/:tenantId/finance/fournisseurs/balance"
                              element={<BalanceFournisseurs />}
                            />
                          </Route>
                          <Route path="/tenant/:tenantId/finance/retenues" element={<RetenuesDeGarantie />} />
                          <Route element={<FinanceWorkspaceLayout family="suivi-chantiers" />}>
                            <Route path="/tenant/:tenantId/finance/chantiers" element={<Chantiers />} />
                            <Route path="/tenant/:tenantId/finance/chantiers/:siteId" element={<ChantierDetail />} />
                            <Route
                              path="/tenant/:tenantId/finance/chantiers/:siteId/budget"
                              element={<BudgetChantier />}
                            />
                            <Route
                              path="/tenant/:tenantId/finance/chantiers/:siteId/stock"
                              element={<StockChantier />}
                            />
                            <Route
                              path="/tenant/:tenantId/finance/chantiers/:siteId/cloture"
                              element={<ClotureChantier />}
                            />
                            <Route
                              path="/tenant/:tenantId/finance/tableau-de-bord-chantiers"
                              element={<TableauDeBordChantiers />}
                            />
                            {/* Lot 4 : les baux de terrain. L'identifiant du bail
                          voyage dans le CHEMIN, et c'est bien ce que l'ecran
                          lit — verifie par un test de navigation dedie du cote
                          de l'ecran, apres deux occurrences du defaut inverse
                          aux lots 2 et 3. */}
                            <Route path="/tenant/:tenantId/finance/baux-terrain" element={<BauxDeTerrain />} />
                            <Route
                              path="/tenant/:tenantId/finance/baux-terrain/:landLeaseId"
                              element={<BailDeTerrain />}
                            />
                          </Route>
                          <Route element={<FinanceWorkspaceLayout family="gestion-stock" />}>
                            <Route path="/tenant/:tenantId/finance/stock" element={<Stock />} />
                            <Route path="/tenant/:tenantId/finance/stock/inventaire" element={<StockInventaire />} />
                            <Route path="/tenant/:tenantId/finance/stock/parametrage" element={<StockReferentiel />} />
                          </Route>
                          <Route path="/tenant/:tenantId/finance/salaires" element={<Salaires />} />
                          <Route path="/tenant/:tenantId/finance/salaires/:employeeId" element={<Salarie />} />
                          <Route path="/tenant/:tenantId/finance/tacherons" element={<Tacherons />} />
                          <Route path="/tenant/:tenantId/finance/tacherons/:contractorId" element={<Tacheron />} />
                          {/*
                        Le chantier voyage en PARAMETRE DE REQUETE
                        (`?chantierId=`), comme l'ecran le lit : il porte son
                        propre selecteur et s'ouvre legitimement sans chantier
                        choisi. Le detail d'un chantier pointe vers cette
                        adresse depuis toujours ; c'est la route qui portait
                        l'identifiant dans le chemin, si bien que le bouton
                        « Nouvelle piece de caisse » ne menait nulle part.
                        Meme defaut que sur les factures fournisseurs, corrige
                        la veille, et reste ici. Trouve par l'agent des ecrans
                        du lot 3, hors de son territoire.
                        NB : la route Caisse, plus haut, porte la même adresse
                        et passe la première — cet écran n'est aujourd'hui
                        jamais rendu.
                      */}
                          <Route path="/tenant/:tenantId/finance/caisse" element={<PieceDeCaisse />} />
                          <Route path="/tenant/:tenantId/sales" element={<SalesDashboard />} />
                          <Route path="/tenant/:tenantId/sales/mandates" element={<SaleMandates />} />
                          <Route path="/tenant/:tenantId/sales/mandates/:id" element={<SaleMandateDetail />} />
                          <Route path="/tenant/:tenantId/sales/agreements/:id" element={<SaleAgreementDetail />} />
                          <Route path="/tenant/:tenantId/sales/commissions" element={<SaleCommissions />} />
                          <Route path="/tenant/:tenantId/maintenance" element={<TicketList />} />
                          <Route path="/tenant/:tenantId/maintenance/new" element={<CreateTicket />} />
                          <Route path="/tenant/:tenantId/maintenance/:ticketId/edit" element={<EditTicket />} />
                          <Route path="/tenant/:tenantId/maintenance/:ticketId" element={<TicketDetail />} />
                          <Route path="/tenant/:tenantId/admin/maintenance/tickets" element={<ManagerTickets />} />
                          <Route
                            path="/tenant/:tenantId/admin/maintenance/tickets/:ticketId"
                            element={<ManagerTicketDetail />}
                          />
                          <Route path="/tenant/:tenantId/admin/maintenance/vendors" element={<Vendors />} />
                          <Route
                            path="/tenant/:tenantId/communication/email-notifications"
                            element={<EmailNotificationsUnifiedPage />}
                          />
                          <Route
                            path="/tenant/:tenantId/communication/whatsapp-notifications"
                            element={<WhatsAppNotificationsPage />}
                          />
                          <Route
                            path="/tenant/:tenantId/communication/whatsapp-group-message"
                            element={<WhatsAppGroupMessagePage />}
                          />
                          <Route
                            path="/tenant/:tenantId/email-notifications"
                            element={<EmailNotificationsUnifiedPage />}
                          />
                          <Route path="/tenant/:tenantId/newsletter/lists" element={<NewsletterListsPage />} />
                          <Route path="/tenant/:tenantId/newsletter/campaigns" element={<NewsletterCampaignsPage />} />
                          <Route path="/tenant/:tenantId/newsletter/templates" element={<NewsletterTemplatesPage />} />
                        </Route>
                        {/* Coquille — administration de la plateforme. */}
                        <Route
                          element={
                            <ProtectedRoute requiredRole="SUPER_ADMIN">
                              <AppShell />
                            </ProtectedRoute>
                          }
                        >
                          <Route path="/admin/tenants" element={<TenantsList />} />
                          <Route path="/admin/tenants/new" element={<TenantCreate />} />
                          <Route path="/admin/tenants/:tenantId" element={<TenantDetail />} />
                          <Route path="/admin/tenants/:tenantId/edit" element={<TenantEdit />} />
                          <Route
                            path="/admin/tenants/:tenantId/collaborators/:userId"
                            element={<AdminCollaboratorDetail />}
                          />
                          <Route
                            path="/admin/tenants/:tenantId/collaborators/invite"
                            element={<AdminInviteCollaborator />}
                          />
                          <Route path="/admin/statistics" element={<Statistics />} />
                          <Route path="/admin/audit" element={<AuditLogs />} />
                          <Route path="/admin/roles-permissions" element={<RolesPermissions />} />
                        </Route>
                        {/* Property Routes */}
                        {/* Legacy route for backward compatibility */}
                        {/* Admin Routes */}
                        {/* Tenant Routes */}
                        {/* Client Routes */}
                        {/* CRM Routes */}
                        {/* Rental Management Routes */}
                        {/* Maintenance Routes */}
                        {/* Manager Maintenance Routes */}
                        {/* Communication: email + WhatsApp notifications */}
                        {/* Transactions Routes */}
                        {/* Reports Route */}
                        {/* Portail locataire — meme coquille que le reste (§4.1).
                      La sidebar de 256 px et le drawer de ce portail sont
                      supprimes : quatre onglets couvrent ses six destinations,
                      et son usage est 100 % mobile (§4.2). */}
                        <Route
                          path="/tenant"
                          element={
                            <ProtectedRoute>
                              <AppShell />
                            </ProtectedRoute>
                          }
                        >
                          <Route index element={<TenantDashboard />} />
                          <Route path="lease" element={<TenantLease />} />
                          <Route path="payments" element={<TenantPayments />} />
                          <Route path="deposit" element={<TenantDeposit />} />
                          <Route path="maintenance" element={<TenantMaintenance />} />
                          <Route path="documents" element={<TenantDocuments />} />
                        </Route>
                        {/* Portail proprietaire — meme coquille. La garde defensive
                      qui manquait a OwnerPortal/Layout est desormais posee par
                      <AppShell> pour les deux portails a la fois (§4.3). */}
                        <Route
                          path="/owner"
                          element={
                            <ProtectedRoute>
                              <AppShell />
                            </ProtectedRoute>
                          }
                        >
                          <Route index element={<OwnerDashboard />} />
                          <Route path="properties" element={<OwnerProperties />} />
                          <Route path="properties/:id" element={<OwnerPropertyDetails />} />
                          <Route path="leases" element={<OwnerLeases />} />
                          <Route path="leases/:id" element={<OwnerLeaseDetails />} />
                          <Route path="revenues" element={<OwnerRevenues />} />
                          <Route path="installments" element={<OwnerInstallments />} />
                          <Route path="payments" element={<OwnerPayments />} />
                          <Route path="account" element={<OwnerAccount />} />
                          <Route path="deposits" element={<OwnerDeposits />} />
                          <Route path="maintenance" element={<OwnerMaintenance />} />
                          <Route path="documents" element={<OwnerDocuments />} />
                          <Route path="reports" element={<OwnerReports />} />
                          <Route path="preferences" element={<OwnerPreferences />} />
                        </Route>
                        {/* User Settings & Profile Routes */}
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        {/* Route attrape-tout. Sans elle, toute URL non reconnue
                      affichait une page blanche, sans erreur ni redirection
                      (§4.3) — c'etait le cas de /properties/categories, promise
                      par le menu public et jamais implementee. */}
                        {/* Atelier de vérification visuelle. `import.meta.env.DEV`
                        est remplacé par `false` au build : Vite élimine alors
                        la branche entière, et l'import dynamique avec elle. Le
                        module n'existe pas en production, la route non plus. */}
                        {Atelier && <Route path="/atelier/*" element={<Atelier />} />}
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </LocalizedScreens>
                </Router>
              </AuthProvider>
            </AntApp>
          </ThemedApp>
        </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
