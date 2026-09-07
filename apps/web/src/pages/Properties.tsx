import React from 'react';
import { DashboardLayout } from '../components/dashboard/dashboard-layout';
import { Building2, Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

export const Properties: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Propriétés</h1>
            <p className="mt-2 text-sm text-slate-600">
              Gérez toutes vos propriétés immobilières
            </p>
          </div>
          <Link to="/properties/new">
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Ajouter une propriété
            </Button>
          </Link>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                placeholder="Rechercher une propriété..."
                className="pl-10"
              />
            </div>
            <Button variant="outline">Filtres</Button>
          </div>
        </div>

        {/* Properties Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Example Property Card */}
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-48 bg-slate-200 flex items-center justify-center">
                <Building2 className="h-16 w-16 text-slate-400" />
              </div>
              <div className="p-5">
                <h3 className="text-lg font-semibold text-slate-900">
                  Villa Moderne à Cocody
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  3 chambres • 2 salles de bain • 250 m²
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-2xl font-bold text-blue-600">
                    25 000 000 FCFA
                  </span>
                  <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                    Disponible
                  </span>
                </div>
                <div className="mt-4">
                  <Link
                    to={`/properties/${item}`}
                    className="block w-full text-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 transition-colors"
                  >
                    Voir les détails
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

