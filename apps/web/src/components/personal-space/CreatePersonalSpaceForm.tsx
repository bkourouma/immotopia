import React, { useRef, useState } from 'react';
import { Alert, Button, Form, Input, Select } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { rememberTenantType } from '../../hooks/useTenantType';
import {
  PERSONAL_SPACE_ERROR,
  isValidUemoaPhone,
  normalizePhone,
  UEMOA_COUNTRIES,
  createPersonalSpace,
  readApiError,
  type UemoaCountryCode
} from '../../services/personal-space-service';
import { t } from '../../i18n/t';

/**
 * Formulaire « Créer mon espace » (lot 4C, specs/026-particuliers-libre-service).
 *
 * Remplace le cul-de-sac « Votre compte n'est rattaché à aucune agence » : un
 * utilisateur connecté sans espace crée le sien (`POST /api/personal-space`),
 * puis bascule dessus et arrive sur la valeur nette du patrimoine.
 *
 * Une `Idempotency-Key` est posée à l'ouverture et conservée tant que la
 * réponse n'est pas arrivée (un nouvel envoi après une coupure réseau rejoue la
 * même création) ; toute réponse du serveur, succès ou refus, en renouvelle une.
 */

interface FormValues {
  displayName: string;
  country: UemoaCountryCode;
  phone?: string;
}

/** Noms des pays, en `t()` littéraux pour que l'extraction les voie. */
function countryName(code: UemoaCountryCode): string {
  switch (code) {
    case 'CI':
      return t("Côte d'Ivoire");
    case 'SN':
      return t('Sénégal');
    case 'BF':
      return t('Burkina Faso');
    case 'ML':
      return t('Mali');
    case 'NE':
      return t('Niger');
    case 'TG':
      return t('Togo');
    case 'BJ':
      return t('Bénin');
    case 'GW':
      return t('Guinée-Bissau');
  }
}

function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* repli ci-dessous */
  }
  return `ps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Destination après création ou reprise d'un espace existant. */
export const personalSpaceHome = (tenantId: string) => `/tenant/${tenantId}/patrimoine/valeur-nette`;

export const CreatePersonalSpaceForm: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshMembership, switchTenant } = useAuth();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; description?: string } | null>(null);
  const keyRef = useRef<string>(newIdempotencyKey());
  const country = Form.useWatch('country', form) ?? 'CI';
  const dial = UEMOA_COUNTRIES.find(item => item.code === country)?.dial ?? '225';

  const enterSpace = async (tenantId: string) => {
    rememberTenantType(tenantId, 'PARTICULIER');
    await refreshMembership();
    switchTenant?.(tenantId);
    navigate(personalSpaceHome(tenantId), { replace: true });
  };

  const handleFinish = async (values: FormValues) => {
    setError(null);
    setSubmitting(true);
    try {
      const phone = values.phone?.trim() ? normalizePhone(values.phone) : undefined;
      const created = await createPersonalSpace(
        { displayName: values.displayName.trim(), country: values.country, ...(phone ? { phone } : {}) },
        keyRef.current
      );
      keyRef.current = newIdempotencyKey();
      await enterSpace(created.tenantId);
    } catch (err) {
      const { status, code, data, message } = readApiError(err);
      if (status !== undefined) keyRef.current = newIdempotencyKey();
      if (code === PERSONAL_SPACE_ERROR.EXISTS && typeof data?.tenantId === 'string') {
        try {
          await enterSpace(data.tenantId);
          return;
        } catch {
          setError({ title: t("Impossible d'ouvrir votre espace existant. Rechargez la page.") });
        }
      } else if (code === PERSONAL_SPACE_ERROR.EMAIL_NOT_VERIFIED || status === 403) {
        setError({
          title: t('Vérifiez votre adresse e-mail'),
          description: t(
            'Confirmez votre adresse e-mail grâce au message que nous vous avons envoyé, puis revenez créer votre espace.'
          )
        });
      } else if (code === PERSONAL_SPACE_ERROR.SIGNUP_UNAVAILABLE || status === 503) {
        setError({
          title: t('Création d’espace momentanément indisponible'),
          description: t('Le service ne peut pas créer d’espace pour le moment. Réessayez dans quelques instants.')
        });
      } else if (status === 400 || status === 422) {
        setError({
          title: t('Vérifiez les informations saisies'),
          description: message
        });
      } else {
        setError({
          title: t('Impossible de créer votre espace'),
          description: t('Une erreur est survenue. Vos informations sont conservées : vous pouvez réessayer.')
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form<FormValues>
      form={form}
      layout="vertical"
      requiredMark="optional"
      initialValues={{ displayName: user?.fullName ?? '', country: 'CI' }}
      onFinish={handleFinish}
      disabled={submitting}
      aria-label={t('Créer mon espace')}
    >
      {error && (
        <Alert
          type="error"
          showIcon
          role="alert"
          title={error.title}
          description={error.description}
          style={{ marginBottom: 'var(--space-4)' }}
        />
      )}
      <Form.Item
        name="displayName"
        label={t('Nom affiché')}
        rules={[
          { required: true, whitespace: true, message: t('Le nom est obligatoire.') },
          { max: 120, message: t('Le nom ne doit pas dépasser 120 caractères.') }
        ]}
      >
        <Input autoComplete="name" maxLength={120} />
      </Form.Item>
      <Form.Item name="country" label={t('Pays')} rules={[{ required: true, message: t('Choisissez un pays.') }]}>
        <Select
          options={UEMOA_COUNTRIES.map(item => ({
            value: item.code,
            label: `${countryName(item.code)} (+${item.dial})`
          }))}
        />
      </Form.Item>
      <Form.Item
        name="phone"
        label={t('Téléphone')}
        extra={t('Facultatif à cette étape, obligatoire pour payer. Format international.')}
        rules={[
          {
            validator: (_, value?: string) =>
              !value || !value.trim() || isValidUemoaPhone(value)
                ? Promise.resolve()
                : Promise.reject(
                    new Error(t('Numéro invalide : format international attendu, par exemple +2250712345678.'))
                  )
          }
        ]}
      >
        <Input type="tel" inputMode="tel" autoComplete="tel" placeholder={`+${dial} …`} dir="ltr" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={submitting} block>
        {t('Créer mon espace')}
      </Button>
    </Form>
  );
};
