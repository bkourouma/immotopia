import React, { useState, useEffect } from 'react';
import { Collaborator, CollaboratorRole, InviteCollaboratorRequest } from '../../types/tenant-types';

export const TeamPage: React.FC = () => {
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
    const [tenantId, setTenantId] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Invite form state
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<CollaboratorRole>('AGENT');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteSuccess, setInviteSuccess] = useState('');

    useEffect(() => {
        fetchUserMemberships();
    }, []);

    const fetchUserMemberships = async () => {
        try {
            const response = await fetch('/api/tenants/my-memberships', {
                credentials: 'include'
            });
            const data = await response.json();

            if (data.success && data.data.asMember && data.data.asMember.length > 0) {
                // Get the first tenant where user is a member
                const firstTenant = data.data.asMember[0].tenant;
                setTenantId(firstTenant.id);
                await fetchCollaborators(firstTenant.id);
            } else {
                setError('Vous n\'êtes pas collaborateur d\'un tenant.');
                setIsLoading(false);
            }
        } catch (err) {
            setError('Erreur lors du chargement des informations.');
            setIsLoading(false);
        }
    };

    const fetchCollaborators = async (tId: string) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/collaborators/tenant/${tId}`, {
                credentials: 'include'
            });
            const data = await response.json();

            if (data.success) {
                setCollaborators(data.data);
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError('Erreur lors du chargement de l\'équipe.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsInviting(true);
        setError('');
        setInviteSuccess('');

        try {
            const request: InviteCollaboratorRequest = {
                email: inviteEmail,
                tenantId,
                role: inviteRole
            };

            const response = await fetch('/api/collaborators/invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(request)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setInviteSuccess(`Invitation envoyée à ${inviteEmail} !`);
                setInviteEmail('');
                setInviteRole('AGENT');
                setTimeout(() => {
                    setShowInviteModal(false);
                    setInviteSuccess('');
                }, 2000);
            } else {
                setError(data.message || 'Erreur lors de l\'envoi de l\'invitation.');
            }
        } catch (err) {
            setError('Erreur lors de l\'envoi de l\'invitation.');
        } finally {
            setIsInviting(false);
        }
    };

    const handleUpdateRole = async (collaboratorId: string, newRole: CollaboratorRole) => {
        try {
            const response = await fetch(`/api/collaborators/${collaboratorId}/role`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ role: newRole })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                await fetchCollaborators(tenantId);
            } else {
                alert(data.message || 'Erreur lors de la mise à jour du rôle.');
            }
        } catch (err) {
            alert('Erreur lors de la mise à jour du rôle.');
        }
    };

    const handleRemove = async (collaboratorId: string) => {
        if (!confirm('Êtes-vous sûr de vouloir retirer ce collaborateur ?')) {
            return;
        }

        try {
            const response = await fetch(`/api/collaborators/${collaboratorId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok && data.success) {
                await fetchCollaborators(tenantId);
            } else {
                alert(data.message || 'Erreur lors de la suppression.');
            }
        } catch (err) {
            alert('Erreur lors de la suppression.');
        }
    };

    const getRoleBadgeColor = (role: CollaboratorRole) => {
        switch (role) {
            case 'ADMIN':
                return 'bg-red-100 text-red-800';
            case 'MANAGER':
                return 'bg-blue-100 text-blue-800';
            case 'AGENT':
                return 'bg-green-100 text-green-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getRoleLabel = (role: CollaboratorRole) => {
        switch (role) {
            case 'ADMIN':
                return 'Administrateur';
            case 'MANAGER':
                return 'Manager';
            case 'AGENT':
                return 'Agent';
            default:
                return role;
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Chargement...</p>
                </div>
            </div>
        );
    }

    if (error && !tenantId) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="md:flex md:items-center md:justify-between mb-8">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-3xl font-bold text-gray-900">
                            Gestion de l'équipe
                        </h1>
                        <p className="mt-2 text-sm text-gray-600">
                            Invitez et gérez les membres de votre équipe
                        </p>
                    </div>
                    <div className="mt-4 flex md:mt-0 md:ml-4">
                        <button
                            onClick={() => setShowInviteModal(true)}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            + Inviter un collaborateur
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 rounded-md bg-red-50 p-4">
                        <p className="text-sm text-red-800">{error}</p>
                    </div>
                )}

                {/* Team Members List */}
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <ul className="divide-y divide-gray-200">
                        {collaborators.length === 0 ? (
                            <li className="px-6 py-8 text-center text-gray-500">
                                Aucun collaborateur pour le moment. Invitez votre première personne !
                            </li>
                        ) : (
                            collaborators.map((collaborator) => (
                                <li key={collaborator.id} className="px-6 py-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center flex-1">
                                            <div className="flex-shrink-0">
                                                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                                    <span className="text-gray-600 font-medium text-sm">
                                                        {collaborator.user?.fullName?.charAt(0).toUpperCase() ||
                                                            collaborator.user?.email.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                <h3 className="text-sm font-medium text-gray-900">
                                                    {collaborator.user?.fullName || 'Utilisateur'}
                                                </h3>
                                                <p className="text-sm text-gray-500">{collaborator.user?.email}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center space-x-4">
                                            {/* Role Badge */}
                                            <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeColor(collaborator.role)}`}>
                                                {getRoleLabel(collaborator.role)}
                                            </span>

                                            {/* Role Change Dropdown */}
                                            <select
                                                value={collaborator.role}
                                                onChange={(e) => handleUpdateRole(collaborator.id, e.target.value as CollaboratorRole)}
                                                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="ADMIN">Administrateur</option>
                                                <option value="MANAGER">Manager</option>
                                                <option value="AGENT">Agent</option>
                                            </select>

                                            {/* Remove Button */}
                                            <button
                                                onClick={() => handleRemove(collaborator.id)}
                                                className="text-red-600 hover:text-red-900 text-sm font-medium"
                                            >
                                                Retirer
                                            </button>
                                        </div>
                                    </div>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed z-10 inset-0 overflow-y-auto">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowInviteModal(false)}></div>

                        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
                            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                                Inviter un collaborateur
                            </h3>

                            {inviteSuccess && (
                                <div className="mb-4 rounded-md bg-green-50 p-4">
                                    <p className="text-sm text-green-800">{inviteSuccess}</p>
                                </div>
                            )}

                            <form onSubmit={handleInvite} className="space-y-4">
                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                        Adresse email
                                    </label>
                                    <input
                                        type="email"
                                        id="email"
                                        required
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        placeholder="collaborateur@example.com"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                                        Rôle
                                    </label>
                                    <select
                                        id="role"
                                        value={inviteRole}
                                        onChange={(e) => setInviteRole(e.target.value as CollaboratorRole)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    >
                                        <option value="AGENT">Agent</option>
                                        <option value="MANAGER">Manager</option>
                                        <option value="ADMIN">Administrateur</option>
                                    </select>
                                </div>

                                <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                                    <button
                                        type="submit"
                                        disabled={isInviting}
                                        className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:col-start-2 sm:text-sm disabled:opacity-50"
                                    >
                                        {isInviting ? 'Envoi...' : 'Envoyer l\'invitation'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowInviteModal(false)}
                                        className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:col-start-1 sm:text-sm"
                                    >
                                        Annuler
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

