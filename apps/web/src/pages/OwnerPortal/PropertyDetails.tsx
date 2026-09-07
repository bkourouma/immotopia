import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Tag,
  Space,
  Row,
  Col,
  Typography,
  Alert,
  Spin,
  Descriptions,
  Empty,
  Tabs,
  List,
  Statistic,
} from 'antd';
import {
  ArrowLeftOutlined,
  HomeOutlined,
  DollarOutlined,
  FileTextOutlined,
  ToolOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface PropertyDetailsData {
  property: {
    id: string;
    address: string;
    title: string;
    propertyType: string;
    status: string;
    transactionModes: string[];
    description: string;
    media: Array<{
      id: string;
      fileUrl: string;
      fileName: string;
      mediaType: string;
      isPrimary: boolean;
    }>;
    documents: Array<{
      id: string;
      fileName: string;
      documentType: string;
      fileUrl: string;
    }>;
  };
  currentLease?: {
    id: string;
    start_date: string;
    end_date: string | null;
    rent_amount: number;
    service_charge_amount: number;
    status: string;
    primaryRenter: {
      user: {
        fullName: string;
        email: string;
      };
    };
    coRenters: Array<{
      user: {
        fullName: string;
        email: string;
      };
    }>;
  } | null;
  leaseHistory: Array<{
    id: string;
    start_date: string;
    end_date: string | null;
    rent_amount: number;
    status: string;
    primaryRenter: {
      user: {
        fullName: string;
        email: string;
      };
    };
  }>;
  revenueStats: {
    totalReceived: number;
    currentMonth: number;
    averageMonthly: number;
  };
  maintenanceHistory: Array<{
    id: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    created_at: string;
  }>;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const propertyTypeLabels: Record<string, string> = {
  APPARTEMENT: 'Appartement',
  MAISON_VILLA: 'Maison/Villa',
  STUDIO: 'Studio',
  DUPLEX_TRIPLEX: 'Duplex/Triplex',
  CHAMBRE_COLOCATION: 'Chambre en colocation',
  BUREAU: 'Bureau',
  BOUTIQUE_COMMERCIAL: 'Boutique/Commercial',
  ENTREPOT_INDUSTRIEL: 'Entrepôt/Industriel',
  TERRAIN: 'Terrain',
  IMMEUBLE: 'Immeuble',
  PARKING_BOX: 'Parking/Box',
  LOT_PROGRAMME_NEUF: 'Lot programme neuf'
};

const propertyStatusLabels: Record<string, string> = {
  DRAFT: 'Brouillon',
  UNDER_REVIEW: 'En cours d\'examen',
  AVAILABLE: 'Disponible',
  RESERVED: 'Réservé',
  UNDER_OFFER: 'Sous offre',
  RENTED: 'Loué',
  SOLD: 'Vendu',
  ARCHIVED: 'Archivé'
};

const translatePropertyType = (value: string) =>
  propertyTypeLabels[value] || value;

const translatePropertyStatus = (value: string) =>
  propertyStatusLabels[value] || value;

const transactionModeLabels: Record<string, string> = {
  SALE: 'Vente',
  RENTAL: 'Location',
  SHORT_TERM: 'Location courte durée'
};

const translateTransactionMode = (value: string) =>
  transactionModeLabels[value] || value;

export default function PropertyDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PropertyDetailsData | null>(null);

  useEffect(() => {
    if (id) {
      loadPropertyDetails();
    }
  }, [id]);

  const loadPropertyDetails = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const response = await ownerPortalService.getPropertyDetails(id);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError('Erreur lors du chargement des détails');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des détails');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement des détails..." />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Erreur"
        description={error}
        type="error"
        showIcon
        action={
          <Button onClick={() => navigate('/owner/properties')}>
            Retour à la liste
          </Button>
        }
      />
    );
  }

  if (!data) {
    return <Empty description="Aucune donnée disponible" />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header */}
      <div>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/owner/properties')}
          style={{ marginBottom: 16 }}
        >
          Retour
        </Button>
        <Title level={2}>{data.property.title}</Title>
        <Text type="secondary">{data.property.address}</Text>
      </div>

      <Tabs defaultActiveKey="info">
        {/* T048: Property Information Section */}
        <TabPane tab={<><HomeOutlined /> Informations</>} key="info">
          <Card title="Informations de la propriété">
            <Descriptions column={2} bordered>
              <Descriptions.Item label="Adresse">{data.property.address}</Descriptions.Item>
              <Descriptions.Item label="Type">{translatePropertyType(data.property.propertyType)}</Descriptions.Item>
              <Descriptions.Item label="Statut">
                <Tag color={data.property.status === 'RENTED' ? 'success' : 'default'}>
                  {translatePropertyStatus(data.property.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Modes de transaction">
                {data.property.transactionModes.map(mode => (
                  <Tag key={mode}>{translateTransactionMode(mode)}</Tag>
                ))}
              </Descriptions.Item>
              <Descriptions.Item label="Description" span={2}>
                {data.property.description}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </TabPane>

        {/* T049: Current Lease Section */}
        <TabPane tab={<><FileTextOutlined /> Bail actif</>} key="lease">
          {data.currentLease ? (
            <Card title="Bail actif">
              <Descriptions column={2} bordered>
                <Descriptions.Item label="Locataire principal">
                  {data.currentLease.primaryRenter.user.fullName}
                </Descriptions.Item>
                <Descriptions.Item label="Email">
                  {data.currentLease.primaryRenter.user.email}
                </Descriptions.Item>
                <Descriptions.Item label="Date de début">
                  {formatDate(data.currentLease.start_date)}
                </Descriptions.Item>
                <Descriptions.Item label="Date de fin">
                  {data.currentLease.end_date ? formatDate(data.currentLease.end_date) : 'Non définie'}
                </Descriptions.Item>
                <Descriptions.Item label="Loyer mensuel">
                  {formatCurrency(Number(data.currentLease.rent_amount))}
                </Descriptions.Item>
                <Descriptions.Item label="Charges">
                  {formatCurrency(Number(data.currentLease.service_charge_amount))}
                </Descriptions.Item>
                <Descriptions.Item label="Statut">
                  <Tag color={data.currentLease.status === 'ACTIVE' ? 'success' : 'default'}>
                    {data.currentLease.status}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>

              {data.currentLease.coRenters.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <Title level={4}>Co-locataires</Title>
                  <List
                    dataSource={data.currentLease.coRenters}
                    renderItem={(coRenter) => (
                      <List.Item>
                        <List.Item.Meta
                          title={coRenter.user.fullName}
                          description={coRenter.user.email}
                        />
                      </List.Item>
                    )}
                  />
                </div>
              )}
            </Card>
          ) : (
            <Empty description="Aucun bail actif" />
          )}
        </TabPane>

        {/* T050: Lease History Section */}
        <TabPane tab={<><CalendarOutlined /> Historique des baux</>} key="history">
          {data.leaseHistory.length > 0 ? (
            <Card title="Historique des baux">
              <List
                dataSource={data.leaseHistory}
                renderItem={(lease) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{lease.primaryRenter.user.fullName}</Text>
                          <Tag color="default">Terminé</Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <Text type="secondary">
                            Du {formatDate(lease.start_date)} au {lease.end_date ? formatDate(lease.end_date) : 'N/A'}
                          </Text>
                          <Text type="secondary">
                            Loyer: {formatCurrency(Number(lease.rent_amount))} / mois
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          ) : (
            <Empty description="Aucun historique de bail" />
          )}
        </TabPane>

        {/* T051: Revenue Statistics Section */}
        <TabPane tab={<><DollarOutlined /> Statistiques de revenus</>} key="revenue">
          <Card title="Statistiques de revenus">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} lg={8}>
                <Statistic
                  title="Total reçu"
                  value={formatCurrency(data.revenueStats.totalReceived)}
                  prefix={<DollarOutlined />}
                />
              </Col>
              <Col xs={24} sm={12} lg={8}>
                <Statistic
                  title="Ce mois"
                  value={formatCurrency(data.revenueStats.currentMonth)}
                  prefix={<DollarOutlined />}
                />
              </Col>
              <Col xs={24} sm={12} lg={8}>
                <Statistic
                  title="Moyenne mensuelle"
                  value={formatCurrency(data.revenueStats.averageMonthly)}
                  prefix={<DollarOutlined />}
                />
              </Col>
            </Row>
          </Card>
        </TabPane>

        {/* T052: Maintenance History Section */}
        <TabPane tab={<><ToolOutlined /> Historique maintenance</>} key="maintenance">
          {data.maintenanceHistory.length > 0 ? (
            <Card title="Historique de maintenance">
              <List
                dataSource={data.maintenanceHistory}
                renderItem={(ticket) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{ticket.title}</Text>
                          <Tag color={ticket.status === 'RESOLVED' ? 'success' : 'processing'}>
                            {ticket.status}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <Text type="secondary">Catégorie: {ticket.category}</Text>
                          <Text type="secondary">Priorité: {ticket.priority}</Text>
                          <Text type="secondary">Créé le: {formatDate(ticket.created_at)}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          ) : (
            <Empty description="Aucun ticket de maintenance" />
          )}
        </TabPane>
      </Tabs>
    </Space>
  );
}
