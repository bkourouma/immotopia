import React, { useEffect, useMemo, useState } from 'react';
import { Button, Select, Spin } from 'antd';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getSupplier, listSuppliersPage } from '../../services/finance-lot2-service';
import type { Supplier } from '../../types/finance-lot2-types';
import { t } from '../../i18n/t';

const PAGE_SIZE = 20;

interface SupplierSelectProps {
  tenantId: string | undefined;
  id: string;
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  placeholder: string;
  activeOnly?: boolean;
  enabled?: boolean;
  selectedSupplier?: Supplier;
}

/** Sélection distante : vingt choix par page, le choix courant reste visible hors page. */
export function SupplierSelect({
  tenantId,
  id,
  value,
  onChange,
  placeholder,
  activeOnly = true,
  enabled = true,
  selectedSupplier
}: SupplierSelectProps) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const list = useInfiniteQuery({
    queryKey: ['supplier-select', tenantId, search, activeOnly],
    queryFn: ({ pageParam }) =>
      listSuppliersPage(tenantId as string, {
        search,
        isActive: activeOnly ? true : undefined,
        page: pageParam,
        limit: PAGE_SIZE
      }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      last.items.length > 0 && pages.reduce((count, page) => count + page.items.length, 0) < last.total
        ? pages.length + 1
        : undefined,
    enabled: Boolean(tenantId) && enabled
  });

  const suppliers = useMemo(() => list.data?.pages.flatMap(page => page.items) ?? [], [list.data]);
  const currentInPage = suppliers.find(supplier => supplier.id === value);
  const selected = useQuery({
    queryKey: ['supplier-select-detail', tenantId, value],
    queryFn: () => getSupplier(tenantId as string, value as string),
    enabled: Boolean(tenantId && value && !currentInPage && !selectedSupplier)
  });
  const current = currentInPage ?? selectedSupplier ?? selected.data;
  const options = useMemo(() => {
    const next = suppliers.map(supplier => ({ value: supplier.id, label: supplier.name }));
    if (current && !next.some(option => option.value === current.id)) {
      next.unshift({ value: current.id, label: current.name });
    }
    return next;
  }, [suppliers, current]);

  const onPopupScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - 24 && list.hasNextPage && !list.isFetchingNextPage) {
      void list.fetchNextPage();
    }
  };

  return (
    <Select
      id={id}
      style={{ width: '100%' }}
      placeholder={placeholder}
      value={value}
      onChange={(next: string | undefined) => onChange(next)}
      options={options}
      showSearch={{ filterOption: false, onSearch: setInput }}
      onOpenChange={open => {
        if (open) {
          setInput('');
          setSearch('');
        }
      }}
      onPopupScroll={onPopupScroll}
      notFoundContent={
        list.isFetching ? (
          <Spin size="small" />
        ) : list.isError ? (
          <span>
            {t('Impossible de charger les choix.')}{' '}
            <Button type="link" size="small" onClick={() => void list.refetch()}>
              {t('Réessayer')}
            </Button>
          </span>
        ) : (
          t('Aucun résultat')
        )
      }
      loading={list.isFetching}
    />
  );
}
