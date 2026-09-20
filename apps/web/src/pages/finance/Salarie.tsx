import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, DatePicker, InputNumber, Select, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  createSalaryNote,
  createSalaryPayment,
  getEmployee,
  listSalaryNotes,
  listSalaryPayments,
  validateSalaryNote,
  validateSalaryPayment
} from '../../services/finance-salaries-service';
import { listConstructionSites, listCostCategories } from '../../services/finance-lot2-service';
import type { SalaryNote, SalaryPayment } from '../../types/finance-salaries-types';
import { SALARY_STATUS_LABELS } from '../../types/finance-salaries-types';
import type { SalaryDocumentStatus } from '../../types/finance-salaries-types';
import { detailKey, entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { montantSaisiProps } from '../../utils/montant-saisi';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  DataView,
  DataCard,
  StatCard,
  StatusTag,
  ConfirmAction,
  useConfirmAction
} from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

/**
 * Fiche d'un salarié — lot 4, troisième sous-lot (PRD E8, besoins B11 et P9 ;
 * contrat gelé `packages/api/src/lib/finance/types-lot4-salaries.ts`).
 *
 * Chemin supposé : `/tenant/:tenantId/finance/salaires/:employeeId`. Le
 * salarié est dans le CHEMIN, pas en paramètre de requête — le défaut relevé
 * deux fois au lot 2. **Cet écran n'est pas câblé** : `App.tsx`,
 * `navigation/model.tsx`, `dev/atelier/Atelier.tsx` et
 * `dev/atelier/mock-api.ts` sont des fichiers-registres réservés au
 * superviseur, qui les branche à l'intégration.
 *
 * ---------------------------------------------------------------------------
 * Aucune cotisation, et c'est une exigence
 * ---------------------------------------------------------------------------
 *
 * Le PRD dit « aucun calcul de cotisation ». Il n'y a donc ni brut, ni net, ni
 * retenue sur cet écran : **un seul montant, celui qui sera versé**. Ce n'est
 * pas un raccourci — une paie complète est un métier soumis à un droit local
 * qui change, et la cliente a demandé que les salaires d'un chantier entrent
 * dans son coût, pas un logiciel de paie. La fiche le rappelle en toutes
 * lettres, pour que personne ne cherche le champ manquant.
 *
 * ---------------------------------------------------------------------------
 * Le poste de dépense : exigé avec un chantier, refusé sans
 * ---------------------------------------------------------------------------
 *
 * Le serveur exige `costCategoryId` dès que `siteId` est renseigné, et le
 * REFUSE quand il n'y a pas de chantier (schéma `.strict()` + `superRefine`).
 * Le formulaire le dit **avant** l'envoi : le champ « Poste de dépense »
 * apparaît quand un chantier est choisi, et disparaît sinon. Un formulaire qui
 * laisserait partir la requête pour afficher le refus du serveur ferait perdre
 * la saisie deux fois sur trois.
 *
 * **Le poste « main-d'œuvre » n'est jamais deviné.** Les postes sont propres à
 * chaque agence et librement renommables : résoudre par le texte casserait le
 * jour où quelqu'un écrit « Main d'oeuvre » sans apostrophe. L'écran
 * PRÉ-SÉLECTIONNE un poste dont le nom y ressemble — et le dit, sous le champ,
 * pour que ce soit une proposition visible et non un choix fait à la place de
 * l'utilisateur, qui peut en changer d'un clic.
 *
 * ---------------------------------------------------------------------------
 * Deux règles du serveur que l'écran relaie sans les réinventer
 * ---------------------------------------------------------------------------
 *
 * **Une note par salarié et par mois.** Le serveur répond un 409 métier dont
 * le message dit précisément ce qui s'est passé ; c'est CE message qui
 * s'affiche, jamais une phrase devinée ici.
 *
 * **Un règlement supérieur au solde est accepté** : c'est une avance sur
 * salaire, courante, et la refuser empêcherait d'enregistrer un versement qui
 * a bien eu lieu. L'écran avertit, il ne bloque pas.
 *
 * **Aucun montant n'est calculé ici** : le solde arrive tout fait du serveur,
 * et n'est jamais recomposé à partir des notes et des règlements affichés —
 * ceux-ci sont bornés à ce que l'écran a chargé, le solde court sur toute
 * l'histoire du compte.
 *
 * **Vocabulaire (P-1 du PRD).** On *saisit* une note, on la *valide*, on
 * *règle* un salarié, la charge s'*impute* à un chantier — jamais « débit » ni
 * « crédit ».
 */

