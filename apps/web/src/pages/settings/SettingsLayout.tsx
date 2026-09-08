import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';

export const SettingsLayout: React.FC = () => {
  return (
    <>
      <Outlet />
    </>
  );
};
