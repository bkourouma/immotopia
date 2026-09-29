import React, { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Spin,
  Typography
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  getPropertyOwnership,
  updatePropertyOwnership,
  type PropertyOwnership
} from '../../services/property-ownership-service';
import { PropertyMandateCard } from './PropertyMandateCard';
import { t } from '../../i18n/t';
import { activeLocale } from '../../i18n/format';

const { Text } = Typography;

interface PropertyOwnershipCardProps {
  tenantId: string;
  propertyId: string;
}

/** Une ligne de la modale d'édition : un propriétaire pas forcément choisi encore, une part pas forcément saisie encore. */
interface LigneIndivision {
  ownerClientId: string;
  sharePercent: number | null;
}

/**
 * Indivision d'un bien : qui le possède, et dans quelle proportion.
 *
 * Un bien sans quote-part appartient en entier au propriétaire désigné sur ses
 * baux (`leaseOwner`), comme avant ce lot. Poser des quotes-parts ne change
 * rien à cette lecture tant qu'elles sont vides ; l'écran affiche alors la
 * même phrase que si l'indivision n'existait pas, plutôt qu'une liste vide
 * déroutante.
 *
 * Le total à 100 % est contrôlé côté client (bouton désactivé) ET côté
 * serveur (réponse 400) : le premier évite l'aller-retour la plupart du
 * temps, le second reste la seule source de vérité — d'où l'affichage tel
 * quel de son message sur `submitError`.
 */
/** « 33,3334 » : la part s'écrit dans la langue de l'interface, virgule comprise en français. */
const pourcentage = (valeur: number) => valeur.toLocaleString(activeLocale(), { maximumFractionDigits: 4 });

