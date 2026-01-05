import React from 'react';
import { Search, Globe, Bell, User, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="sticky top-0 z-40 h-16 border-b bg-white">
      <div className="flex h-full items-center justify-between px-6">
        {/* Left Section - Search */}
        <div className="flex items-center gap-4">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              placeholder="Rechercher propriétés, clients, documents..."
              className="pl-10"
            />
          </div>
        </div>

        {/* Right Section - User Controls */}
        <div className="flex items-center gap-4">
          {/* Language Selector */}
          <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100">
            <Globe className="h-4 w-4" />
            <span>FR</span>
          </button>

          {/* Notifications */}
          <button className="relative rounded-lg p-2 text-slate-700 transition-colors hover:bg-slate-100">
            <Bell className="h-5 w-5" />
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full p-0 text-xs"
            >
              3
            </Badge>
          </button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-slate-100">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatarUrl || undefined} alt={user?.fullName || user?.email} />
                <AvatarFallback className="bg-blue-600 text-white text-xs">
                  {user?.fullName ? getInitials(user.fullName) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <p className="text-sm font-medium text-slate-900">
                  {user?.fullName || 'Utilisateur'}
                </p>
                <p className="text-xs text-slate-500">
                  {user?.globalRole === 'SUPER_ADMIN' ? 'Administrateur' : 'Utilisateur'}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings/profile')}>
                <User className="mr-2 h-4 w-4" />
                <span>Profil</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <SettingsIcon className="mr-2 h-4 w-4" />
                <span>Paramètres</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Déconnexion</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

