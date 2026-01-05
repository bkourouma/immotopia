import React from 'react';
import { Button } from '../ui/button';
import { PropertyMatch, CrmDealPropertyStatus } from '../../types/crm-types';
import { Home, MapPin, DollarSign, Ruler } from 'lucide-react';

interface PropertyMatchCardProps {
  match: PropertyMatch;
  onAddToShortlist?: () => void;
  onStatusChange?: (status: CrmDealPropertyStatus) => void;
  isInShortlist?: boolean;
  currentStatus?: CrmDealPropertyStatus;
}

export const PropertyMatchCard: React.FC<PropertyMatchCardProps> = ({
  match,
  onAddToShortlist,
  onStatusChange,
  isInShortlist = false,
  currentStatus,
}) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-blue-100 text-blue-800';
    if (score >= 40) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const explanation = match.matchExplanation as any;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <Home className="h-5 w-5 text-gray-600" />
          <span className="font-medium text-gray-900">Property {match.propertyId}</span>
        </div>
        {match.matchScore !== null && match.matchScore !== undefined && (
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${getScoreColor(match.matchScore)}`}>
            {match.matchScore}/100
          </div>
        )}
      </div>

      {explanation && (
        <div className="mb-3 space-y-1 text-sm">
          {explanation.budgetFit !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-600">Budget:</span>
              <span className="font-medium">{explanation.budgetFit}/30</span>
            </div>
          )}
          {explanation.zoneFit !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-600">Zone:</span>
              <span className="font-medium">{explanation.zoneFit}/25</span>
            </div>
          )}
          {explanation.sizeFit !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-600">Size:</span>
              <span className="font-medium">{explanation.sizeFit}/25</span>
            </div>
          )}
          {explanation.extrasFit !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-600">Extras:</span>
              <span className="font-medium">{explanation.extrasFit}/20</span>
            </div>
          )}
          {explanation.breakdown && (
            <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
              {explanation.breakdown}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        {!isInShortlist && onAddToShortlist && (
          <Button size="sm" onClick={onAddToShortlist}>
            Add to Shortlist
          </Button>
        )}
        {isInShortlist && onStatusChange && (
          <select
            value={currentStatus || 'SHORTLISTED'}
            onChange={(e) => onStatusChange(e.target.value as CrmDealPropertyStatus)}
            className="text-xs border rounded px-2 py-1"
          >
            <option value="SHORTLISTED">Shortlisted</option>
            <option value="PROPOSED">Proposed</option>
            <option value="VISITED">Visited</option>
            <option value="SELECTED">Selected</option>
            <option value="REJECTED">Rejected</option>
          </select>
        )}
      </div>
    </div>
  );
};





