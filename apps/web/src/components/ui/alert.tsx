import React from 'react';
import { cn } from '../../lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive';
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          'relative w-full rounded-lg border p-4',
          variant === 'destructive'
            ? 'border-error-bg bg-error-bg text-error-text'
            : 'border-line-subtle bg-surface-page text-content-primary',
          className
        )}
        {...props}
      />
    );
  }
);
Alert.displayName = 'Alert';

export type AlertDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

export const AlertDescription = React.forwardRef<HTMLParagraphElement, AlertDescriptionProps>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn('text-small [&_p]:leading-relaxed', className)} {...props} />;
  }
);
AlertDescription.displayName = 'AlertDescription';
