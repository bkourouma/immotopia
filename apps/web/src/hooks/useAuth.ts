import { useContext } from 'react';
import AuthContext from '../context/AuthContext';
import { AuthContextType } from '../types/auth-types';

/**
 * Hook to access authentication context
 * @returns AuthContextType
 * @throws Error if used outside AuthProvider
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