const TONE_STATUT: Record<SalaryDocumentStatus, StatusTone> = {
  DRAFT: 'neutral',
  VALIDATED: 'success',
  VOIDED: 'danger'
};

const MOIS_FR = [
  'janvier',
  t('février'),
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  t('août'),
  'septembre',
  'octobre',
  'novembre',
  t('décembre')
];

function libellePeriode(year: number, month: number): string {
  const nomMois = MOIS_FR[month - 1] ?? String(month);
  return `${nomMois.charAt(0).toUpperCase()}${nomMois.slice(1)} ${year}`;
}

const OPTIONS_MOIS = MOIS_FR.map((nom, index) => ({
  value: index + 1,
  label: `${nom.charAt(0).toUpperCase()}${nom.slice(1)}`
}));

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

/**
 * Nettoie casse, accents et ponctuation d'un libellé de poste.
 *
 * Sert UNIQUEMENT à proposer une pré-sélection visible, jamais à décider à la
 * place de l'utilisateur — voir l'en-tête. « Main-d'œuvre », « Main d'oeuvre »
 * et « MAIN D ŒUVRE » se ramènent au même texte, ce qui rend la proposition
 * utile ; et si elle tombe à côté, l'utilisateur la voit et la change.
 */
function normaliserLibelle(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/gi, 'oe')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

function ressembleAMainDOeuvre(libelle: string): boolean {
  return normaliserLibelle(libelle).includes('main d oeuvre');
}

