import React, { useState, useEffect } from 'react';
import { ClientType } from '../../types/tenant-types';

interface Tenant {
    id: string;
    name: string;
    slug: string;
    type: string;
    logoUrl?: string;
}

interface TenantRegisterFormProps {
    tenantId?: string;
    onSuccess?: () => void;
}

export const TenantRegisterForm: React.FC<TenantRegisterFormProps> = ({
    tenantId: propTenantId,
    onSuccess
}) => {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [selectedTenantId, setSelectedTenantId] = useState(propTenantId || '');
    const [clientType, setClientType] = useState<ClientType>('RENTER');
    const [details, setDetails] = useState({
        budget: '',
        preferredLocation: '',
        moveInDate: '',
        propertyType: '',
        bedrooms: '',
        notes: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        fetchTenants();
    }, []);

    const fetchTenants = async () => {
        try {
            const response = await fetch('/api/tenants');
            const data = await response.json();
            if (data.success) {
                setTenants(data.data);
                if (!propTenantId && data.data.length > 0) {
                    setSelectedTenantId(data.data[0].id);
                }
            }
        } catch (err) {
            console.error('Error fetching tenants:', err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);

        try {
            // Clean up details - remove empty values
            const cleanDetails: Record<string, any> = {};
            Object.entries(details).forEach(([key, value]) => {
                if (value && value.toString().trim()) {
                    // Convert numeric fields
                    if (key === 'budget' || key === 'bedrooms') {
                        cleanDetails[key] = Number(value);
                    } else {
                        cleanDetails[key] = value;
                    }
                }
            });

            const response = await fetch(`/api/tenants/${selectedTenantId}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    clientType,
                    details: cleanDetails
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setSuccess('Inscription réussie !');
                // Reset form
                setDetails({
                    budget: '',
                    preferredLocation: '',
                    moveInDate: '',
                    propertyType: '',
                    bedrooms: '',
                    notes: ''
                });
                if (onSuccess) {
                    setTimeout(onSuccess, 1500);
                }
            } else {
                setError(data.message || 'Une erreur est survenue lors de l\'inscription.');
            }
        } catch (err) {
            setError('Une erreur est survenue. Veuillez réessayer.');
            console.error('Registration error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDetailChange = (field: string, value: string) => {
        setDetails(prev => ({ ...prev, [field]: value }));
    };

    if (tenants.length === 0) {
        return (
            <div className="text-center py-8">
                <p className="text-gray-600">Aucune agence disponible pour le moment.</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                    <div className="rounded-md bg-red-50 p-4">
                        <p className="text-sm text-red-800">{error}</p>
                    </div>
                )}

                {success && (
                    <div className="rounded-md bg-green-50 p-4">
                        <p className="text-sm text-green-800">{success}</p>
                    </div>
                )}

                {/* Tenant Selection */}
                {!propTenantId && (
                    <div>
                        <label htmlFor="tenant" className="block text-sm font-medium text-gray-700">
                            Sélectionner une agence
                        </label>
                        <select
                            id="tenant"
                            value={selectedTenantId}
                            onChange={(e) => setSelectedTenantId(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                            {tenants.map((tenant) => (
                                <option key={tenant.id} value={tenant.id}>
                                    {tenant.name} ({tenant.type})
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Client Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Je suis intéressé(e) en tant que
                    </label>
                    <div className="space-y-2">
                        <label className="flex items-center">
                            <input
                                type="radio"
                                value="RENTER"
                                checked={clientType === 'RENTER'}
                                onChange={(e) => setClientType(e.target.value as ClientType)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            />
                            <span className="ml-2 text-sm text-gray-700">Locataire</span>
                        </label>
                        <label className="flex items-center">
                            <input
                                type="radio"
                                value="BUYER"
                                checked={clientType === 'BUYER'}
                                onChange={(e) => setClientType(e.target.value as ClientType)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            />
                            <span className="ml-2 text-sm text-gray-700">Acheteur</span>
                        </label>
                        <label className="flex items-center">
                            <input
                                type="radio"
                                value="OWNER"
                                checked={clientType === 'OWNER'}
                                onChange={(e) => setClientType(e.target.value as ClientType)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            />
                            <span className="ml-2 text-sm text-gray-700">Propriétaire</span>
                        </label>
                        <label className="flex items-center">
                            <input
                                type="radio"
                                value="CO_OWNER"
                                checked={clientType === 'CO_OWNER'}
                                onChange={(e) => setClientType(e.target.value as ClientType)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            />
                            <span className="ml-2 text-sm text-gray-700">Co-propriétaire</span>
                        </label>
                    </div>
                </div>

                {/* Budget */}
                <div>
                    <label htmlFor="budget" className="block text-sm font-medium text-gray-700">
                        Budget (FCFA)
                    </label>
                    <input
                        type="number"
                        id="budget"
                        value={details.budget}
                        onChange={(e) => handleDetailChange('budget', e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="Ex: 50000"
                    />
                </div>

                {/* Preferred Location */}
                <div>
                    <label htmlFor="preferredLocation" className="block text-sm font-medium text-gray-700">
                        Localisation préférée
                    </label>
                    <input
                        type="text"
                        id="preferredLocation"
                        value={details.preferredLocation}
                        onChange={(e) => handleDetailChange('preferredLocation', e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="Ex: Bamako, Hamdallaye"
                    />
                </div>

                {/* Property Type */}
                <div>
                    <label htmlFor="propertyType" className="block text-sm font-medium text-gray-700">
                        Type de bien
                    </label>
                    <select
                        id="propertyType"
                        value={details.propertyType}
                        onChange={(e) => handleDetailChange('propertyType', e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                        <option value="">Sélectionnez</option>
                        <option value="apartment">Appartement</option>
                        <option value="house">Maison</option>
                        <option value="villa">Villa</option>
                        <option value="studio">Studio</option>
                        <option value="office">Bureau</option>
                        <option value="land">Terrain</option>
                    </select>
                </div>

                {/* Bedrooms */}
                <div>
                    <label htmlFor="bedrooms" className="block text-sm font-medium text-gray-700">
                        Nombre de chambres
                    </label>
                    <input
                        type="number"
                        id="bedrooms"
                        value={details.bedrooms}
                        onChange={(e) => handleDetailChange('bedrooms', e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="Ex: 3"
                        min="0"
                    />
                </div>

                {/* Move-in Date */}
                {clientType === 'RENTER' && (
                    <div>
                        <label htmlFor="moveInDate" className="block text-sm font-medium text-gray-700">
                            Date d'emménagement souhaitée
                        </label>
                        <input
                            type="date"
                            id="moveInDate"
                            value={details.moveInDate}
                            onChange={(e) => handleDetailChange('moveInDate', e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                    </div>
                )}

                {/* Notes */}
                <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                        Notes supplémentaires
                    </label>
                    <textarea
                        id="notes"
                        rows={4}
                        value={details.notes}
                        onChange={(e) => handleDetailChange('notes', e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="Informations supplémentaires ou exigences spécifiques..."
                    />
                </div>

                {/* Submit Button */}
                <div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Inscription en cours...' : 'S\'inscrire'}
                    </button>
                </div>
            </form>
        </div>
    );
};

