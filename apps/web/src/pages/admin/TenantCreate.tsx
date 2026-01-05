import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { createTenant, CreateTenantRequest } from '../../services/tenant-service';
import { ArrowLeft, Building2, Users } from 'lucide-react';

export const TenantCreate: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateTenantRequest>({
    name: '',
    type: 'AGENCY',
    legalName: '',
    contactEmail: '',
    contactPhone: '',
    country: '',
    city: '',
    address: '',
    brandingPrimaryColor: '',
    subdomain: '',
    customDomain: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await createTenant(formData);
      if (response.success) {
        navigate(`/admin/tenants/${response.data.id}`);
      } else {
        setError('Erreur lors de la creation du tenant');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la creation du tenant');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/tenants')}
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Nouveau Tenant</h1>
            <p className="mt-2 text-sm text-slate-600">Creer un nouveau tenant</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type de tenant <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label
                  className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    formData.type === 'AGENCY'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value="AGENCY"
                    checked={formData.type === 'AGENCY'}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as 'AGENCY' | 'OPERATOR' })}
                    className="sr-only"
                  />
                  <Building2 className={`h-8 w-8 mr-3 ${formData.type === 'AGENCY' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div>
                    <div className={`font-medium ${formData.type === 'AGENCY' ? 'text-blue-900' : 'text-gray-900'}`}>
                      Agence
                    </div>
                    <div className="text-sm text-gray-500">Agence immobiliere traditionnelle</div>
                  </div>
                </label>
                <label
                  className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    formData.type === 'OPERATOR'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value="OPERATOR"
                    checked={formData.type === 'OPERATOR'}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as 'AGENCY' | 'OPERATOR' })}
                    className="sr-only"
                  />
                  <Users className={`h-8 w-8 mr-3 ${formData.type === 'OPERATOR' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div>
                    <div className={`font-medium ${formData.type === 'OPERATOR' ? 'text-blue-900' : 'text-gray-900'}`}>
                      Operateur
                    </div>
                    <div className="text-sm text-gray-500">Operateur ou promoteur immobilier</div>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="legalName" className="block text-sm font-medium text-gray-700">
                Nom legal
              </label>
              <input
                type="text"
                id="legalName"
                name="legalName"
                value={formData.legalName}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700">
                Email de contact
              </label>
              <input
                type="email"
                id="contactEmail"
                name="contactEmail"
                value={formData.contactEmail}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="contactPhone" className="block text-sm font-medium text-gray-700">
                Telephone
              </label>
              <input
                type="tel"
                id="contactPhone"
                name="contactPhone"
                value={formData.contactPhone}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                Ville
              </label>
              <input
                type="text"
                id="city"
                name="city"
                value={formData.city}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="country" className="block text-sm font-medium text-gray-700">
                Pays
              </label>
              <input
                type="text"
                id="country"
                name="country"
                value={formData.country}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="col-span-2">
              <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                Adresse
              </label>
              <textarea
                id="address"
                name="address"
                rows={3}
                value={formData.address}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="subdomain" className="block text-sm font-medium text-gray-700">
                Sous-domaine
              </label>
              <input
                type="text"
                id="subdomain"
                name="subdomain"
                value={formData.subdomain}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="customDomain" className="block text-sm font-medium text-gray-700">
                Domaine personnalise
              </label>
              <input
                type="text"
                id="customDomain"
                name="customDomain"
                value={formData.customDomain}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/admin/tenants')}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creation...' : 'Creer'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};