export const PropertyOwnershipCard: React.FC<PropertyOwnershipCardProps> = ({ tenantId, propertyId }) => {
  const { message } = App.useApp();

  const [donnees, setDonnees] = useState<PropertyOwnership | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [lignes, setLignes] = useState<LigneIndivision[]>([]);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [suppression, setSuppression] = useState(false);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreurChargement(null);
    getPropertyOwnership(tenantId, propertyId)
      .then(resultat => {
        if (!annule) setDonnees(resultat);
      })
      .catch((erreur: any) => {
        if (!annule) {
          setErreurChargement(erreur.response?.data?.message || t("Impossible de charger l'indivision de ce bien."));
        }
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [tenantId, propertyId]);

  /**
   * Ouvre la modale, avec la proposition de départ prescrite par le contrat :
   * les quotes-parts déjà posées si elles existent, sinon le propriétaire des
   * baux à 100 % si l'indivision est vide et qu'il existe, sinon rien.
   */
  const ouvrirModale = () => {
    setErreurEnvoi(null);
    if (!donnees) return;
    const courant = donnees;
    if (courant.shares.length > 0) {
      setLignes(courant.shares.map(part => ({ ownerClientId: part.ownerClientId, sharePercent: part.sharePercent })));
    } else if (courant.leaseOwner) {
      setLignes([{ ownerClientId: courant.leaseOwner.ownerClientId, sharePercent: 100 }]);
    } else {
      setLignes([]);
    }
    setModaleOuverte(true);
  };

  const ajouterLigne = () => {
    setLignes(precedentes => [...precedentes, { ownerClientId: '', sharePercent: null }]);
  };

  const supprimerLigne = (index: number) => {
    setLignes(precedentes => precedentes.filter((_, i) => i !== index));
  };

  const modifierProprietaire = (index: number, ownerClientId: string) => {
    setLignes(precedentes => precedentes.map((ligne, i) => (i === index ? { ...ligne, ownerClientId } : ligne)));
  };

  const modifierPart = (index: number, sharePercent: number | null) => {
    setLignes(precedentes => precedentes.map((ligne, i) => (i === index ? { ...ligne, sharePercent } : ligne)));
  };

  /**
   * 100 / n, tronqué à 4 décimales pour chaque ligne, avec le reste de
   * l'arrondi posé sur la dernière — pour que la somme tombe exactement à
   * 100, jamais à 99,9999 ou 100,0001. Pour trois propriétaires :
   * 33,3333 / 33,3333 / 33,3334.
   */
  const repartirEgalement = () => {
    setLignes(precedentes => {
      const n = precedentes.length;
      if (n === 0) return precedentes;
      const chacun = Math.floor((100 / n) * 10000) / 10000;
      const derniere = Math.round((100 - chacun * (n - 1)) * 10000) / 10000;
      return precedentes.map((ligne, i) => ({ ...ligne, sharePercent: i === n - 1 ? derniere : chacun }));
    });
  };

  const total = lignes.reduce((somme, ligne) => somme + (ligne.sharePercent || 0), 0);
  // Arrondi a 4 decimales avant comparaison : la somme flottante de
  // 33,3333 + 33,3333 + 33,3334 vaut 99,99999999999999 ou 100,00000000000001
  // selon l'ordre des operations, jamais exactement 100 sans ce passage.
  const totalArrondi = Math.round(total * 10000) / 10000;
  const totalOk = totalArrondi === 100;

  const identifiantsChoisis = lignes.map(ligne => ligne.ownerClientId).filter(Boolean);
  const doublon = new Set(identifiantsChoisis).size !== identifiantsChoisis.length;
  const ligneIncomplete = lignes.some(
    ligne => !ligne.ownerClientId || ligne.sharePercent == null || ligne.sharePercent <= 0
  );
  const peutEnregistrer = lignes.length > 0 && totalOk && !doublon && !ligneIncomplete;

  const enregistrer = async () => {
    if (!peutEnregistrer) return;
    setEnregistrement(true);
    setErreurEnvoi(null);
    try {
      const resultat = await updatePropertyOwnership(tenantId, propertyId, {
        shares: lignes.map(ligne => ({
          ownerClientId: ligne.ownerClientId,
          sharePercent: ligne.sharePercent as number
        }))
      });
      setDonnees(resultat);
      setModaleOuverte(false);
      message.success(t('Indivision enregistrée.'));
    } catch (erreur: any) {
      // Le 400 de l'API dit précisément ce qui cloche (« Les quotes-parts
      // doivent totaliser 100 % (actuellement 90 %). ») : on l'affiche tel
      // quel plutôt que de le remplacer par un message générique.
      setErreurEnvoi(
        erreur.response?.data?.message || t("Une erreur est survenue lors de l'enregistrement de l'indivision.")
      );
    } finally {
      setEnregistrement(false);
    }
  };

  const supprimerIndivision = async () => {
    setSuppression(true);
    try {
      const resultat = await updatePropertyOwnership(tenantId, propertyId, { shares: [] });
      setDonnees(resultat);
      message.success(t('Indivision supprimée.'));
    } catch (erreur: any) {
      message.error(
        erreur.response?.data?.message || t("Une erreur est survenue lors de la suppression de l'indivision.")
      );
    } finally {
      setSuppression(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Card title={t('Indivision')}>
        {chargement ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4) 0' }}>
            <Spin />
          </div>
        ) : erreurChargement ? (
          <Alert type="error" message={erreurChargement} showIcon />
        ) : donnees ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {donnees.shares.length === 0 ? (
              <Text>
                {donnees.leaseOwner
                  ? t("Pas d'indivision : le bien appartient à {{nom}}", { nom: donnees.leaseOwner.ownerName })
                  : t("Pas d'indivision : le bien appartient au propriétaire désigné sur les baux")}
              </Text>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {donnees.shares.map(part => (
                  <div key={part.ownerClientId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text>{part.ownerName}</Text>
                      <Text strong>{`${pourcentage(part.sharePercent)} %`}</Text>
                    </div>
                    <Progress percent={part.sharePercent} showInfo={false} />
                  </div>
                ))}
              </Space>
            )}

            <Space wrap>
              <Button onClick={ouvrirModale}>
                {donnees.shares.length === 0 ? t("Définir l'indivision") : t('Modifier')}
              </Button>
              {donnees.shares.length > 0 && (
                <Popconfirm
                  title={t("Supprimer l'indivision ?")}
                  description={t('Le bien reviendra en entier au propriétaire désigné sur les baux.')}
                  okText={t('Supprimer')}
                  cancelText={t('Annuler')}
                  okButtonProps={{ danger: true }}
                  onConfirm={supprimerIndivision}
                >
                  <Button danger loading={suppression}>
                    {t("Supprimer l'indivision")}
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Space>
        ) : null}

        <Modal
          title={donnees && donnees.shares.length > 0 ? t("Modifier l'indivision") : t("Définir l'indivision")}
          open={modaleOuverte}
          onCancel={() => setModaleOuverte(false)}
          footer={null}
          width={640}
          destroyOnHidden
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Text type="secondary">
              {t(
                'Les loyers, honoraires et dépenses du bien seront répartis selon ces parts dans le compte et le relevé de chaque propriétaire. Les reversements déjà faits ne changent pas.'
              )}
            </Text>

            {erreurEnvoi && <Alert type="error" message={erreurEnvoi} showIcon />}

            <Space direction="vertical" style={{ width: '100%' }} size="small">
              {lignes.map((ligne, index) => (
                // eslint-disable-next-line react/no-array-index-key -- l'index EST l'identité de la ligne, tant qu'elle est vide.
                <Space key={index} align="start" style={{ width: '100%' }}>
                  <Select
                    showSearch
                    virtual={false}
                    placeholder={t('Choisir un propriétaire')}
                    style={{ width: 280 }}
                    value={ligne.ownerClientId || undefined}
                    optionFilterProp="children"
                    onChange={valeur => modifierProprietaire(index, valeur)}
                  >
                    {(donnees?.owners || []).map(proprietaire => (
                      <Select.Option key={proprietaire.ownerClientId} value={proprietaire.ownerClientId}>
                        {proprietaire.ownerName}
                      </Select.Option>
                    ))}
                  </Select>
                  <InputNumber
                    min={0}
                    max={100}
                    // Pas de `precision` : elle afficherait « 100.0000 ». La part
                    // est arrondie à 4 décimales à la saisie, et la virgule suit
                    // la langue de l'interface.
                    decimalSeparator={activeLocale().startsWith('fr') ? ',' : '.'}
                    addonAfter="%"
                    value={ligne.sharePercent ?? undefined}
                    onChange={valeur =>
                      modifierPart(index, typeof valeur === 'number' ? Math.round(valeur * 10000) / 10000 : null)
                    }
                    aria-label={t('Part en % (ligne {{n}})', { n: index + 1 })}
                  />
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={t('Supprimer cette ligne')}
                    onClick={() => supprimerLigne(index)}
                  />
                </Space>
              ))}
            </Space>

            <Space wrap>
              <Button type="dashed" icon={<PlusOutlined />} onClick={ajouterLigne}>
                {t('Ajouter un propriétaire')}
              </Button>
              <Button onClick={repartirEgalement} disabled={lignes.length === 0}>
                {t('Répartir à parts égales')}
              </Button>
            </Space>

            <div>
              {t('Total')}
              {' : '}
              <Text type={totalOk ? 'success' : 'danger'} strong>
                {`${pourcentage(totalArrondi)} %`}
              </Text>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button onClick={() => setModaleOuverte(false)}>{t('Annuler')}</Button>
              <Button type="primary" loading={enregistrement} disabled={!peutEnregistrer} onClick={enregistrer}>
                {t('Enregistrer')}
              </Button>
            </div>
          </Space>
        </Modal>
      </Card>
      {/* Mandat de gestion : carte visible pour un bien d'un propriétaire client seulement. */}
      <PropertyMandateCard tenantId={tenantId} propertyId={propertyId} />
    </div>
  );
};

export default PropertyOwnershipCard;