export const Salarie: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, employeeId } = useParams<{ tenantId: string; employeeId: string }>();
  const queryClient = useQueryClient();
  const confirmerAction = useConfirmAction();

  const {
    data: salarie,
    isPending: salarieEnAttente,
    error: erreurSalarie,
    refetch: refetchSalarie
  } = useQuery({
    queryKey: detailKey('employees', tenantId, employeeId ?? ''),
    queryFn: () => getEmployee(tenantId as string, employeeId as string),
    enabled: Boolean(tenantId && employeeId),
    staleTime: STALE_TIME.list
  });

  // Liste TRANSVERSALE, filtrée sur ce salarié : `employeeId` part en requête,
  // pas dans le chemin — c'est ce que déclare la route `GET
  // finance/salary-notes` (contrat, tableau des routes).
  const {
    data: notes,
    isPending: notesEnAttente,
    error: erreurNotes
  } = useQuery({
    queryKey: queryKey('salary-notes', tenantId, { employeeId: employeeId ?? '' }),
    queryFn: () => listSalaryNotes(tenantId as string, { employeeId: employeeId as string }),
    enabled: Boolean(tenantId && employeeId),
    staleTime: STALE_TIME.list
  });

  const {
    data: reglements,
    isPending: reglementsEnAttente,
    error: erreurReglements
  } = useQuery({
    queryKey: detailKey('salary-payments', tenantId, employeeId ?? ''),
    queryFn: () => listSalaryPayments(tenantId as string, employeeId as string),
    enabled: Boolean(tenantId && employeeId),
    staleTime: STALE_TIME.list
  });

  // Référentiels du lot 2, repris tels quels plutôt que redéfinis ici.
  const { data: chantiers } = useQuery({
    queryKey: queryKey('construction-sites', tenantId, {}),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const { data: postes } = useQuery({
    queryKey: queryKey('cost-categories', tenantId, {}),
    queryFn: () => listCostCategories(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const optionsChantiers = useMemo(
    () => (chantiers ?? []).map(c => ({ value: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [chantiers]
  );

  const optionsPostes = useMemo(
    () =>
      (postes ?? [])
        .filter(p => p.isActive)
        .sort((a, b) => a.position - b.position)
        .map(p => ({ value: p.id, label: p.label })),
    [postes]
  );

  /** Le poste que l'écran PROPOSE quand un chantier est choisi. Jamais imposé. */
  const postePropose = useMemo(
    () => (postes ?? []).filter(p => p.isActive).find(p => ressembleAMainDOeuvre(p.label)),
    [postes]
  );

  // ---------------------------------------------------------------------
  // Saisie d'une note de salaire
  // ---------------------------------------------------------------------

  const [annee, setAnnee] = useState<number | null>(() => new Date().getFullYear());
  const [mois, setMois] = useState<number | null>(() => new Date().getMonth() + 1);
  const [montantNote, setMontantNote] = useState<number | null>(null);
  const [chantierId, setChantierId] = useState<string | undefined>(undefined);
  const [posteId, setPosteId] = useState<string | undefined>(undefined);
  const [saisieNoteEnCours, setSaisieNoteEnCours] = useState(false);

  /**
   * Le chantier commande l'existence du poste, dans les deux sens.
   *
   * En le choisissant, on fait apparaître le champ et on y PROPOSE le poste qui
   * ressemble à « main-d'œuvre » — si un tel poste existe, et seulement si
   * l'utilisateur n'en a pas déjà choisi un. En le retirant, le poste est
   * remis à vide : le serveur le refuserait sans chantier, et un champ caché
   * qui garderait sa valeur ferait partir une requête que rien à l'écran
   * n'expliquerait.
   */
  const changerChantier = (valeur: string | undefined) => {
    setChantierId(valeur);
    if (!valeur) {
      setPosteId(undefined);
      return;
    }
    if (!posteId && postePropose) {
      setPosteId(postePropose.id);
    }
  };

  const posteExige = Boolean(chantierId);
  const posteManquant = posteExige && !posteId;
  const posteEstUneProposition = Boolean(postePropose && posteId === postePropose.id);

  const peutSaisirNote = Boolean(annee) && Boolean(mois) && Boolean(montantNote && montantNote > 0) && !posteManquant;

  const saisirNote = async () => {
    if (!tenantId || !employeeId || !annee || !mois || !montantNote) return;
    // Le serveur exige le poste dès qu'un chantier est renseigné. On le dit
    // AVANT l'envoi, pas après le 400 (voir l'en-tête).
    if (posteManquant) {
      message.error(t("Le poste de dépense est obligatoire dès qu'un chantier est renseigné."));
      return;
    }
    setSaisieNoteEnCours(true);
    try {
      await createSalaryNote(tenantId, employeeId, {
        periodYear: annee,
        periodMonth: mois,
        amount: montantNote,
        // Les deux champs partent ensemble, ou pas du tout : le serveur refuse
        // l'un sans l'autre dans les deux sens.
        ...(chantierId ? { siteId: chantierId, costCategoryId: posteId } : {})
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('salary-notes', tenantId) });
      message.success(t('Note de salaire de {{value}} saisie en brouillon.', { value: libellePeriode(annee, mois) }));
      setMontantNote(null);
    } catch (err: any) {
      // Une note par salarié et par mois : le serveur répond un 409 dont le
      // message dit précisément ce qui s'est passé. C'est celui-là qu'on
      // montre, jamais une phrase devinée ici.
      message.error(err?.response?.data?.message || t('La saisie de la note de salaire a échoué.'));
    } finally {
      setSaisieNoteEnCours(false);
    }
  };

  const validerNote = async (note: SalaryNote) => {
    if (!tenantId || !employeeId) return;
    try {
      await validateSalaryNote(tenantId, note.id);
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('salary-notes', tenantId) });
      // La validation fait naître la charge et bouger le compte du salarié :
      // la fiche elle-même, et sa ligne dans la liste, doivent se recharger.
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('employees', tenantId) });
      message.success(t('Note de {{value}} validée.', { value: libellePeriode(note.periodYear, note.periodMonth) }));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation de la note a échoué.'));
    }
  };

  // ---------------------------------------------------------------------
  // Enregistrement d'un règlement
  // ---------------------------------------------------------------------

  const [dateReglement, setDateReglement] = useState<Dayjs>(() => dayjs());
  const [montantReglement, setMontantReglement] = useState<number | null>(null);
  const [reglementEnCours, setReglementEnCours] = useState(false);

  const peutEnregistrerReglement = Boolean(montantReglement && montantReglement > 0) && Boolean(dateReglement);

  /**
   * Avance sur salaire : le règlement dépasse ce qu'on lui doit.
   *
   * **Ce n'est pas une erreur, et rien ne le bloque** — le contrat gelé
   * l'autorise explicitement. L'écran le signale pour que ce soit un choix, pas
   * une surprise au moment où le compte devient débiteur.
   */
  const estUneAvance = Boolean(
    salarie && montantReglement !== null && montantReglement > Math.max(salarie.accountBalance, 0)
  );

  const enregistrerReglement = async () => {
    if (!tenantId || !employeeId || !montantReglement) return;
    setReglementEnCours(true);
    try {
      await createSalaryPayment(tenantId, employeeId, {
        paymentDate: dateReglement.format('YYYY-MM-DD'),
        amount: montantReglement
      });
      await queryClient.invalidateQueries({ queryKey: detailKey('salary-payments', tenantId, employeeId) });
      message.success(t('Règlement enregistré en brouillon.'));
      setMontantReglement(null);
      setDateReglement(dayjs());
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement du règlement a échoué."));
    } finally {
      setReglementEnCours(false);
    }
  };

  const validerReglement = async (reglement: SalaryPayment) => {
    if (!tenantId || !employeeId) return;
    try {
      await validateSalaryPayment(tenantId, reglement.id);
      await queryClient.invalidateQueries({ queryKey: detailKey('salary-payments', tenantId, employeeId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('employees', tenantId) });
      message.success(t('Règlement validé.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation du règlement a échoué.'));
    }
  };

  // ---------------------------------------------------------------------

  if (!tenantId || !employeeId) {
    return <StateBlock variant="empty" title={t('Aucun salarié sélectionné')} />;
  }

  const filAriane = [
    { label: t('Finance'), to: `/tenant/${tenantId}/finance/salaires` },
    { label: t('Salaires'), to: `/tenant/${tenantId}/finance/salaires` },
    ...(salarie ? [{ label: salarie.fullName }] : [{ label: t('Salarié') }])
  ];

  if (erreurSalarie) {
    return (
      <>
        <PageHeader title={t('Salarié')} breadcrumbs={filAriane} />
        <StateBlock
          variant="error"
          description={t('Impossible de charger ce salarié.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetchSalarie(), primary: true }]}
        />
      </>
    );
  }

  if (salarieEnAttente || !salarie) {
    return (
      <>
        <PageHeader title={t('Salarié')} breadcrumbs={filAriane} />
        <StateBlock variant="loading" />
      </>
    );
  }

  const nousLuiDevons = salarie.accountBalance > 0;
  const ilNousDoit = salarie.accountBalance < 0;

  const colonnesNotes: ColumnsType<SalaryNote> = [
    { title: t('Mois'), key: 'periode', width: 160, render: (_, n) => libellePeriode(n.periodYear, n.periodMonth) },
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, n) => <MoneyValue value={n.amount} /> },
    {
      // Le NOM du chantier, jamais son identifiant. Sans chantier, la note est
      // une charge de structure : on le dit, on ne laisse pas un blanc.
      title: t('Chantier'),
      key: 'chantier',
      render: (_, n) => n.siteLabel ?? <Text type="secondary">{t('Aucun chantier')}</Text>
    },
    {
      title: t('Poste de dépense'),
      key: 'poste',
      render: (_, n) => n.costCategoryLabel ?? <Text type="secondary">—</Text>
    },
    { title: t('Saisi par'), key: 'saisi', render: (_, n) => n.createdByLabel },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, n) => (
        <StatusTag status={n.status} tone={TONE_STATUT[n.status]} label={SALARY_STATUS_LABELS[n.status]} />
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, n) =>
        n.status === 'DRAFT' ? (
          <ConfirmAction
            title={t('Valider la note de {{value}} ?', { value: libellePeriode(n.periodYear, n.periodMonth) })}
            description={
              n.siteLabel
                ? t(
                    "Cette opération est irréversible : la charge est constatée, ce que nous devons à ce salarié augmente d'autant, et le coût du chantier « {{siteLabel}} » monte du même montant.",
                    { siteLabel: n.siteLabel }
                  )
                : t(
                    "Cette opération est irréversible : la charge est constatée, et ce que nous devons à ce salarié augmente d'autant."
                  )
            }
            okText={t('Confirmer la validation')}
            onConfirm={() => validerNote(n)}
          >
            <Button type="link">{t('Valider')}</Button>
          </ConfirmAction>
        ) : null
    }
  ];

  const colonnesReglements: ColumnsType<SalaryPayment> = [
    { title: t('Date'), key: 'date', width: 140, render: (_, r) => dateCourte(r.paymentDate) },
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, r) => <MoneyValue value={r.amount} /> },
    { title: t('Saisi par'), key: 'saisi', render: (_, r) => r.createdByLabel },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, r) => (
        <StatusTag status={r.status} tone={TONE_STATUT[r.status]} label={SALARY_STATUS_LABELS[r.status]} />
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, r) =>
        r.status === 'DRAFT' ? (
          <ConfirmAction
            title={t('Valider le règlement du {{value}} ?', { value: dateCourte(r.paymentDate) })}
            description={t(
              "Cette opération est irréversible : le versement est constaté, et ce que nous devons à ce salarié diminue d'autant. Un montant supérieur à ce qui lui est dû est accepté — le reste devient une avance sur salaire."
            )}
            okText={t('Confirmer la validation')}
            onConfirm={() => validerReglement(r)}
          >
            <Button type="link">{t('Valider')}</Button>
          </ConfirmAction>
        ) : null
    }
  ];

  return (
    <>
      <PageHeader
        title={salarie.fullName}
        subtitle={salarie.role ?? undefined}
        breadcrumbs={filAriane}
        extra={<StatusTag status={salarie.isActive ? 'ACTIVE' : 'INACTIVE'} />}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)'
        }}
      >
        {/*
          Le solde arrive tout fait du serveur : il n'est jamais recomposé à
          partir des notes et des règlements affichés plus bas, qui sont bornés
          à ce que cet écran a chargé. La mention « toutes périodes » est là
          pour que personne ne fasse la soustraction de tête et s'étonne.
        */}
        <StatCard
          label={ilNousDoit ? t('Avance à retenir') : t('Ce qu’on lui doit')}
          value={<MoneyValue value={ilNousDoit ? -salarie.accountBalance : salarie.accountBalance} />}
          tone={ilNousDoit ? 'warning' : 'neutral'}
          hint={
            ilNousDoit
              ? t('Une avance sur salaire lui a été versée : elle se retiendra sur ses prochaines notes.')
              : nousLuiDevons
                ? t('Solde de son compte, toutes périodes confondues.')
                : t('Son compte est soldé : rien ne lui reste dû.')
          }
        />
        <StatCard
          label={t('Rôle')}
          value={salarie.role ?? '—'}
          hint={t("Aucune cotisation n'est calculée : le montant d'une note est celui qui sera versé.")}
        />
      </div>

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {t('Notes de salaire')}
      </Title>
      <DataView<SalaryNote>
        // Le contrat de `listSalaryNotes` ne pagine pas.
        paginated={false}
        scrollX={1000}
        items={notes ?? []}
        total={(notes ?? []).length}
        page={1}
        pageSize={Math.max((notes ?? []).length, 1)}
        onPageChange={() => {}}
        loading={notesEnAttente}
        error={erreurNotes ? t('Impossible de charger les notes de salaire.') : null}
        emptyDescription={t("Aucune note de salaire n'a encore été saisie pour ce salarié.")}
        columns={colonnesNotes}
        rowKey={n => n.id}
        aria-label={t('Notes de salaire du salarié')}
        renderCard={n => (
          <DataCard
            title={libellePeriode(n.periodYear, n.periodMonth)}
            aria-label={libellePeriode(n.periodYear, n.periodMonth)}
            subtitle={n.siteLabel ?? t('Aucun chantier')}
            status={<StatusTag status={n.status} tone={TONE_STATUT[n.status]} label={SALARY_STATUS_LABELS[n.status]} />}
            highlight={<MoneyValue value={n.amount} />}
            fields={[
              { label: t('Poste de dépense'), value: n.costCategoryLabel ?? '—' },
              { label: t('Saisi par'), value: n.createdByLabel }
            ]}
            secondaryActions={
              n.status === 'DRAFT'
                ? [
                    {
                      key: 'valider',
                      label: 'Valider',
                      onClick: () =>
                        confirmerAction({
                          title: t('Valider la note de {{value}} ?', {
                            value: libellePeriode(n.periodYear, n.periodMonth)
                          }),
                          description: n.siteLabel
                            ? t(
                                "Cette opération est irréversible : la charge est constatée, ce que nous devons à ce salarié augmente d'autant, et le coût du chantier « {{siteLabel}} » monte du même montant.",
                                { siteLabel: n.siteLabel }
                              )
                            : t(
                                "Cette opération est irréversible : la charge est constatée, et ce que nous devons à ce salarié augmente d'autant."
                              ),
                          okText: t('Confirmer la validation'),
                          onConfirm: () => validerNote(n)
                        })
                    }
                  ]
                : undefined
            }
          />
        )}
      />

      <Carte_SaisirNote
        annee={annee}
        setAnnee={setAnnee}
        mois={mois}
        setMois={setMois}
        montant={montantNote}
        setMontant={setMontantNote}
        optionsChantiers={optionsChantiers}
        chantierId={chantierId}
        onChangerChantier={changerChantier}
        optionsPostes={optionsPostes}
        posteId={posteId}
        setPosteId={setPosteId}
        posteExige={posteExige}
        posteManquant={posteManquant}
        posteEstUneProposition={posteEstUneProposition}
        peutSaisir={peutSaisirNote}
        enCours={saisieNoteEnCours}
        onSaisir={saisirNote}
      />

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {t('Règlements')}
      </Title>
      <DataView<SalaryPayment>
        paginated={false}
        scrollX={800}
        items={reglements ?? []}
        total={(reglements ?? []).length}
        page={1}
        pageSize={Math.max((reglements ?? []).length, 1)}
        onPageChange={() => {}}
        loading={reglementsEnAttente}
        error={erreurReglements ? t('Impossible de charger les règlements.') : null}
        emptyDescription={t("Aucun règlement n'a encore été enregistré pour ce salarié.")}
        columns={colonnesReglements}
        rowKey={r => r.id}
        aria-label={t('Règlements du salarié')}
        renderCard={r => (
          <DataCard
            title={dateCourte(r.paymentDate)}
            aria-label={t('Règlement du {{value}}', { value: dateCourte(r.paymentDate) })}
            status={<StatusTag status={r.status} tone={TONE_STATUT[r.status]} label={SALARY_STATUS_LABELS[r.status]} />}
            highlight={<MoneyValue value={r.amount} />}
            fields={[{ label: t('Saisi par'), value: r.createdByLabel }]}
            secondaryActions={
              r.status === 'DRAFT'
                ? [
                    {
                      key: 'valider',
                      label: 'Valider',
                      onClick: () =>
                        confirmerAction({
                          title: t('Valider le règlement du {{value}} ?', { value: dateCourte(r.paymentDate) }),
                          description: t(
                            "Cette opération est irréversible : le versement est constaté, et ce que nous devons à ce salarié diminue d'autant. Un montant supérieur à ce qui lui est dû est accepté — le reste devient une avance sur salaire."
                          ),
                          okText: t('Confirmer la validation'),
                          onConfirm: () => validerReglement(r)
                        })
                    }
                  ]
                : undefined
            }
          />
        )}
      />

      <Carte_EnregistrerReglement
        date={dateReglement}
        setDate={setDateReglement}
        montant={montantReglement}
        setMontant={setMontantReglement}
        estUneAvance={estUneAvance}
        peutEnregistrer={peutEnregistrerReglement}
        enCours={reglementEnCours}
        onEnregistrer={enregistrerReglement}
      />
    </>
  );
};

