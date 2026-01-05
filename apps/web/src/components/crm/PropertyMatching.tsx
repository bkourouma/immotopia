import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { PropertyMatchCard } from './PropertyMatchCard';
import {
  matchProperties,
  getMatches,
  addPropertyToShortlist,
  updatePropertyStatus,
  PropertyMatch,
  CrmDealPropertyStatus,
} from '../../services/crm-service';
import { Search } from 'lucide-react';

interface PropertyMatchingProps {
  tenantId: string;
  dealId: string;
}

export const PropertyMatching: React.FC<PropertyMatchingProps> = ({ tenantId, dealId }) => {
  const [matches, setMatches] = useState<PropertyMatch[]>([]);
  const [shortlist, setShortlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(40);

  useEffect(() => {
    loadShortlist();
  }, [tenantId, dealId]);

  const loadShortlist = async () => {
    try {
      const response = await getMatches(tenantId, dealId);
      if (response.success) {
        setShortlist(response.matches);
      }
    } catch (err: any) {
      console.error('Error loading shortlist:', err);
    }
  };

  const handleMatch = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await matchProperties(tenantId, dealId, threshold, 10);
      if (response.success) {
        setMatches(response.matches);
      } else {
        setError('Error matching properties');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error matching properties');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToShortlist = async (match: PropertyMatch) => {
    try {
      const response = await addPropertyToShortlist(
        tenantId,
        dealId,
        match.propertyId,
        match.matchScore || 0,
        match.matchExplanation
      );
      if (response.success) {
        await loadShortlist();
        // Remove from matches list
        setMatches(matches.filter((m) => m.propertyId !== match.propertyId));
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error adding to shortlist');
    }
  };

  const handleStatusChange = async (propertyId: string, status: CrmDealPropertyStatus) => {
    try {
      await updatePropertyStatus(tenantId, dealId, propertyId, status);
      await loadShortlist();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error updating status');
    }
  };

  const shortlistPropertyIds = new Set(shortlist.map((item) => item.propertyId));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Property Matching</h2>
        <div className="flex gap-2">
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
            className="w-20 px-2 py-1 border rounded text-sm"
            min="0"
            max="100"
          />
          <Button onClick={handleMatch} disabled={loading}>
            <Search className="h-4 w-4 mr-2" />
            {loading ? 'Matching...' : 'Find Matches'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Shortlist */}
      {shortlist.length > 0 && (
        <div>
          <h3 className="text-lg font-medium mb-3">Shortlist ({shortlist.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shortlist.map((item) => (
              <PropertyMatchCard
                key={item.id}
                match={{
                  propertyId: item.propertyId,
                  matchScore: item.matchScore,
                  matchExplanation: item.matchExplanationJson,
                }}
                isInShortlist
                currentStatus={item.status}
                onStatusChange={(status) => handleStatusChange(item.propertyId, status)}
              />
            ))}
          </div>
        </div>
      )}

      {/* New Matches */}
      {matches.length > 0 && (
        <div>
          <h3 className="text-lg font-medium mb-3">Suggested Matches ({matches.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matches
              .filter((match) => !shortlistPropertyIds.has(match.propertyId))
              .map((match) => (
                <PropertyMatchCard
                  key={match.propertyId}
                  match={match}
                  onAddToShortlist={() => handleAddToShortlist(match)}
                />
              ))}
          </div>
        </div>
      )}

      {matches.length === 0 && shortlist.length === 0 && !loading && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No matches yet</h3>
          <p className="text-gray-600 mb-4">Click "Find Matches" to search for properties matching this deal.</p>
          <Button onClick={handleMatch}>
            <Search className="h-4 w-4 mr-2" />
            Find Matches
          </Button>
        </div>
      )}
    </div>
  );
};

