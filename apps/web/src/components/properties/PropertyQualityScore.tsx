import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Star, AlertCircle, CheckCircle, RefreshCw, Loader2 } from 'lucide-react';
import { getQualityScore } from '../../services/property-service';

interface PropertyQualityScoreProps {
  propertyId: string;
  tenantId: string;
}

interface QualityScoreData {
  score: number;
  suggestions: string[];
  breakdown: {
    requiredFields: number;
    media: number;
    geolocation: number;
    description: number;
  };
}

export const PropertyQualityScore: React.FC<PropertyQualityScoreProps> = ({
  propertyId,
  tenantId,
}) => {
  const [qualityScore, setQualityScore] = useState<QualityScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    loadQualityScore();
  }, [propertyId, tenantId]);

  const loadQualityScore = async () => {
    setLoading(true);
    try {
      const score = await getQualityScore(tenantId, propertyId);
      setQualityScore(score);
    } catch (error) {
      console.error('Error loading quality score:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const score = await getQualityScore(tenantId, propertyId, true);
      setQualityScore(score);
    } catch (error) {
      console.error('Error recalculating quality score:', error);
      alert('Erreur lors du recalcul du score');
    } finally {
      setRecalculating(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    if (score >= 40) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Bon';
    if (score >= 40) return 'Moyen';
    return 'À améliorer';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!qualityScore) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">Score de qualité non disponible</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Score de qualité</h3>
          <p className="text-sm text-gray-600 mt-1">
            Évaluation automatique de la complétude de votre annonce
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecalculate}
          disabled={recalculating}
        >
          {recalculating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Calcul...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Recalculer
            </>
          )}
        </Button>
      </div>

      {/* Overall Score */}
      <div className={`border-2 rounded-lg p-6 mb-6 ${getScoreColor(qualityScore.score)}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium mb-1">Score global</div>
            <div className="text-4xl font-bold">{qualityScore.score}/100</div>
            <div className="text-sm mt-1">{getScoreLabel(qualityScore.score)}</div>
          </div>
          <div className="flex items-center">
            <Star className="h-12 w-12" />
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Détail du score</h4>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Champs requis (40%)</span>
              <span className="font-medium">{qualityScore.breakdown.requiredFields}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${qualityScore.breakdown.requiredFields}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Médias (30%)</span>
              <span className="font-medium">{qualityScore.breakdown.media}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{ width: `${qualityScore.breakdown.media}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Géolocalisation (20%)</span>
              <span className="font-medium">{qualityScore.breakdown.geolocation}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full"
                style={{ width: `${qualityScore.breakdown.geolocation}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Description (10%)</span>
              <span className="font-medium">{qualityScore.breakdown.description}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-orange-600 h-2 rounded-full"
                style={{ width: `${qualityScore.breakdown.description}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Suggestions */}
      {qualityScore.suggestions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            <AlertCircle className="h-4 w-4 mr-2" />
            Suggestions d'amélioration
          </h4>
          <div className="space-y-2">
            {qualityScore.suggestions.map((suggestion, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg"
              >
                <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700">{suggestion}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {qualityScore.suggestions.length === 0 && qualityScore.score >= 80 && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="text-sm text-green-800 font-medium">
            Excellent ! Votre annonce est complète et bien renseignée.
          </span>
        </div>
      )}
    </div>
  );
};





