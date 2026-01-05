import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Search, Star, Plus, CheckCircle, XCircle, Eye } from 'lucide-react';
import { Property } from '../../types/property-types';
import { matchPropertiesForDeal, addPropertyToShortlist } from '../../services/property-service';
import { Link } from 'react-router-dom';

interface PropertyMatchResult {
  propertyId: string;
  matchScore: number;
  property: Property;
  explanationText: string;
  explanation: {
    budgetScore: number;
    locationScore: number;
    sizeScore: number;
    featuresScore: number;
    priceCoherenceScore: number;
    reasons: string[];
  };
}

interface PropertyMatchingProps {
  dealId: string;
  tenantId: string;
  onPropertyAdded?: () => void;
}

export const PropertyMatching: React.FC<PropertyMatchingProps> = ({
  dealId,
  tenantId,
  onPropertyAdded,
}) => {
  const [matches, setMatches] = useState<PropertyMatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [shortlistedProperties, setShortlistedProperties] = useState<Set<string>>(new Set());

  const handleMatch = async () => {
    setLoading(true);
    try {
      const results = await matchPropertiesForDeal(tenantId, dealId);
      setMatches(results);
    } catch (error: any) {
      console.error('Error matching properties:', error);
      alert(error.response?.data?.error || 'Erreur lors de la recherche de correspondances');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToShortlist = async (propertyId: string, matchScore: number, explanation: any) => {
    try {
      await addPropertyToShortlist(tenantId, dealId, propertyId, matchScore, explanation);
      setShortlistedProperties((prev) => new Set([...prev, propertyId]));
      if (onPropertyAdded) {
        onPropertyAdded();
      }
    } catch (error: any) {
      console.error('Error adding to shortlist:', error);
      alert(error.response?.data?.error || 'Erreur lors de l\'ajout à la shortlist');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    if (score >= 40) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const formatPrice = (price?: number, currency?: string) => {
    if (!price) return 'Prix sur demande';
    const formatted = new Intl.NumberFormat('fr-FR').format(price);
    return `${formatted} ${currency || 'EUR'}`;
  };

  return (
    <div className="space-y-6">
      {/* Match Button */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Recherche de correspondances</h3>
            <p className="text-sm text-gray-600 mt-1">
              Trouvez automatiquement les propriétés correspondant aux critères de ce deal
            </p>
          </div>
          <Button onClick={handleMatch} disabled={loading}>
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Recherche...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Rechercher des correspondances
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Match Results */}
      {matches.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-slate-900">
            {matches.length} correspondance{matches.length > 1 ? 's' : ''} trouvée{matches.length > 1 ? 's' : ''}
          </h4>

          <div className="grid grid-cols-1 gap-4">
            {matches.map((match) => (
              <div
                key={match.propertyId}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Property Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <h5 className="text-lg font-semibold text-slate-900">
                        {match.property.title}
                      </h5>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${getScoreColor(match.matchScore)}`}
                      >
                        <Star className="h-4 w-4 mr-1" />
                        {Math.round(match.matchScore)}% de correspondance
                      </span>
                    </div>

                    {/* Property Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Prix:</span>{' '}
                        {formatPrice(match.property.price, match.property.currency)}
                      </div>
                      {match.property.surfaceArea && (
                        <div>
                          <span className="font-medium">Surface:</span> {match.property.surfaceArea} m²
                        </div>
                      )}
                      {match.property.rooms && (
                        <div>
                          <span className="font-medium">Pièces:</span> {match.property.rooms}
                        </div>
                      )}
                      {match.property.locationZone && (
                        <div>
                          <span className="font-medium">Zone:</span> {match.property.locationZone}
                        </div>
                      )}
                    </div>

                    {/* Match Explanation */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <p className="text-sm text-gray-700 mb-2">{match.explanationText}</p>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                        <div>
                          <span className="text-gray-600">Budget:</span>{' '}
                          <span className="font-medium">{Math.round(match.explanation.budgetScore * 100)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Localisation:</span>{' '}
                          <span className="font-medium">{Math.round(match.explanation.locationScore * 100)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Taille:</span>{' '}
                          <span className="font-medium">{Math.round(match.explanation.sizeScore * 100)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Caractéristiques:</span>{' '}
                          <span className="font-medium">{Math.round(match.explanation.featuresScore * 100)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Cohérence prix:</span>{' '}
                          <span className="font-medium">{Math.round(match.explanation.priceCoherenceScore * 100)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link to={`/tenant/${tenantId}/properties/${match.propertyId}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-2" />
                          Voir les détails
                        </Button>
                      </Link>
                      {shortlistedProperties.has(match.propertyId) ? (
                        <Button variant="outline" size="sm" disabled>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Ajouté à la shortlist
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleAddToShortlist(
                              match.propertyId,
                              match.matchScore,
                              match.explanation
                            )
                          }
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Ajouter à la shortlist
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {matches.length === 0 && !loading && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Search className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Aucune correspondance trouvée
          </h3>
          <p className="text-gray-600">
            Cliquez sur "Rechercher des correspondances" pour trouver des propriétés correspondant aux critères de ce deal
          </p>
        </div>
      )}
    </div>
  );
};





