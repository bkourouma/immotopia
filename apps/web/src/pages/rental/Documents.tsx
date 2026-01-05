import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Button } from '../../components/ui/button';
import {
  listDocuments,
  generateDocument,
  updateDocumentStatus,
  RentalDocument,
  RentalDocumentType,
  RentalDocumentStatus,
  DocumentFilters,
  GenerateDocumentRequest,
} from '../../services/rental-service';
import { Plus, FileText, Eye, Download, CheckCircle, XCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { DocumentForm } from '../../components/rental/DocumentForm';

interface DocumentsProps {
  leaseId?: string;
}

export const Documents: React.FC<DocumentsProps> = ({ leaseId: propLeaseId }) => {
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const [documents, setDocuments] = useState<RentalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState<DocumentFilters>({
    leaseId: leaseId,
    page: 1,
    limit: 50,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    if (tenantId) {
      loadDocuments();
    }
  }, [tenantId, filters, leaseId]);

  const loadDocuments = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listDocuments(tenantId, {
        ...filters,
        leaseId: leaseId || filters.leaseId,
      });
      if (response.success) {
        setDocuments(response.data);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des documents');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des documents');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (data: GenerateDocumentRequest) => {
    if (!tenantId) return;
    try {
      await generateDocument(tenantId, data);
      setShowForm(false);
      await loadDocuments();
    } catch (err: any) {
      throw err;
    }
  };

  const handleStatusChange = async (documentId: string, newStatus: RentalDocumentStatus) => {
    if (!tenantId) return;
    try {
      await updateDocumentStatus(tenantId, documentId, newStatus);
      await loadDocuments();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour du statut');
    }
  };

  const getStatusBadge = (status: RentalDocumentStatus) => {
    const statusMap: Record<RentalDocumentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      DRAFT: { label: 'Brouillon', variant: 'outline' },
      FINAL: { label: 'Final', variant: 'default' },
      VOID: { label: 'Annulé', variant: 'destructive' },
    };
    const config = statusMap[status] || { label: status, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTypeLabel = (type: RentalDocumentType) => {
    const typeMap: Record<RentalDocumentType, string> = {
      LEASE_CONTRACT: 'Contrat de bail',
      LEASE_ADDENDUM: 'Avenant',
      RENT_RECEIPT: 'Reçu de loyer',
      RENT_QUITTANCE: 'Quittance de loyer',
      DEPOSIT_RECEIPT: 'Reçu de dépôt',
      STATEMENT: 'Relevé',
      OTHER: 'Autre',
    };
    return typeMap[type] || type;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  // If used as standalone page (not in tab)
  const isStandalone = !propLeaseId;

  const content = (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Documents</h1>
            <p className="text-muted-foreground">
              {leaseId ? 'Documents du bail' : 'Gérez les documents de location'}
            </p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Générer un document
          </Button>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6">
            <DocumentForm
              tenantId={tenantId!}
              leaseId={leaseId}
              onSubmit={handleGenerate}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        <div className="flex items-center gap-4">
          <Select
            value={filters.type || 'all'}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                type: value === 'all' ? undefined : (value as RentalDocumentType),
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tous les types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="LEASE_CONTRACT">Contrat de bail</SelectItem>
              <SelectItem value="LEASE_ADDENDUM">Avenant</SelectItem>
              <SelectItem value="RENT_RECEIPT">Reçu de loyer</SelectItem>
              <SelectItem value="RENT_QUITTANCE">Quittance de loyer</SelectItem>
              <SelectItem value="DEPOSIT_RECEIPT">Reçu de dépôt</SelectItem>
              <SelectItem value="STATEMENT">Relevé</SelectItem>
              <SelectItem value="OTHER">Autre</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.status || 'all'}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                status: value === 'all' ? undefined : (value as RentalDocumentStatus),
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="DRAFT">Brouillon</SelectItem>
              <SelectItem value="FINAL">Final</SelectItem>
              <SelectItem value="VOID">Annulé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-8">Chargement...</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucun document trouvé
          </div>
        ) : (
          <>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Titre</TableHead>
                    <TableHead>Date d'émission</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        {doc.document_number}
                      </TableCell>
                      <TableCell>{getTypeLabel(doc.type)}</TableCell>
                      <TableCell>{doc.title || '-'}</TableCell>
                      <TableCell>{formatDate(doc.issued_at)}</TableCell>
                      <TableCell>{getStatusBadge(doc.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8001/api';
                                const downloadUrl = `${apiBaseUrl}/tenants/${tenantId}/documents/${doc.id}/download`;
                                
                                // Use fetch with credentials to download the file
                                const response = await fetch(downloadUrl, {
                                  method: 'GET',
                                  credentials: 'include',
                                });
                                
                                if (!response.ok) {
                                  throw new Error('Failed to download document');
                                }
                                
                                const blob = await response.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${doc.document_number || 'document'}.docx`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                              } catch (error) {
                                console.error('Error downloading document:', error);
                                alert('Erreur lors du téléchargement du document');
                              }
                            }}
                            title="Télécharger le document"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Page {pagination.page} sur {pagination.totalPages} ({pagination.total} documents)
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === 1}
                    onClick={() => setFilters({ ...filters, page: pagination.page - 1 })}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === pagination.totalPages}
                    onClick={() => setFilters({ ...filters, page: pagination.page + 1 })}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );

  if (isStandalone) {
    return <DashboardLayout>{content}</DashboardLayout>;
  }

  return content;
};

