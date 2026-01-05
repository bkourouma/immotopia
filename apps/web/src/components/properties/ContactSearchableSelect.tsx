import React, { useState, useEffect, useRef } from 'react';
import { Input } from '../ui/input';
import { User, X, Loader2 } from 'lucide-react';
import { Contact } from '../../types/crm-types';
import { listContacts } from '../../services/crm-service';

interface ContactSearchableSelectProps {
  tenantId: string;
  value: string;
  onChange: (contactId: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const ContactSearchableSelect: React.FC<ContactSearchableSelectProps> = ({
  tenantId,
  value,
  onChange,
  placeholder = 'Rechercher un contact...',
  disabled = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load contacts on mount
  useEffect(() => {
    if (tenantId) {
      loadContacts();
    }
  }, [tenantId]);

  // Load selected contact if value is provided
  useEffect(() => {
    if (value && contacts.length > 0) {
      const contact = contacts.find((c) => c.id === value);
      if (contact) {
        setSelectedContact(contact);
        setSearchQuery(`${contact.firstName} ${contact.lastName}${contact.email ? ` (${contact.email})` : ''}`);
      }
    } else if (!value) {
      setSelectedContact(null);
      setSearchQuery('');
    }
  }, [value, contacts]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const response = await listContacts(tenantId, { page: 1, limit: 500 });
      if (response.success) {
        setContacts(response.contacts || []);
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter contacts based on search query
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setFilteredContacts([]);
      setIsOpen(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      const query = searchQuery.toLowerCase();
      const filtered = contacts.filter(
        (contact) =>
          contact.firstName?.toLowerCase().includes(query) ||
          contact.lastName?.toLowerCase().includes(query) ||
          contact.email?.toLowerCase().includes(query) ||
          contact.phone?.toLowerCase().includes(query)
      );
      setFilteredContacts(filtered);
      setIsOpen(filtered.length > 0);
    }, 200);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, contacts]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (contact: Contact) => {
    setSelectedContact(contact);
    setSearchQuery(`${contact.firstName} ${contact.lastName}${contact.email ? ` (${contact.email})` : ''}`);
    setIsOpen(false);
    onChange(contact.id);
  };

  const handleClear = () => {
    setSelectedContact(null);
    setSearchQuery('');
    setFilteredContacts([]);
    setIsOpen(false);
    onChange('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!query && selectedContact) {
      handleClear();
    }
  };

  const handleInputFocus = () => {
    if (searchQuery.trim().length > 0 && filteredContacts.length > 0) {
      setIsOpen(true);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled || loading}
          className="pl-10 pr-10"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        )}
        {selectedContact && !loading && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && filteredContacts.length > 0 && (
        <div className="absolute z-[9999] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredContacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => handleSelect(contact)}
              className="w-full text-left px-4 py-2 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
            >
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-400" />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {contact.firstName} {contact.lastName}
                  </div>
                  {contact.email && (
                    <div className="text-sm text-gray-500">{contact.email}</div>
                  )}
                  {contact.phone && (
                    <div className="text-xs text-gray-400">{contact.phone}</div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && searchQuery.trim().length > 0 && filteredContacts.length === 0 && !loading && (
        <div className="absolute z-[9999] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-4 text-center text-gray-500">
          Aucun contact trouvé
        </div>
      )}
    </div>
  );
};





