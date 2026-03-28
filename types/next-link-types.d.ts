declare module 'next/link' {
  import type { LinkProps as NextLinkProps } from 'next/dist/client/link';
  import type { UrlObject } from 'url';
  import type { AnchorHTMLAttributes, ReactNode, RefAttributes, ForwardRefExoticComponent } from 'react';

  type Url = string | UrlObject;

  export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof NextLinkProps>, NextLinkProps {
    href: Url;
    children?: ReactNode;
  }

  const Link: ForwardRefExoticComponent<LinkProps & RefAttributes<HTMLAnchorElement>>;
  export default Link;
}