/**
 * Formulaire de saisie d'une note, extrait pour ne pas alourdir le corps
 * principal de la fiche.
 *
 * Le champ « Poste de dépense » n'existe que lorsqu'un chantier est choisi :
 * c'est la règle du serveur, rendue visible dans la mise en page plutôt
 * qu'expliquée dans un message d'erreur après coup.
 */
function Carte_SaisirNote(props: {
  annee: number | null;
  setAnnee: (v: number | null) => void;
  mois: number | null;
  setMois: (v: number | null) => void;
  montant: number | null;
  setMontant: (v: number | null) => void;
  optionsChantiers: { value: string; label: string }[];
  chantierId: string | undefined;
  onChangerChantier: (v: string | undefined) => void;
  optionsPostes: { value: string; label: string }[];
  posteId: string | undefined;
  setPosteId: (v: string | undefined) => void;
  posteExige: boolean;
  posteManquant: boolean;
  posteEstUneProposition: boolean;
  peutSaisir: boolean;
  enCours: boolean;
  onSaisir: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 'var(--space-4)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)'
      }}
    >
      <Title level={5} style={{ marginTop: 0 }}>
        {t('Saisir une note de salaire')}
      </Title>
      <Text type="secondary">
        {t(
          "Une seule note par salarié et par mois. Le montant saisi est celui qui sera versé : aucune cotisation n'est calculée."
        )}
      </Text>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <Space wrap size="middle" align="end">
          <div>
            <div>
              <label htmlFor="note-annee">{t('Année')}</label>
            </div>
            <InputNumber
              id="note-annee"
              min={2000}
              max={2100}
              style={{ width: 120 }}
              value={props.annee ?? undefined}
              onChange={value => props.setAnnee((value as number | null) ?? null)}
            />
          </div>
          <div>
            <div>
              <label htmlFor="note-mois">{t('Mois')}</label>
            </div>
            <Select
              showSearch
              optionFilterProp="label"
              id="note-mois"
              style={{ width: 160 }}
              value={props.mois ?? undefined}
              onChange={value => props.setMois((value as number | undefined) ?? null)}
              options={OPTIONS_MOIS}
            />
          </div>
          <div>
            <div>
              <label htmlFor="note-montant">{t('Montant à verser')}</label>
            </div>
            <InputNumber
              id="note-montant"
              min={1}
              step={1000}
              style={{ width: 180 }}
              value={props.montant ?? undefined}
              onChange={value => props.setMontant((value as number | null) ?? null)}
              {...montantSaisiProps}
            />
          </div>
          <div style={{ minWidth: 240 }}>
            <div>
              <label htmlFor="note-chantier">{t('Chantier (facultatif)')}</label>
            </div>
            <Select
              showSearch
              optionFilterProp="label"
              id="note-chantier"
              style={{ width: '100%' }}
              placeholder={t('Aucun chantier')}
              allowClear
              value={props.chantierId}
              onChange={value => props.onChangerChantier((value as string | undefined) ?? undefined)}
              options={props.optionsChantiers}
              notFoundContent={t('Aucun chantier disponible')}
            />
            {/* Même avertissement que la sortie de stock (Stock.tsx) : dit au
                moment de la saisie, pas seulement refusé à la validation. */}
            <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {t("Un chantier clos n'accepte plus d'imputation : la note y serait refusée.")}
            </Text>
          </div>
          {/*
            Le poste n'apparaît QUE si un chantier est renseigné : le serveur
            l'exige alors, et le refuse sinon. Le champ suit la règle plutôt
            que de la commenter.
          */}
          {props.posteExige && (
            <div style={{ minWidth: 240 }}>
              <div>
                <label htmlFor="note-poste">{t('Poste de dépense')}</label>
              </div>
              <Select
                id="note-poste"
                style={{ width: '100%' }}
                placeholder={t('Choisir un poste')}
                status={props.posteManquant ? 'error' : undefined}
                value={props.posteId}
                onChange={value => props.setPosteId((value as string | undefined) ?? undefined)}
                showSearch
                optionFilterProp="label"
                options={props.optionsPostes}
                notFoundContent={t('Aucun poste de dépense')}
              />
            </div>
          )}
          <Button type="primary" loading={props.enCours} disabled={!props.peutSaisir} onClick={props.onSaisir}>
            {t('Saisir la note')}
          </Button>
        </Space>
      </div>

      {props.posteExige && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          {props.posteManquant ? (
            <Text type="danger">{t("Le poste de dépense est obligatoire dès qu'un chantier est renseigné.")}</Text>
          ) : props.posteEstUneProposition ? (
            // Pré-sélection assumée et DITE : les postes sont propres à chaque
            // agence et librement renommables, un poste deviné en silence se
            // lirait comme un choix sans en être un.
            <Text type="secondary">
              {t("Poste proposé d'après son nom. Vérifiez-le et changez-en si ce n'est pas le bon.")}
            </Text>
          ) : (
            <Text type="secondary">
              {t("C'est ce poste qui recevra la charge dans le coût du chantier, à la validation de la note.")}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

/** Même remarque que `Carte_SaisirNote` : un bloc de saisie, extrait par lisibilité. */
function Carte_EnregistrerReglement(props: {
  date: Dayjs;
  setDate: (v: Dayjs) => void;
  montant: number | null;
  setMontant: (v: number | null) => void;
  estUneAvance: boolean;
  peutEnregistrer: boolean;
  enCours: boolean;
  onEnregistrer: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 'var(--space-4)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)'
      }}
    >
      <Title level={5} style={{ marginTop: 0 }}>
        {t('Enregistrer un règlement')}
      </Title>
      <Text type="secondary">
        {t("On règle un salarié, pas une note : le règlement n'est affecté à aucune note en particulier.")}
      </Text>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <Space wrap size="middle" align="end">
          <div>
            <div>
              <label htmlFor="reglement-date">{t('Date du règlement')}</label>
            </div>
            <DatePicker
              id="reglement-date"
              format="DD/MM/YYYY"
              allowClear={false}
              value={props.date}
              onChange={value => value && props.setDate(value)}
            />
          </div>
          <div>
            <div>
              <label htmlFor="reglement-montant">{t('Montant versé')}</label>
            </div>
            <InputNumber
              id="reglement-montant"
              min={1}
              step={1000}
              style={{ width: 180 }}
              value={props.montant ?? undefined}
              onChange={value => props.setMontant((value as number | null) ?? null)}
              {...montantSaisiProps}
            />
          </div>
          <Button
            type="primary"
            loading={props.enCours}
            disabled={!props.peutEnregistrer}
            onClick={props.onEnregistrer}
          >
            {t('Enregistrer le règlement')}
          </Button>
        </Space>
      </div>

      {/*
        Un règlement supérieur au solde est ACCEPTÉ par le serveur, et c'est
        voulu : une avance sur salaire est courante, et la refuser empêcherait
        d'enregistrer un versement qui a bien eu lieu. L'écran avertit, le
        bouton reste actif.
      */}
      {props.estUneAvance && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Text type="warning">
            {t(
              "Ce montant dépasse ce qui lui est dû : la différence sera une avance sur salaire, à retenir sur ses prochaines notes. C'est accepté."
            )}
          </Text>
        </div>
      )}
    </div>
  );
}

export default Salarie;
